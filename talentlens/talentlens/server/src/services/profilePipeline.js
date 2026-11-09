/** Resume text -> parsed structure -> semantic chunks with embeddings. */
import { parseResumeText, chunkText } from './resumeParser.js';
import { embed, embeddingModelName } from './embeddings.js';

/**
 * Split a resume into chunks. Falls back to chunking the whole text when section-based
 * chunking yields nothing (e.g. only a "personal" section was detected), so every parsed
 * CV always gets searchable chunks.
 */
function makeChunks(sanitizedText, sections) {
  const bySection = chunkText(sanitizedText, sections || {});
  return bySection.length ? bySection : chunkText(sanitizedText || '', {});
}

export async function buildProfileFromText(text) {
  const parsed = parseResumeText(text);
  if (parsed.status !== 'parsed') return { parsed, chunks: [], embedding: [], embeddingModel: null };
  const pieces = makeChunks(parsed.sanitizedText, parsed.sections);
  const vectors = await embed([parsed.sanitizedText.slice(0, 2000), ...pieces.map((c) => c.text)]);
  return {
    parsed,
    embedding: vectors[0] || [],
    chunks: pieces.map((c, i) => ({ ...c, embedding: vectors[i + 1] })),
    embeddingModel: embeddingModelName(),
  };
}

/**
 * Make sure a stored profile's embeddings exist and come from the active embedding provider
 * (vectors from different models are not comparable). Re-embeds and saves when needed.
 * Load the profile with '+chunks +embedding +parsed.sanitizedText' so the whole-resume
 * embedding can be rebuilt from the real text.
 */
export async function ensureIndexed(profile) {
  if (!profile) return profile;
  const text = profile.parsed?.sanitizedText || '';
  let chunks = profile.chunks || [];
  if (!chunks.length) {
    // Parsed CV that was saved without chunks: build them now so it becomes searchable.
    if (profile.resume?.status !== 'parsed' || !text) return profile;
    chunks = makeChunks(text, {});
    if (!chunks.length) return profile;
  }
  await embed(['index-check']); // resolves the active provider (including any fallback)
  const upToDate = profile.chunks?.length && profile.embeddingModel === embeddingModelName()
    && profile.chunks.every((c) => c.embedding?.length) && profile.embedding?.length;
  if (upToDate) return profile;
  const docText = text.slice(0, 2000) || chunks.map((c) => c.text).join('\n').slice(0, 2000);
  const vectors = await embed([docText, ...chunks.map((c) => c.text)]);
  profile.embedding = vectors[0];
  profile.chunks = chunks.map((c, i) => ({ section: c.section, text: c.text, embedding: vectors[i + 1] }));
  profile.embeddingModel = embeddingModelName();
  await profile.save();
  return profile;
}
