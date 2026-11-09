/**
 * Counterfactual fairness check: re-run the full parse -> embed -> score pipeline on copies of
 * the resume where only protected / irrelevant attributes are changed (name, gender, age,
 * nationality, religion, marital status). A fair pipeline should give (near) identical scores.
 */
import { buildProfileFromText } from './profilePipeline.js';
import { scoreCandidate, scoringView } from './matcher.js';
import { embed } from './embeddings.js';

const VARIANTS = [
  { label: 'Different name (female-coded)', apply: (t) => replaceName(t, 'Ayesha Khan') },
  { label: 'Different name (male-coded)', apply: (t) => replaceName(t, 'Daniel Okafor') },
  { label: 'Gender stated: Female', apply: (t) => insertAfterFirstLine(t, 'Gender: Female') },
  { label: 'Gender stated: Male', apply: (t) => insertAfterFirstLine(t, 'Gender: Male') },
  { label: 'Age stated: 52', apply: (t) => insertAfterFirstLine(t, 'Age: 52') },
  { label: 'Nationality & religion stated', apply: (t) => insertAfterFirstLine(t, 'Nationality: Nigerian\nReligion: Christian') },
  { label: 'Marital status stated', apply: (t) => insertAfterFirstLine(t, 'Marital Status: Married') },
];

function replaceName(text, newName) {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l.trim());
  if (idx >= 0) lines[idx] = newName;
  return lines.join('\n');
}
function insertAfterFirstLine(text, extra) {
  const lines = text.split('\n');
  const idx = Math.max(0, lines.findIndex((l) => l.trim()));
  lines.splice(idx + 1, 0, extra);
  return lines.join('\n');
}

export async function fairnessCheck(job, resumeText, { tolerance = 1 } = {}) {
  const baseProfile = await buildProfileFromText(resumeText);
  const base = await scoreCandidate(job, scoringView(baseProfile), { embedFn: embed });
  const variants = [];
  for (const v of VARIANTS) {
    const prof = await buildProfileFromText(v.apply(resumeText));
    const res = await scoreCandidate(job, scoringView(prof), { embedFn: embed });
    variants.push({ label: v.label, score: res.score, delta: res.score - base.score });
  }
  const maxDelta = Math.max(...variants.map((v) => Math.abs(v.delta)));
  return {
    baseline: base.score,
    variants,
    maxDelta,
    passed: maxDelta <= tolerance,
    excludedFromScoring: ['name', 'email', 'phone', 'links', 'gender', 'age / date of birth', 'nationality', 'religion', 'marital status', 'photo', 'location'],
    checkedAt: new Date(),
  };
}
