/**
 * Hallucination verification: every extracted skill or AI-generated claim must link to an
 * actual resume excerpt. Claims without support are flagged for manual review.
 */
import { findEvidenceFor } from './skills.js';
import { embed, cosine, semanticThresholds } from './embeddings.js';

/**
 * @param claims [{ claim: string, skill?: string }]
 * @param resumeText original (sanitised) resume text
 * @param chunks [{text, embedding}] optional, enables semantic support for free-text claims
 */
export async function verifyClaims(claims, resumeText, chunks = []) {
  const { strong } = semanticThresholds();
  const usable = chunks.filter((c) => c.embedding?.length);
  const free = claims.filter((c) => !c.skill);
  const vecs = free.length && usable.length ? await embed(free.map((c) => c.claim)) : [];
  let fi = 0;
  return claims.map((c) => {
    if (c.skill) {
      const excerpt = findEvidenceFor(c.skill, resumeText);
      return { ...c, supported: Boolean(excerpt), excerpt: excerpt || null, method: 'lexical' };
    }
    const v = vecs[fi++];
    if (!v) return { ...c, supported: false, excerpt: null, method: 'none' };
    let best = { sim: -1, text: null };
    for (const ch of usable) {
      const s = cosine(v, ch.embedding);
      if (s > best.sim) best = { sim: s, text: ch.text };
    }
    return { ...c, supported: best.sim >= strong, excerpt: best.sim >= strong ? best.text.slice(0, 220) : null, similarity: Math.round(best.sim * 100) / 100, method: 'semantic' };
  });
}

/** Check every skill in a profile (parser, candidate- or recruiter-added) against resume text. */
export function verifyProfileSkills(skills, resumeText) {
  return skills.map((s) => {
    const excerpt = findEvidenceFor(s.name, resumeText);
    return { name: s.name, source: s.source || 'parser', supported: Boolean(excerpt), excerpt: excerpt || null };
  });
}
