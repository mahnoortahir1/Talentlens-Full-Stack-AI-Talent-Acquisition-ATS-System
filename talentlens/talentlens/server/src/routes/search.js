import { Router } from 'express';
import { z } from 'zod';
import CandidateProfile from '../models/CandidateProfile.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { HttpError, requireAuth, requireRole, validate } from '../middleware/index.js';
import { embed, cosine, semanticThresholds, embeddingModelName } from '../services/embeddings.js';
import { findSkillsInQuery, relationStrength, impliedBy, skillCategory } from '../services/skills.js';
import { scoringView } from '../services/matcher.js';
import { findDuplicatePairs } from '../services/duplicates.js';
import { ensureIndexed } from '../services/profilePipeline.js';
import { pushHistory } from '../services/assessment.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth, requireRole('recruiter'));

/** Candidates this recruiter may search: applicants to jobs of their company, with consent, within retention. */
async function searchableProfiles(user, extraSelect = '') {
  const colleagues = await User.find({ role: 'recruiter', company: user.company }).select('_id');
  const jobs = await Job.find({ recruiter: { $in: colleagues.map((c) => c._id) } }).select('_id');
  const apps = await Application.find({ job: { $in: jobs.map((j) => j._id) } }).select('profile job status');
  const ownJobIds = new Set((await Job.find({ recruiter: user._id }).select('_id')).map((j) => String(j._id)));
  const cutoff = new Date(Date.now() - config.retentionDays * 86400000);
  const ids = [...new Set(apps.map((a) => String(a.profile)))];
  const profiles = await CandidateProfile.find({ _id: { $in: ids }, mergedInto: null, 'resume.status': 'parsed', updatedAt: { $gte: cutoff } }).select(extraSelect).populate('user', 'name email');
  // Applicants to the recruiter's own jobs are always visible; others need talent-pool consent.
  return profiles.filter((p) => p.talentPoolConsent || apps.some((a) => String(a.profile) === String(p._id) && ownJobIds.has(String(a.job))))
    .map((p) => ({ profile: p, applications: apps.filter((a) => String(a.profile) === String(p._id)) }));
}

// Words that describe the search itself rather than what to look for.
const QUERY_STOP = new Set('a an the and or of to in on for with at by from as is are was were be been who has have having someone somebody people person candidate candidates developer developers engineer engineers dev devs experience experienced years year yrs plus strong good skilled skills knowledge working work worked built building build using used looking need needs want senior junior mid level expert professional background least more than'.split(' '));

/** Content words of the query that are not skills (e.g. domains like "fintech", "dashboards"). */
function queryTerms(query, skillNames) {
  const skillWords = new Set(skillNames.flatMap((s) => s.toLowerCase().split(/[\s.]+/)));
  return [...new Set(query.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !QUERY_STOP.has(w) && !skillWords.has(w) && !/^\d+\+?$/.test(w)))];
}

/** Best credit a candidate gets for a query skill: exact, related (Next.js ~ React) or implied (Django -> Python). */
function skillCredit(querySkill, candidateSkills) {
  if (candidateSkills.has(querySkill)) return { credit: 1, via: querySkill, match: 'exact' };
  let best = { credit: 0, via: null, match: null };
  for (const cs of candidateSkills) {
    const c = Math.max(relationStrength(querySkill, cs), impliedBy(cs).includes(querySkill) ? 0.7 : 0);
    if (c > best.credit) best = { credit: c, via: cs, match: 'related' };
  }
  return best.credit >= 0.4 ? best : { credit: 0, via: null, match: null };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Natural-language talent search ("React developer with 2 years experience in fintech").
 * Relevance combines:
 *  - semantic similarity between the query and the resume (best chunks + whole-resume embedding),
 *  - skill matching (exact, related and implied skills; case-insensitive query parsing),
 *  - role matching ("frontend developer" -> any frontend skill such as React/Vue/CSS),
 *  - domain/keyword terms found in the resume (e.g. "fintech").
 * Results are never cut off by a hard threshold: when nothing matches well, the closest
 * candidates are returned and labelled as such. Every result carries a score breakdown.
 */
router.post('/talent', validate({ body: z.object({ query: z.string().trim().min(3).max(300), limit: z.number().int().min(1).max(50).default(15) }) }), async (req, res) => {
  const { query, limit } = req.body;
  const { skills: querySkills, categories, categorySkills } = findSkillsInQuery(query);
  const terms = queryTerms(query, [...querySkills, ...categorySkills]);
  const minYears = Number((query.match(/(\d{1,2})\+?\s*(?:years?|yrs?)/i) || [])[1] || 0);
  // Embed the raw query and an expanded version that spells out the skills a role implies,
  // so "frontend developer" lands close to resumes that only say "React" / "Vue".
  const expansion = [...querySkills, ...categorySkills.slice(0, 10)];
  const queryTexts = expansion.length ? [query, `${query}. Skills: ${expansion.join(', ')}`] : [query];
  const qVecs = await embed(queryTexts);
  const { weak, strong } = semanticThresholds();
  // sanitizedText is needed so ensureIndexed can rebuild the whole-resume embedding correctly.
  const people = await searchableProfiles(req.user, '+chunks +embedding +parsed.sanitizedText');

  const results = [];
  for (const { profile, applications } of people) {
    await ensureIndexed(profile);
    const sim = (v) => Math.max(...qVecs.map((q) => cosine(q, v)));
    const chunkHits = (profile.chunks || []).map((c) => ({ text: c.text, section: c.section, sim: sim(c.embedding) })).sort((a, b) => b.sim - a.sim);
    const top = chunkHits[0]?.sim || 0;
    const top3 = chunkHits.slice(0, 3);
    const mean3 = top3.length ? top3.reduce((a, c) => a + c.sim, 0) / top3.length : 0;
    const docSim = profile.embedding?.length ? sim(profile.embedding) : top;
    const semanticRaw = 0.6 * top + 0.25 * mean3 + 0.15 * docSim;
    const floor = weak * 0.5, ceil = Math.min(0.95, strong + 0.2);
    const semantic = clamp01((semanticRaw - floor) / (ceil - floor));

    // Use corrected skills (candidate/recruiter edits applied), not only raw parser output.
    const view = scoringView(profile.toObject());
    const candSkills = new Set(view.skills.filter((s) => !s.removed).map((s) => s.name));

    const credits = querySkills.map((q) => ({ skill: q, ...skillCredit(q, candSkills) }));
    const skillScore = credits.length ? credits.reduce((a, c) => a + c.credit, 0) / credits.length : 0;

    const roleHits = categories.map((cat) => ({ category: cat, skills: [...candSkills].filter((s) => skillCategory(s) === cat) }));
    const roleScore = roleHits.length ? roleHits.reduce((a, r) => a + Math.min(1, r.skills.length / 2), 0) / roleHits.length : 0;

    const resumeText = `${profile.parsed?.sanitizedText || ''}\n${(profile.chunks || []).map((c) => c.text).join('\n')}\n${profile.headline || ''}`.toLowerCase();
    const termHits = terms.filter((t) => resumeText.includes(t.replace(/(s|es|ing|ed)$/, '')));
    const termScore = terms.length ? termHits.length / terms.length : 0;

    // Weight only the signals the query actually contains.
    const parts = [['semantic', semantic, 0.4]];
    if (querySkills.length) parts.push(['skills', skillScore, 0.4]);
    if (categories.length) parts.push(['role', roleScore, 0.25]);
    if (terms.length) parts.push(['keywords', termScore, 0.15]);
    const wSum = parts.reduce((a, p) => a + p[2], 0);
    let relevance = parts.reduce((a, [, v, w]) => a + v * w, 0) / wSum;

    const years = profile.experienceYearsOverride ?? profile.parsed?.totalExperienceYears ?? 0;
    const yearsOk = !minYears || years >= minYears;
    if (!yearsOk) relevance *= 0.75 + 0.25 * clamp01(years / minYears);

    const matchedSkills = [
      ...credits.filter((c) => c.credit > 0).map((c) => ({ skill: c.skill, match: c.match, via: c.via, credit: Math.round(c.credit * 100) / 100 })),
      ...roleHits.flatMap((r) => r.skills.filter((s) => !querySkills.includes(s)).slice(0, 4).map((s) => ({ skill: s, match: 'role', via: r.category, credit: 1 }))),
    ];
    const evidenceFor = (m) => { const name = m.match === 'related' ? m.via : m.skill; return { type: 'skill', skill: name, text: view.skills.find((x) => x.name === name)?.evidence?.[0] }; };
    const evidence = [
      ...matchedSkills.slice(0, 3).map(evidenceFor).filter((e) => e.text),
      ...chunkHits.slice(0, 2).map((c) => ({ type: 'semantic', section: c.section, similarity: Math.round(c.sim * 100) / 100, text: c.text.slice(0, 240) })),
    ].slice(0, 4);

    const pct = Math.round(relevance * 100);
    results.push({
      profileId: profile._id,
      candidate: { id: profile.user._id, name: profile.user.name, email: profile.user.email },
      headline: profile.headline || profile.parsed?.experience?.[0]?.title || '',
      relevance: pct,
      matchLevel: pct >= 55 ? 'strong' : pct >= 35 ? 'partial' : 'weak',
      breakdown: {
        semantic: Math.round(semantic * 100),
        bestPassageSimilarity: Math.round(top * 100) / 100,
        ...(querySkills.length ? { skills: Math.round(skillScore * 100) } : {}),
        ...(categories.length ? { role: Math.round(roleScore * 100) } : {}),
        ...(terms.length ? { keywords: Math.round(termScore * 100) } : {}),
        yearsOk,
      },
      matchedSkills,
      matchedTerms: termHits,
      missingSkills: credits.filter((c) => !c.credit).map((c) => c.skill),
      years,
      evidence,
      applications: applications.length,
    });
  }
  results.sort((a, b) => b.relevance - a.relevance);
  const good = results.filter((r) => r.matchLevel !== 'weak');
  // Never return nothing: if no candidate matches well, return the closest ones, flagged as such.
  const closestOnly = !good.length && results.length > 0;
  res.json({
    query,
    interpreted: { skills: querySkills, roles: categories, terms, minYears },
    model: embeddingModelName(),
    searched: people.length,
    closestOnly,
    results: (closestOnly ? results : good).slice(0, limit),
  });
});

/** Likely duplicate candidate records. Nothing is merged without explicit confirmation. */
router.get('/duplicates', async (req, res) => {
  const people = await searchableProfiles(req.user, '+embedding +resume.text');
  const records = people.map(({ profile }) => ({ id: String(profile._id), name: profile.parsed?.name || profile.user.name, email: profile.parsed?.email || profile.user.email, phone: profile.phone || profile.parsed?.phone, text: profile.resume?.text || '', embedding: profile.embedding }));
  const byId = new Map(people.map(({ profile, applications }) => [String(profile._id), { id: profile._id, name: profile.user.name, email: profile.user.email, phone: profile.phone || profile.parsed?.phone, applications: applications.length, updatedAt: profile.updatedAt }]));
  const pairs = findDuplicatePairs(records).map((p) => ({ ...p, a: byId.get(p.a), b: byId.get(p.b) }));
  res.json({ pairs });
});

router.post('/duplicates/merge', validate({ body: z.object({ keepId: z.string().regex(/^[a-f\d]{24}$/i), mergeId: z.string().regex(/^[a-f\d]{24}$/i), confirm: z.literal(true) }) }), async (req, res) => {
  const { keepId, mergeId } = req.body;
  if (keepId === mergeId) throw new HttpError(400, 'Choose two different records');
  const visible = new Set((await searchableProfiles(req.user)).map(({ profile }) => String(profile._id)));
  if (!visible.has(keepId) || !visible.has(mergeId)) throw new HttpError(403, 'You can only merge records you can access');
  const keep = await CandidateProfile.findById(keepId);
  const merge = await CandidateProfile.findById(mergeId);
  const keptJobs = new Set((await Application.find({ profile: keep._id }).select('job')).map((a) => String(a.job)));
  const moved = [];
  const duplicates = [];
  for (const app of await Application.find({ profile: merge._id })) {
    if (keptJobs.has(String(app.job))) {
      // Same job applied twice: keep the primary application, close the duplicate with an audit entry.
      if (app.status !== 'rejected') pushHistory(app, 'rejected', req.user, `Closed as duplicate of record ${keepId}`);
      await app.save();
      duplicates.push(app._id);
    } else {
      app.profile = keep._id;
      app.candidate = keep.user;
      app.history.push({ from: app.status, to: app.status, by: req.user._id, byName: req.user.name, note: `Moved from duplicate record ${mergeId}` });
      await app.save();
      moved.push(app._id);
    }
  }
  merge.mergedInto = keep._id;
  await merge.save();
  res.json({ ok: true, moved: moved.length, closedDuplicates: duplicates.length });
});

export default router;
