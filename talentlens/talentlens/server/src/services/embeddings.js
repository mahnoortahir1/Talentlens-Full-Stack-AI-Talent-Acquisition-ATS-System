/**
 * Embedding service with pluggable providers.
 *  - local : Sentence-Transformers all-MiniLM-L6-v2 running in Node via transformers.js (default)
 *  - openai: text-embedding-3-small
 *  - gemini: text-embedding-004
 *  - hash  : deterministic feature-hashing of skill-normalised tokens + char n-grams.
 *            Offline fallback used in tests or if a model cannot be loaded. Still tolerant of
 *            wording differences (synonyms, morphology) but weaker than a neural model.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { normalizeSkill, findSkillsInText } from './skills.js';

const DIM_HASH = 384;
const cache = new Map();
const CACHE_MAX = 5000;
let activeProvider = null; // resolved lazily
let localPipeline = null;
let warned = false;

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const STOP = new Set('a an the and or of to in on for with at by from as is are was were be been this that these those i we you he she it they my our your their using used use via into over under within across experience years year worked working work'.split(' '));

/** Deterministic hashed embedding. Skill aliases are folded into canonical tokens first. */
export function hashEmbed(text, dim = DIM_HASH) {
  const vec = new Float32Array(dim);
  const lower = String(text || '').toLowerCase();
  const skillTokens = findSkillsInText(String(text || '')).map((s) => `skill:${s.name.toLowerCase()}`);
  const words = lower.replace(/[^a-z0-9+#.\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  const feats = [];
  for (const w of words) {
    const stem = w.replace(/(ing|ed|es|s|er|ment|ion)$/, '');
    feats.push([`w:${stem}`, 1]);
    const padded = `#${stem}#`;
    for (let i = 0; i < padded.length - 2; i++) feats.push([`g:${padded.slice(i, i + 3)}`, 0.35]);
  }
  for (const t of skillTokens) feats.push([t, 2.5]);
  for (const [f, w] of feats) {
    const h = crypto.createHash('md5').update(f).digest();
    const idx = h.readUInt32LE(0) % dim;
    vec[idx] += (h[4] & 1 ? 1 : -1) * w;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

async function loadLocal() {
  if (localPipeline) return localPipeline;
  const { pipeline, env } = await import('@huggingface/transformers');
  if (process.env.MODEL_CACHE_DIR) env.cacheDir = process.env.MODEL_CACHE_DIR;
  localPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return localPipeline;
}

async function embedLocal(texts) {
  const pipe = await loadLocal();
  const out = await pipe(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

async function embedOpenAI(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function embedGemini(texts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: texts.map((t) => ({ model: 'models/text-embedding-004', content: { parts: [{ text: t }] } })) }),
  });
  if (!res.ok) throw new Error(`Gemini embeddings failed: ${res.status}`);
  const data = await res.json();
  return data.embeddings.map((e) => e.values);
}

const PROVIDERS = { local: embedLocal, openai: embedOpenAI, gemini: embedGemini, hash: async (t) => t.map((x) => hashEmbed(x)) };

/** Override the provider at runtime (used by tests and the seed script). */
export function setEmbeddingProvider(name) {
  activeProvider = name in PROVIDERS ? name : 'hash';
}

/** Name of the provider currently in use (after any fallback). */
export const embeddingModelName = () => activeProvider || config.embeddingProvider;

/** Embed a list of texts. Falls back to the hash provider (once, with a warning) if the configured one fails. */
export async function embed(texts) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || '').slice(0, 2000));
  if (!activeProvider) activeProvider = config.embeddingProvider in PROVIDERS ? config.embeddingProvider : 'hash';
  const keyOf = (t) => `${activeProvider}:${crypto.createHash('sha1').update(t).digest('hex')}`;
  const missing = [...new Set(list.filter((t) => !cache.has(keyOf(t))))];
  if (missing.length) {
    let vectors;
    try {
      vectors = [];
      for (let i = 0; i < missing.length; i += 64) vectors.push(...(await PROVIDERS[activeProvider](missing.slice(i, i + 64))));
    } catch (err) {
      if (!warned) console.warn(`[embeddings] provider "${activeProvider}" unavailable (${err.message}); falling back to hash embeddings.`);
      warned = true;
      activeProvider = 'hash';
      return embed(list);
    }
    missing.forEach((t, i) => {
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(keyOf(t), vectors[i]);
    });
  }
  return list.map((t) => cache.get(keyOf(t)));
}

export async function embedOne(text) {
  return (await embed([text]))[0];
}

/** Similarity thresholds differ per provider because score distributions differ. */
export function semanticThresholds() {
  const p = embeddingModelName();
  if (p === 'hash') return { strong: 0.42, weak: 0.28 };
  if (p === 'local') return { strong: 0.55, weak: 0.4 };
  return { strong: 0.6, weak: 0.45 };
}

export { normalizeSkill };
