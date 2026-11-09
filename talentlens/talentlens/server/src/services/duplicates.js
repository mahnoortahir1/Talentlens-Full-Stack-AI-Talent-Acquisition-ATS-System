/**
 * Duplicate candidate detection using normalised contact details and document similarity.
 * Produces candidate pairs with reasons; merging always requires a recruiter's confirmation.
 */
import { cosine } from './embeddings.js';

export function normalizeEmail(email = '') {
  const e = String(email).trim().toLowerCase();
  const [local, domain] = e.split('@');
  if (!domain) return e;
  let l = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') l = l.replace(/\./g, '');
  return `${l}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}

/** Keep the last 10 digits so "+92 300 1234567" and "0300-1234567" compare equal. */
export function normalizePhone(phone = '') {
  const d = String(phone).replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : '';
}

export function normalizeName(name = '') {
  return String(name).toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
}

function shingles(text, k = 3) {
  const words = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i <= words.length - k; i++) set.add(words.slice(i, i + k).join(' '));
  return set;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * @param records [{ id, name, email, phone, text, embedding }]
 * @returns pairs [{ a, b, score, reasons[] }] sorted by score desc
 */
export function findDuplicatePairs(records, { threshold = 0.6 } = {}) {
  const prepared = records.map((r) => ({ ...r, nEmail: normalizeEmail(r.email), nPhone: normalizePhone(r.phone), nName: normalizeName(r.name), sh: shingles(r.text || '') }));
  const pairs = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i], b = prepared[j];
      const reasons = [];
      let score = 0;
      if (a.nEmail && a.nEmail === b.nEmail) { score += 0.6; reasons.push('Same email after normalisation'); }
      if (a.nPhone && a.nPhone === b.nPhone) { score += 0.4; reasons.push('Same phone number'); }
      if (a.nName && a.nName === b.nName) { score += 0.2; reasons.push('Same name'); }
      const textSim = jaccard(a.sh, b.sh);
      const embSim = a.embedding?.length && b.embedding?.length ? cosine(a.embedding, b.embedding) : 0;
      const docSim = Math.max(textSim, embSim > 0.97 ? embSim : 0);
      if (docSim >= 0.5) { score += 0.4 * docSim; reasons.push(`Resume text ${Math.round(docSim * 100)}% similar`); }
      if (score >= threshold) pairs.push({ a: a.id, b: b.id, score: Math.min(1, Math.round(score * 100) / 100), reasons, documentSimilarity: Math.round(docSim * 100) / 100 });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
