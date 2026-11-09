/**
 * Interview question generation. With an LLM configured, questions are generated from the job,
 * the candidate's verified evidence and the AI assessment, then checked so that any question
 * referring to a candidate project actually refers to a project in the resume.
 * Without an LLM, a deterministic generator builds questions from the same evidence
 * (skills, gaps, projects) — its output is labelled source:"template".
 */
import crypto from 'node:crypto';
import { generateJSON, llmName } from './llm.js';
import { skillCategory } from './skills.js';

const id = () => crypto.randomUUID();

const BANK = {
  language: {
    beginner: (s) => [`What are the core data types and control structures in ${s}, and when would you choose each collection type?`, 'Names common types; explains mutability and appropriate use cases with examples.'],
    intermediate: (s) => [`How do you handle errors and manage resources (files, connections) safely in ${s}?`, 'Mentions exceptions/error values, context managers or finally/defer patterns, and logging.'],
    advanced: (s) => [`Describe how memory management and concurrency work in ${s}. How would you profile and fix a slow ${s} service?`, 'Discusses runtime model (GC, GIL/event loop/threads), profiling tools, and a concrete optimisation.'],
  },
  backend: {
    beginner: (s) => [`Walk through how a request flows through a ${s} application from URL to response.`, 'Routing, middleware/views/controllers, data layer, serialisation, response codes.'],
    intermediate: (s) => [`How do you structure authentication, validation and database access in a ${s} project?`, 'Separation of concerns, input validation, ORM usage, avoiding N+1 queries, auth middleware.'],
    advanced: (s) => [`A ${s} endpoint becomes slow under load. How do you diagnose and scale it?`, 'Profiling, query analysis, caching, async workers/queues, horizontal scaling, observability.'],
  },
  frontend: {
    beginner: (s) => [`How does ${s} render and update the UI when data changes?`, 'Component model, state/props, re-rendering or change detection basics.'],
    intermediate: (s) => [`How do you manage shared state and data fetching in a ${s} app?`, 'Context/store choices, caching, loading/error states, avoiding prop drilling.'],
    advanced: (s) => [`How would you diagnose and fix performance problems in a large ${s} application?`, 'Profiler use, memoisation, code splitting, virtualisation, measuring Web Vitals.'],
  },
  database: {
    beginner: (s) => [`What is an index in ${s} and when should you add one?`, 'Explains lookup speed vs write cost; picks columns used in filters/joins.'],
    intermediate: (s) => [`How do you design a schema and handle migrations safely in ${s}?`, 'Normalisation, constraints, migration tooling, backwards-compatible changes.'],
    advanced: (s) => [`Explain transaction isolation levels in ${s} and a bug you would expect at each level.`, 'Read committed/repeatable read/serialisable, dirty/phantom reads, locking, EXPLAIN plans.'],
  },
  devops: {
    beginner: (s) => [`What problem does ${s} solve in a deployment workflow?`, 'Reproducible environments / automation; basic commands or concepts.'],
    intermediate: (s) => [`How would you use ${s} to set up a development and production environment for a web API with a database?`, 'Config per environment, secrets handling, networking, volumes, health checks.'],
    advanced: (s) => [`How do you make ${s}-based deployments secure, small and observable?`, 'Least privilege, image size/multi-stage builds, scanning, logging/metrics, rollbacks.'],
  },
  cloud: {
    beginner: (s) => [`Which ${s} services would you use to host a web app with a database?`, 'Compute, managed DB, storage, networking basics.'],
    intermediate: (s) => [`How do you manage credentials and permissions on ${s}?`, 'IAM roles, least privilege, secret managers, no keys in code.'],
    advanced: (s) => [`Design a highly available, cost-aware architecture on ${s} for a growing API.`, 'Multi-AZ, autoscaling, managed services, cost monitoring, trade-offs.'],
  },
  architecture: {
    beginner: (s) => [`What makes a good ${s} design? Give an example endpoint.`, 'Resource naming, HTTP verbs/status codes, consistency.'],
    intermediate: (s) => [`How do you version, document and paginate a ${s}?`, 'Versioning strategy, OpenAPI docs, cursor/offset pagination, error format.'],
    advanced: (s) => [`How do you handle idempotency, rate limiting and backward compatibility in a ${s}?`, 'Idempotency keys, retries, throttling, deprecation strategy, contract tests.'],
  },
  testing: {
    beginner: (s) => [`What is the difference between unit and integration tests in ${s}?`, 'Scope, isolation, speed, examples.'],
    intermediate: (s) => [`How do you test code that talks to a database or external API?`, 'Fixtures, mocks/fakes, test containers, factories.'],
    advanced: (s) => [`How would you introduce ${s} into a legacy codebase with no tests?`, 'Characterisation tests, prioritising risky code, CI gates, coverage as signal not goal.'],
  },
};
const GENERIC = {
  beginner: (s) => [`How have you used ${s}, and what was the most useful thing you learned?`, 'Concrete example with context and outcome.'],
  intermediate: (s) => [`Describe a problem you solved using ${s}. What alternatives did you consider?`, 'Clear problem, reasoning about trade-offs, measurable result.'],
  advanced: (s) => [`What are the main limitations of ${s}, and how have you worked around them?`, 'Shows depth: failure modes, workarounds, when not to use it.'],
};

/** Required mix for every generated set: 2 technical, 2 project, 1 scenario, 1 behavioral. */
export const QUESTION_MIX = { technical: 2, project: 2, scenario: 1, behavioral: 1 };
export const QUESTION_TYPES = Object.keys(QUESTION_MIX);
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

// Generic, CV-independent questions that must never be produced.
const GENERIC_RE = /\b(tell me about yourself|introduce yourself|walk me through your (resume|cv)|strengths? and weakness|greatest weakness|where do you see yourself|why should we hire you|why do you want (this|to work))\b/i;

/** Normalised token set used to detect repeated / near-duplicate questions. */
const tokens = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9+#.\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
/** True when `text` repeats (or nearly repeats) any question in `list`. */
export const isRepeat = (text, list) => list.some((p) => similarity(text, p) >= 0.6);

/** Small seeded PRNG so a set can be reproduced from its seed, yet each click uses a new seed. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}
const shuffle = (arr, rand) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Pull the CV facts the questions must be grounded in. */
function cvFacts(profile, job, assessment) {
  const cvSkills = (profile?.skills || []).map((s) => ({ name: s.name, evidence: s.evidence?.[0] }));
  const jobSkillNames = new Set([...(job?.requiredSkills || []), ...(job?.preferredSkills || [])].map((s) => s.name));
  const matched = new Set((assessment?.matchedSkills || []).map((m) => m.skill));
  // Skills the candidate actually has, with the ones relevant to this job first.
  const skills = [...cvSkills].sort((a, b) => (jobSkillNames.has(b.name) || matched.has(b.name) ? 1 : 0) - (jobSkillNames.has(a.name) || matched.has(a.name) ? 1 : 0));
  const experience = (profile?.experience || []).filter((e) => e.title || e.company).map((e) => ({ title: e.title, company: e.company, months: e.months, details: (e.details || []).slice(0, 4) }));
  const projects = (profile?.projects || []).filter((p) => p.name).map((p) => ({ name: p.name, description: (p.description || '').slice(0, 300), skills: p.skills || [] }));
  const education = (profile?.education || []).map((e) => ({ degree: e.degree, field: e.field, institution: e.institution, year: e.year }));
  return { skills, experience, projects, education, summary: (profile?.summary || '').slice(0, 400) };
}

/**
 * Deterministic-per-seed generator used without an LLM (or to top up an LLM set).
 * Builds a large pool of CV-grounded questions per type, shuffles it with the seed and
 * skips anything in `previous`, so successive clicks give different sets.
 */
function templateQuestions(job, assessment, profile, { previous = [], seed = Date.now(), mix = QUESTION_MIX } = {}) {
  const rand = rng(seed);
  const { skills, experience, projects, education } = cvFacts(profile, job, assessment);
  const pool = { technical: [], project: [], scenario: [], behavioral: [] };
  const q = (type, text, difficulty, guideline, extra = {}) => pool[type].push({ id: id(), text, difficulty, type, guideline, source: 'template', skill: null, projectRef: null, ...extra });
  const jobTitle = job?.title || 'this role';

  // Technical: grounded in the candidate's own skills (job-relevant ones first).
  for (const s of skills.slice(0, 8)) {
    const bank = BANK[skillCategory(s.name)] || GENERIC;
    for (const level of DIFFICULTIES) { const [text, g] = bank[level](s.name); q('technical', text, level, g, { skill: s.name }); }
    for (const [text, g] of Object.values(GENERIC).map((f) => f(s.name))) q('technical', text, 'intermediate', g, { skill: s.name });
    if (s.evidence) q('technical', `Your CV mentions: "${s.evidence.slice(0, 160)}". Explain the ${s.name} implementation details behind this and what you would do differently today.`, 'advanced', `Concrete, first-hand technical detail about ${s.name}; trade-offs; reflection on improvements.`, { skill: s.name });
  }

  // Project-based: about projects listed on the CV (or roles, if no projects are listed).
  for (const p of projects.slice(0, 5)) {
    const tech = p.skills.slice(0, 3).join(', ') || 'the technologies you chose';
    const ref = { projectRef: p.name, skill: p.skills[0] || null };
    q('project', `Walk me through "${p.name}". What was your role, how was it architected, and why did you choose ${tech}?`, 'intermediate', 'Clear ownership, architecture explanation, justified technology choices, honest about limitations.', ref);
    q('project', `If "${p.name}" had to handle 10x more users, what would break first and how would you fix it?`, 'advanced', 'Identifies bottlenecks (DB, CPU, I/O), proposes caching/queues/scaling, mentions measurement.', ref);
    q('project', `What was the hardest bug or technical problem you hit while building "${p.name}", and how did you track it down?`, 'intermediate', 'Specific bug, systematic debugging approach, root cause, prevention.', ref);
    q('project', `How did you test and deploy "${p.name}"? What would you add to make it production-ready?`, 'intermediate', 'Testing strategy, CI/CD, monitoring, security and reliability gaps acknowledged.', ref);
    q('project', `Looking back at "${p.name}", which design decision would you change and why?`, 'advanced', 'Self-critical reflection, understands consequences of the original choice, realistic alternative.', ref);
    if (p.skills.length >= 2) q('project', `In "${p.name}", how did ${p.skills[0]} and ${p.skills[1]} work together, and where was the integration tricky?`, 'advanced', 'Explains data flow / boundaries between the two technologies and concrete integration issues.', ref);
  }
  if (!projects.length) {
    for (const e of experience.slice(0, 3)) {
      const where = [e.title, e.company].filter(Boolean).join(' at ');
      q('project', `Describe the most significant piece of work you delivered as ${where}. What was the architecture and your exact contribution?`, 'intermediate', 'Specific deliverable, clear personal ownership, technical depth.');
      if (e.details[0]) q('project', `Your CV says (as ${where}): "${e.details[0].slice(0, 160)}". How did you approach that and what was the measurable result?`, 'intermediate', 'First-hand detail, approach, metrics or outcome.');
    }
  }

  // Scenario / problem-solving: realistic situations built from the CV's stack and context.
  const stack = skills.slice(0, 4).map((s) => s.name);
  const s0 = stack[0] || 'your main stack', s1 = stack[1] || s0;
  const ctx = projects[0] ? `"${projects[0].name}"` : experience[0]?.company ? `your work at ${experience[0].company}` : 'a recent project';
  q('scenario', `Imagine ${ctx} suddenly starts timing out in production after a release that touched ${s0}. Walk me through your first 30 minutes of debugging.`, 'advanced', 'Triage, rollback consideration, logs/metrics, hypothesis-driven investigation, communication.', { skill: stack[0] || null });
  q('scenario', `You need to add a feature to ${ctx} that requires changing the data model while users are live. How would you plan and ship it using ${s1}?`, 'advanced', 'Backward-compatible migration, feature flags, testing, staged rollout.', { skill: stack[1] || null });
  q('scenario', `A stakeholder reports that numbers shown by ${ctx} are occasionally wrong. How do you find out whether the bug is in ${s0}, the data, or elsewhere?`, 'intermediate', 'Reproduction, isolating layers, data validation, adding tests to prevent regression.', { skill: stack[0] || null });
  q('scenario', `For the ${jobTitle} role you would inherit a ${s0} codebase with no tests and frequent bugs. What would you do in your first two weeks?`, 'intermediate', 'Prioritising risk, characterisation tests, quick wins, communicating a plan.', { skill: stack[0] || null });
  // Only compare like with like (two frameworks, two databases...), never a framework vs a database.
  const names = skills.map((s) => s.name);
  const pair = names.flatMap((a, i) => names.slice(i + 1).filter((b) => skillCategory(a) === skillCategory(b) && skillCategory(a) !== 'other').map((b) => [a, b]))[0];
  if (pair) q('scenario', `You must choose between ${pair[0]} and ${pair[1]} for a new service similar to ${ctx}. What criteria decide it?`, 'advanced', 'Clear criteria (team skill, performance, ecosystem, ops cost), weighs trade-offs, makes a decision.', { skill: pair[0] });

  // Behavioral: anchored in the candidate's actual roles, projects and education.
  for (const e of experience.slice(0, 3)) {
    const where = [e.title, e.company].filter(Boolean).join(' at ');
    q('behavioral', `As ${where}, tell me about a time you disagreed with a technical decision. How did you handle it and what was the outcome?`, 'intermediate', 'STAR structure, respectful disagreement, data-driven argument, outcome and learning.');
    q('behavioral', `During your time as ${where}, describe a deadline that was at risk. What did you do to recover it?`, 'intermediate', 'Ownership, prioritisation, communication with stakeholders, result.');
    q('behavioral', `What feedback did you receive as ${where} that changed how you work?`, 'beginner', 'Specific feedback, genuine reflection, concrete behaviour change.');
  }
  for (const p of projects.slice(0, 2)) q('behavioral', `On "${p.name}", how did you decide what to build first, and how did you handle scope changes or collaborators?`, 'beginner', 'Prioritisation reasoning, collaboration, adaptability.', { projectRef: p.name });
  for (const ed of education.slice(0, 1)) if (ed.institution || ed.degree) q('behavioral', `During your ${ed.degree || 'studies'}${ed.institution ? ` at ${ed.institution}` : ''}, what was the most challenging team or academic project and what was your role in it?`, 'beginner', 'Specific example, personal contribution, teamwork and learning.');
  if (stack[0]) q('behavioral', `Your CV shows ${stack.slice(0, 3).join(', ')}. Tell me about a time you had to learn one of these quickly under pressure. How did you go about it?`, 'beginner', 'Learning strategy, resourcefulness, applying it to deliver a result.', { skill: stack[0] });

  // Pick per type: unseen first (shuffled by seed), then fall back to least-similar repeats if the pool is exhausted.
  const out = [];
  for (const [type, n] of Object.entries(mix)) {
    const all = shuffle(pool[type], rand);
    const fresh = all.filter((x) => !isRepeat(x.text, [...previous, ...out.map((o) => o.text)]));
    const chosen = fresh.slice(0, n);
    for (const x of all) { if (chosen.length >= n) break; if (!chosen.includes(x) && !out.some((o) => o.text === x.text)) chosen.push(x); }
    out.push(...chosen);
  }
  return out;
}

const SYSTEM = 'You are a senior technical interviewer. Write fair, job-related interview questions grounded strictly in the candidate\'s CV. Never ask about age, gender, religion, nationality, family or other protected characteristics. Never ask generic questions. Return strict JSON.';

/**
 * Generate a fresh, CV-specific question set.
 * @param previousQuestions texts of questions already shown; none of them may be repeated.
 * @param mix count per type (defaults to 2 technical, 2 project, 1 scenario, 1 behavioral).
 */
export async function generateQuestions(job, profile, assessment, { focus, previousQuestions = [], mix = QUESTION_MIX, seed } = {}) {
  const runSeed = seed ?? crypto.randomInt(1, 2 ** 31 - 1);
  const previous = [...new Set(previousQuestions.filter(Boolean).map(String))].slice(-60);
  const cv = cvFacts(profile, job, assessment);
  const projectNames = new Set(cv.projects.map((p) => p.name.toLowerCase()));
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  const mixText = Object.entries(mix).filter(([, n]) => n).map(([t, n]) => `${n} "${t}"`).join(', ');

  const prompt = `Role being hired for: ${job.title}
Job required skills: ${(job.requiredSkills || []).map((s) => s.name).join(', ') || 'n/a'}

CANDIDATE CV (ground every question in this):
Summary: ${cv.summary || 'n/a'}
Skills (with CV evidence): ${JSON.stringify(cv.skills.slice(0, 15).map((s) => ({ skill: s.name, evidence: (s.evidence || '').slice(0, 140) })))}
Experience: ${JSON.stringify(cv.experience.slice(0, 4))}
Projects (use ONLY these names for projectRef): ${JSON.stringify(cv.projects.slice(0, 5))}
Education: ${JSON.stringify(cv.education.slice(0, 3))}
Gaps vs the job: ${(assessment?.gaps || []).map((g) => g.skill).join(', ') || 'none'}
${focus ? `Recruiter focus: ${focus}` : ''}

Write exactly ${total} questions: ${mixText}.
- "technical": about specific skills/technologies listed in THIS CV.
- "project": about a specific named project (or role) from THIS CV; set projectRef to the project name.
- "scenario": a realistic problem-solving situation built from this candidate's stack and work context.
- "behavioral": anchored in a specific role, company, project or education entry from THIS CV.
Every question must mention a concrete skill, project, company, role or education item from the CV.
Do NOT ask generic questions such as "Tell me about yourself", "What are your strengths and weaknesses", "Where do you see yourself in 5 years".
Do not repeat previous questions: ${previous.length ? JSON.stringify(previous) : '[]'}
Each question must differ in topic and wording from every previous question. Explore different skills/projects/angles than before.
Variation seed: ${runSeed}
Return JSON: {"questions":[{"text":string,"difficulty":"beginner"|"intermediate"|"advanced","type":"technical"|"project"|"scenario"|"behavioral","skill":string|null,"projectRef":string|null,"guideline":string}]}`;

  const llm = await generateJSON(SYSTEM, prompt, { temperature: 0.95, seed: runSeed });
  let out = [];
  if (llm?.questions?.length) {
    const seen = [...previous];
    for (const raw of llm.questions.slice(0, total * 2)) {
      const text = String(raw.text || '').trim().slice(0, 500);
      if (!text || GENERIC_RE.test(text) || isRepeat(text, seen)) continue; // enforce uniqueness + no generic questions
      const type = QUESTION_TYPES.includes(raw.type) ? raw.type : 'technical';
      if (out.filter((x) => x.type === type).length >= (mix[type] || 0)) continue;
      const ref = raw.projectRef ? String(raw.projectRef) : null;
      const refOk = !ref || projectNames.has(ref.toLowerCase());
      seen.push(text);
      out.push({
        id: id(), text, type,
        difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'intermediate',
        skill: raw.skill || null,
        projectRef: ref,
        guideline: String(raw.guideline || '').slice(0, 500),
        source: llmName(),
        // Hallucination guard: questions about projects that are not in the resume are flagged.
        flagged: !refOk,
        flagReason: refOk ? null : 'Refers to a project not found in the resume',
      });
    }
  }
  // Top up any missing types (or produce the whole set without an LLM) from the CV-grounded pool.
  const missing = Object.fromEntries(Object.entries(mix).map(([t, n]) => [t, Math.max(0, n - out.filter((x) => x.type === t).length)]));
  if (Object.values(missing).some(Boolean)) {
    out.push(...templateQuestions(job, assessment, profile, { previous: [...previous, ...out.map((x) => x.text)], seed: runSeed, mix: missing }));
  }
  // Keep the canonical order: technical, project, scenario, behavioral.
  return out.sort((a, b) => QUESTION_TYPES.indexOf(a.type) - QUESTION_TYPES.indexOf(b.type));
}

export { templateQuestions };
