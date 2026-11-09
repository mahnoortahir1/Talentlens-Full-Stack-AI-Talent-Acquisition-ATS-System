/**
 * Explainable job-relevance scoring.
 *
 * Score = Σ weight_k · component_k, with default weights skills 50 / experience 25 /
 * projects 15 / qualifications 10. Every component returns the evidence it used, so the
 * recruiter can see *why* a candidate scored as they did. Only job-related, sanitised
 * evidence is used: names, contact details and protected attributes never reach this module.
 *
 * Skill evidence ladder (best match wins):
 *   exact (1.0) → implied by a stronger skill (0.85, e.g. Django ⇒ Python)
 *   → semantically similar resume passage (0.6 strong / 0.3 weak)
 *   → related skill in ontology (strength × 0.8, e.g. Flask ~ Django)
 *   → candidate-reported without resume excerpt (0.6, flagged for verification)
 */
import { relationStrength, impliedBy, skillCategory } from './skills.js';
import { cosine, semanticThresholds } from './embeddings.js';
import { degreeInfo } from './resumeParser.js';

export const DEFAULT_WEIGHTS = { skills: 50, experience: 25, projects: 15, qualifications: 10 };

const RELATED_FIELDS = [['computer science', 'cs', 'software engineering', 'se', 'computer engineering', 'information technology', 'it', 'information systems', 'data science', 'artificial intelligence']];
const fieldsCompatible = (a, b) => !a || !b || a === b || RELATED_FIELDS.some((g) => g.includes(a) && g.includes(b));

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Map a raw cosine similarity onto 0..1 using provider-specific thresholds. */
function semanticScale(sim) {
  const { strong, weak } = semanticThresholds();
  return clamp01((sim - weak * 0.75) / (strong + 0.15 - weak * 0.75));
}

const LEARNING_TIPS = {
  language: 'work through the official tutorial and rebuild a small existing project in it',
  backend: 'build and deploy a small CRUD API with authentication, tests and migrations',
  frontend: 'build a responsive single-page app that consumes a public API',
  database: 'design a normalised schema, write indexed queries and practise migrations',
  devops: 'containerise an existing project and add a CI pipeline that builds and tests it',
  cloud: 'deploy a small service using the provider\'s free tier and managed database',
  architecture: 'design and document an API (OpenAPI spec) for a small service, then implement it',
  testing: 'add unit and integration tests with coverage reporting to an existing project',
  ai: 'complete a hands-on course and train/evaluate a model on a public dataset',
  data: 'analyse a public dataset end-to-end and publish the notebook',
};

function learningSuggestion(skill, candidateSkills) {
  const bridge = candidateSkills.map((s) => ({ s, r: relationStrength(skill, s) })).filter((x) => x.r > 0).sort((a, b) => b.r - a.r)[0];
  const tip = LEARNING_TIPS[skillCategory(skill)] || 'complete a focused course and apply it in a small project';
  return bridge ? `${skill}: builds on existing ${bridge.s} knowledge — ${tip}.` : `${skill}: ${tip}.`;
}

/**
 * @param job      { title, description, requiredSkills[{name,importance}], preferredSkills[...], minExperienceYears, qualifications[], weights? }
 * @param profile  { skills[{name,evidence[],source}], declaredAbsent[], experience[], totalExperienceYears, projects[], education[], chunks[{text,section,embedding}] }
 * @param opts     { embedFn(texts)->vectors, recruiterAbsent[] , skillOverrides }
 */
export async function scoreCandidate(job, profile, { embedFn, recruiterAbsent = [] } = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(job.weights || {}) };
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  const { strong, weak } = semanticThresholds();

  const chunks = (profile.chunks || []).filter((c) => c.embedding?.length);
  const absent = new Set([...(profile.declaredAbsent || []), ...recruiterAbsent]);

  // ---------- candidate skill index (with implied skills) ----------
  const have = new Map();
  for (const s of profile.skills || []) {
    if (s.removed) continue;
    const hasEvidence = (s.evidence || []).length > 0;
    have.set(s.name, { credit: hasEvidence ? 1 : 0.6, matchedBy: hasEvidence ? 'exact' : 'self-reported', evidence: s.evidence || [], source: s.source || 'parser' });
  }
  for (const [name, info] of [...have.entries()]) {
    for (const imp of impliedBy(name)) {
      if (!have.has(imp) || have.get(imp).credit < 0.85 * info.credit) {
        have.set(imp, { credit: 0.85 * info.credit, matchedBy: 'implied', via: name, evidence: info.evidence.slice(0, 1), source: info.source });
      }
    }
  }
  const haveNames = [...have.keys()];

  // ---------- skills component ----------
  const jobSkills = [
    ...(job.requiredSkills || []).map((s) => ({ ...s, required: true, w: Number(s.importance) || 3 })),
    ...(job.preferredSkills || []).map((s) => ({ ...s, required: false, w: (Number(s.importance) || 2) * 0.5 })),
  ];
  const skillQueries = jobSkills.length && embedFn && chunks.length ? await embedFn(jobSkills.map((s) => `${s.name} experience`)) : [];

  const matched = [];
  const gaps = [];
  let wTotal = 0, wGot = 0;
  jobSkills.forEach((js, i) => {
    wTotal += js.w;
    if (absent.has(js.name)) {
      gaps.push({ skill: js.name, required: js.required, importance: js.importance, type: 'confirmed_absent', note: 'Confirmed as not held (candidate or recruiter).' });
      return;
    }
    const options = [];
    const direct = have.get(js.name);
    if (direct) options.push({ credit: direct.credit, matchedBy: direct.matchedBy, evidence: direct.evidence, via: direct.via, source: direct.source });

    // related skills in ontology
    for (const h of haveNames) {
      const r = relationStrength(js.name, h);
      if (r > 0 && h !== js.name) options.push({ credit: r * 0.8 * have.get(h).credit, matchedBy: 'related', via: h, evidence: have.get(h).evidence.slice(0, 1) });
    }
    // semantic passages
    if (skillQueries[i]) {
      let best = { sim: -1, chunk: null };
      for (const c of chunks) {
        const sim = cosine(skillQueries[i], c.embedding);
        if (sim > best.sim) best = { sim, chunk: c };
      }
      if (best.sim >= strong) options.push({ credit: 0.6, matchedBy: 'semantic', similarity: round(best.sim), evidence: [best.chunk.text.slice(0, 220)] });
      else if (best.sim >= weak) options.push({ credit: 0.3, matchedBy: 'semantic-weak', similarity: round(best.sim), evidence: [best.chunk.text.slice(0, 220)] });
    }
    const best = options.sort((a, b) => b.credit - a.credit)[0];
    const credit = best?.credit || 0;
    wGot += js.w * credit;
    if (credit >= 0.5) {
      matched.push({ skill: js.name, required: js.required, importance: js.importance, credit: round(credit), matchedBy: best.matchedBy, via: best.via || null, similarity: best.similarity ?? null, evidence: best.evidence || [], source: best.source || 'parser' });
    } else {
      gaps.push({
        skill: js.name, required: js.required, importance: js.importance,
        type: credit > 0 ? 'weak_evidence' : 'no_evidence',
        credit: round(credit),
        note: credit > 0 ? `Only indirect evidence (${best.matchedBy}${best.via ? ` via ${best.via}` : ''}).` : 'No evidence found in the resume. This is missing evidence, not confirmed absence.',
        evidence: best?.evidence || [],
      });
    }
  });
  const skillsScore = wTotal ? wGot / wTotal : 0.5;

  // ---------- experience component ----------
  const years = Number(profile.totalExperienceYears) || 0;
  const minYears = Number(job.minExperienceYears) || 0;
  const yearsRatio = minYears > 0 ? clamp01(years / minYears) : years > 0 ? 1 : 0.5;
  const jobFocus = `${job.title}. ${jobSkills.filter((s) => s.required).map((s) => s.name).join(', ')}`;
  const requiredNames = jobSkills.filter((s) => s.required).map((s) => s.name.toLowerCase());
  let expRelevance = 0;
  let expEvidence = null;
  const expEntries = (profile.experience || []).filter((e) => e.text);
  if (expEntries.length) {
    const overlapOf = (t) => (requiredNames.length ? requiredNames.filter((n) => t.toLowerCase().includes(n.toLowerCase())).length / requiredNames.length : 0);
    let sims = [];
    if (embedFn) {
      const [q, ...vecs] = await embedFn([jobFocus, ...expEntries.map((e) => e.text)]);
      sims = vecs.map((v) => semanticScale(cosine(q, v)));
    }
    expEntries.forEach((e, i) => {
      const rel = Math.max(overlapOf(e.text), sims[i] || 0);
      if (rel > expRelevance) { expRelevance = rel; expEvidence = e; }
    });
  }
  const experienceScore = 0.6 * yearsRatio + 0.4 * expRelevance;

  // ---------- projects component ----------
  const projects = profile.projects || [];
  let projectsScore = 0;
  const projectEvidence = [];
  if (projects.length && jobSkills.length) {
    const reqW = jobSkills.reduce((a, s) => a + s.w, 0);
    let sims = [];
    if (embedFn) {
      const [q, ...vecs] = await embedFn([`${job.title}. ${job.description || ''}`.slice(0, 1500), ...projects.map((p) => `${p.name}. ${p.description}`)]);
      sims = vecs.map((v) => semanticScale(cosine(q, v)));
    }
    const scored = projects.map((p, i) => {
      const ps = new Set([...(p.skills || []), ...(p.skills || []).flatMap(impliedBy)]);
      const overlap = jobSkills.filter((s) => ps.has(s.name)).reduce((a, s) => a + s.w, 0) / reqW;
      return { name: p.name, score: Math.max(overlap, (sims[i] || 0) * 0.8), skills: p.skills || [], description: (p.description || '').slice(0, 200) };
    }).sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 2);
    projectsScore = clamp01(top[0].score * 0.75 + (top[1]?.score || 0) * 0.25 + (top[1] ? 0 : top[0].score * 0.25));
    projectEvidence.push(...top.filter((p) => p.score > 0.1));
  }

  // ---------- qualifications component ----------
  const reqQuals = (job.qualifications || []).map(degreeInfo).filter((q) => q.level > 0 || q.field);
  const edu = (profile.education || []).map((e) => ({ ...e, ...degreeInfo(`${e.degree || ''} ${e.field || ''} ${e.text || ''}`) }));
  const bestEdu = edu.sort((a, b) => b.level - a.level)[0];
  let qualificationsScore = 1;
  let qualNote = 'No formal qualification requirement specified.';
  if (reqQuals.length) {
    const req = reqQuals.sort((a, b) => b.level - a.level)[0];
    if (!bestEdu) { qualificationsScore = 0; qualNote = 'No education details found in the resume (missing evidence).'; }
    else {
      const levelScore = bestEdu.level >= req.level ? 1 : bestEdu.level === req.level - 1 ? 0.6 : 0.25;
      const fieldOk = fieldsCompatible(req.field, bestEdu.field);
      qualificationsScore = levelScore * (fieldOk ? 1 : 0.75);
      qualNote = `${bestEdu.text} — ${levelScore === 1 ? 'meets' : 'below'} the ${req.label || ''} requirement${fieldOk ? '' : '; field differs'}.`;
    }
  }

  // ---------- total & explanation ----------
  const components = { skills: skillsScore, experience: experienceScore, projects: projectsScore, qualifications: qualificationsScore };
  const total = Object.entries(components).reduce((a, [k, v]) => a + (weights[k] || 0) * v, 0) / wSum * 100;

  const reqMatched = matched.filter((m) => m.required);
  const reqCount = jobSkills.filter((s) => s.required).length;
  const explanation = [
    `Matched ${reqMatched.length} of ${reqCount} required skills${matched.length > reqMatched.length ? ` and ${matched.length - reqMatched.length} preferred` : ''}.`,
    ...matched.filter((m) => m.matchedBy !== 'exact').map((m) => m.matchedBy === 'implied' ? `${m.skill} inferred from ${m.via} experience.` : m.matchedBy === 'related' ? `${m.skill} partially credited via related skill ${m.via}.` : m.matchedBy === 'self-reported' ? `${m.skill} is self-reported without a resume excerpt — verify in interview.` : `${m.skill} supported by a semantically similar passage (similarity ${m.similarity}).`),
    `${years} years of experience against ${minYears || 'no'} required${expEvidence ? `; most relevant role: ${[expEvidence.title, expEvidence.company].filter(Boolean).join(' at ')}` : ''}.`,
    projects.length ? `${projectEvidence.length} project(s) relevant to this role${projectEvidence[0] ? `, strongest: "${projectEvidence[0].name}"` : ''}.` : 'No projects section found (missing evidence).',
    qualNote,
    ...gaps.filter((g) => g.required).map((g) => `Gap: ${g.skill} — ${g.type === 'confirmed_absent' ? 'confirmed absent' : g.type === 'weak_evidence' ? 'only indirect evidence' : 'no evidence in resume'}.`),
  ];

  const flags = matched.filter((m) => m.matchedBy === 'self-reported' || !m.evidence.length).map((m) => ({ skill: m.skill, reason: 'Skill credited without a supporting resume excerpt' }));

  return {
    score: Math.round(total),
    breakdown: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, { score: round(v * 100, 0), weight: weights[k], contribution: round((weights[k] * v) / wSum * 100, 1) }])),
    matchedSkills: matched,
    gaps,
    experience: { years, required: minYears, relevance: round(expRelevance), mostRelevant: expEvidence ? { title: expEvidence.title, company: expEvidence.company, months: expEvidence.months, excerpt: expEvidence.text.length > 240 ? `${expEvidence.text.slice(0, 237).replace(/\s+\S*$/, '')}…` : expEvidence.text } : null },
    projects: projectEvidence,
    qualifications: { note: qualNote, best: bestEdu ? bestEdu.text : null },
    explanation,
    learningAreas: gaps.filter((g) => g.type !== 'confirmed_absent' || g.required).slice(0, 5).map((g) => learningSuggestion(g.skill, haveNames)),
    flags,
    weights,
    computedAt: new Date(),
  };
}

/** Build the scoring view of a candidate profile, excluding identity and protected attributes. */
export function scoringView(profile) {
  const p = profile?.parsed || {};
  const merged = new Map();
  for (const s of p.skills || []) merged.set(s.name, s);
  for (const s of profile?.skillCorrections || []) {
    if (s.action === 'remove') merged.set(s.name, { ...(merged.get(s.name) || { name: s.name }), removed: true });
    else if (s.action === 'add' && !merged.has(s.name)) merged.set(s.name, { name: s.name, evidence: s.evidence ? [s.evidence] : [], source: s.by || 'candidate' });
  }
  return {
    skills: [...merged.values()],
    declaredAbsent: profile?.declaredAbsent || [],
    experience: p.experience || [],
    totalExperienceYears: profile?.experienceYearsOverride ?? p.totalExperienceYears ?? 0,
    projects: p.projects || [],
    education: p.education || [],
    chunks: profile?.chunks || [],
  };
}
