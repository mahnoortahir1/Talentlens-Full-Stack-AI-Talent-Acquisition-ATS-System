/**
 * Thin LLM client (Gemini or OpenAI) that returns parsed JSON.
 * Returns null when no key is configured or the call fails; callers then use their
 * deterministic, data-driven fallback and record which source produced the output.
 */
import { config } from '../config.js';

export const llmAvailable = () => Boolean(config.geminiApiKey || config.openaiApiKey);
export const llmName = () => (config.geminiApiKey ? `gemini:${config.geminiModel}` : config.openaiApiKey ? `openai:${config.openaiModel}` : null);

function parseJson(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(trimmed); } catch { /* try to locate a JSON object inside */ }
  const m = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callGemini(system, prompt, { temperature = 0.4, seed } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', ...(seed != null ? { seed } : {}) },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

async function callOpenAI(system, prompt, { temperature = 0.4, seed } = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: config.openaiModel,
      temperature,
      ...(seed != null ? { seed } : {}),
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * @param opts.temperature sampling temperature (default 0.4; higher = more varied output)
 * @param opts.seed        optional sampling seed so each call can be made deliberately different
 * Tries Gemini first, then OpenAI if Gemini fails and an OpenAI key is configured.
 */
export async function generateJSON(system, prompt, opts = {}) {
  if (!llmAvailable()) return null;
  const providers = [config.geminiApiKey && ['gemini', callGemini], config.openaiApiKey && ['openai', callOpenAI]].filter(Boolean);
  for (const [name, call] of providers) {
    try {
      const parsed = parseJson(await call(system, prompt, opts));
      if (parsed) return parsed;
      console.warn(`[llm] ${name} returned no parseable JSON`);
    } catch (err) {
      console.warn(`[llm] ${name} request failed: ${err.message}`);
    }
  }
  return null;
}

export { parseJson };
