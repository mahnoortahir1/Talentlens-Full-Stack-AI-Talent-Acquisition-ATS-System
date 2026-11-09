/**
 * Extract structured requirements (required/preferred skills with importance, experience,
 * qualifications) from a free-text job description. Uses the LLM when configured and
 * always runs the rule-based extractor too: LLM skills are verified against the text,
 * and anything the text does not support is flagged rather than silently trusted.
 */
import { findSkillsInText, normalizeSkill, findEvidenceFor } from './skills.js';
import { generateJSON, llmName } from './llm.js';

const REQUIRED_CUES = /\b(must|required|requirements?|need to|needs|strong|proficien\w*|expert\w*|solid|deep|hands[- ]on|minimum|essential|responsibilit\w*|you will|qualifications)\b/i;
const PREFERRED_CUES = /\b(nice[- ]to[- ]have|preferred|prefer|plus|bonus|good[- ]to[- ]have|familiar\w*|exposure|desirable|ideally|optional)\b/i;
const STRONG_CUES = /\b(strong|expert\w*|deep|advanced|extensive|proficien\w*|production)\b/i;

const DEGREE_RE = /\b(bachelor'?s?|master'?s?|ph\.?d|bs|bsc|ms|msc|degree)\b[^.\n;]*/i;

export function extractRequirementsRuleBased(description = '') {
  const lines = description.split(/\n|(?<=[.;])\s+/).map((l) => l.trim()).filter(Boolean);
  let mode = 'required';
  const skills = new Map();

  for (const line of lines) {
    const isHeader = line.length < 50 && /:$|^#+|^[A-Z][A-Za-z ]+$/.test(line);
    if (isHeader && PREFERRED_CUES.test(line)) { mode = 'preferred'; continue; }
    if (isHeader && REQUIRED_CUES.test(line)) { mode = 'required'; continue; }
    const lineMode = PREFERRED_CUES.test(line) ? 'preferred' : REQUIRED_CUES.test(line) ? 'required' : mode;
    for (const hit of findSkillsInText(line)) {
      const importance = lineMode === 'required' ? (STRONG_CUES.test(line) ? 5 : 4) : 2;
      const prev = skills.get(hit.name);
      // A skill stated as required anywhere stays required.
      if (!prev || (prev.kind === 'preferred' && lineMode === 'required') || (prev.kind === lineMode && importance > prev.importance)) {
        skills.set(hit.name, { name: hit.name, importance, kind: lineMode, evidence: line });
      }
    }
  }

  const years = [...description.matchAll(/(\d{1,2})\s*\+?\s*(?:-|to)?\s*(\d{1,2})?\s*\+?\s*years?/gi)].map((m) => Number(m[1])).filter((y) => y > 0 && y < 30);
  const degree = description.match(DEGREE_RE);

  const all = [...skills.values()];
  return {
    requiredSkills: all.filter((s) => s.kind === 'required').map(({ name, importance, evidence }) => ({ name, importance, evidence })),
    preferredSkills: all.filter((s) => s.kind === 'preferred').map(({ name, importance, evidence }) => ({ name, importance, evidence })),
    minExperienceYears: years.length ? Math.min(...years) : 0,
    qualifications: degree ? [degree[0].trim().replace(/[,.]$/, '')] : [],
    source: 'rules',
  };
}

const SYSTEM = 'You extract hiring requirements from job descriptions. Only include requirements explicitly stated or clearly implied by the text. Return strict JSON.';

export async function extractRequirements(description) {
  const rules = extractRequirementsRuleBased(description);
  const llm = await generateJSON(SYSTEM, `Job description:\n"""${description.slice(0, 6000)}"""\n\nReturn JSON: {"requiredSkills":[{"name":string,"importance":1-5}],"preferredSkills":[{"name":string,"importance":1-5}],"minExperienceYears":number,"qualifications":[string]}`);
  if (!llm || !Array.isArray(llm.requiredSkills)) return rules;

  const verify = (s) => {
    const name = normalizeSkill(s.name);
    if (!name) return null;
    const evidence = findEvidenceFor(name, description) || (description.toLowerCase().includes(String(s.name).toLowerCase()) ? String(s.name) : null);
    return { name, importance: Math.min(5, Math.max(1, Number(s.importance) || 3)), evidence, unverified: !evidence };
  };
  const dedupe = (arr) => [...new Map(arr.filter(Boolean).map((s) => [s.name, s])).values()];
  const required = dedupe(llm.requiredSkills.map(verify));
  const requiredNames = new Set(required.map((s) => s.name));
  // Merge: keep rule-based finds the LLM missed.
  rules.requiredSkills.forEach((s) => { if (!requiredNames.has(s.name)) { required.push(s); requiredNames.add(s.name); } });
  const preferred = dedupe([...(llm.preferredSkills || []).map(verify), ...rules.preferredSkills]).filter((s) => !requiredNames.has(s.name));

  return {
    requiredSkills: required,
    preferredSkills: preferred,
    minExperienceYears: Number(llm.minExperienceYears) >= 0 ? Number(llm.minExperienceYears) : rules.minExperienceYears,
    qualifications: Array.isArray(llm.qualifications) && llm.qualifications.length ? llm.qualifications.map(String).slice(0, 5) : rules.qualifications,
    source: llmName(),
  };
}
