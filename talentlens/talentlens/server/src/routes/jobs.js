import { Router } from 'express';
import { z } from 'zod';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import CandidateProfile from '../models/CandidateProfile.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { HttpError, requireAuth, requireRole, validate } from '../middleware/index.js';
import { extractRequirements } from '../services/jobExtraction.js';
import { normalizeSkill } from '../services/skills.js';
import { assessApplication, reassessJob } from '../services/assessment.js';
import { scoreCandidate, scoringView } from '../services/matcher.js';
import { embed } from '../services/embeddings.js';
import { ensureIndexed } from '../services/profilePipeline.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth);

const skillList = z.array(z.object({ name: z.string().trim().min(1).max(60), importance: z.coerce.number().int().min(1).max(5).default(3) })).max(40).default([]);
const weights = z.object({ skills: z.number().min(0).max(100), experience: z.number().min(0).max(100), projects: z.number().min(0).max(100), qualifications: z.number().min(0).max(100) })
  .refine((w) => Math.round(w.skills + w.experience + w.projects + w.qualifications) === 100, 'Weights must add up to 100');

const jobSchema = z.object({
  title: z.string().trim().min(3).max(120),
  department: z.string().trim().max(80).optional().default(''),
  location: z.string().trim().max(120).optional().default(''),
  type: z.enum(['full-time', 'part-time', 'contract', 'internship', 'remote']).default('full-time'),
  salaryMin: z.coerce.number().min(0).optional(),
  salaryMax: z.coerce.number().min(0).optional(),
  currency: z.string().trim().max(5).optional(),
  description: z.string().trim().min(30, 'Description should be at least 30 characters').max(10000),
  requiredSkills: skillList,
  preferredSkills: skillList,
  minExperienceYears: z.coerce.number().min(0).max(40).default(0),
  qualifications: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  weights: weights.optional(),
}).refine((j) => j.salaryMin === undefined || j.salaryMax === undefined || j.salaryMax >= j.salaryMin, { message: 'Maximum salary must be ≥ minimum salary', path: ['salaryMax'] });

const normalizeSkills = (list) => [...new Map(list.map((s) => [normalizeSkill(s.name), { name: normalizeSkill(s.name), importance: s.importance }])).values()].filter((s) => s.name);

async function ownedJob(id, user) {
  const job = await Job.findById(id);
  if (!job) throw new HttpError(404, 'Job not found');
  if (String(job.recruiter) !== String(user._id)) throw new HttpError(403, 'This job belongs to another recruiter');
  return job;
}

function publicJob(job) {
  const { _id, title, department, location, type, salaryMin, salaryMax, currency, description, requiredSkills, preferredSkills, minExperienceYears, qualifications, status, createdAt } = job;
  return { id: _id, title, department, location, type, salaryMin, salaryMax, currency, description, requiredSkills, preferredSkills, minExperienceYears, qualifications, status, createdAt };
}

// ---------- listing ----------
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (req.user.role === 'recruiter') {
    const jobs = await Job.find({ recruiter: req.user._id }).sort({ createdAt: -1 }).lean();
    const counts = await Application.aggregate([{ $match: { job: { $in: jobs.map((j) => j._id) } } }, { $group: { _id: { job: '$job', status: '$status' }, n: { $sum: 1 } } }]);
    const byJob = {};
    for (const c of counts) {
      const k = String(c._id.job);
      byJob[k] = byJob[k] || { total: 0, shortlisted: 0, pending: 0 };
      byJob[k].total += c.n;
      if (['shortlisted', 'interview', 'selected'].includes(c._id.status)) byJob[k].shortlisted += c.n;
      if (['submitted', 'parsed', 'ai_assessed', 'recruiter_review'].includes(c._id.status)) byJob[k].pending += c.n;
    }
    return res.json({ jobs: jobs.map((j) => ({ ...publicJob(j), applicants: byJob[String(j._id)] || { total: 0, shortlisted: 0, pending: 0 } })) });
  }
  const filter = { status: 'open' };
  if (q) filter.$text = { $search: q };
  const jobs = await Job.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  const mine = new Set((await Application.find({ candidate: req.user._id }).select('job').lean()).map((a) => String(a.job)));
  res.json({ jobs: jobs.map((j) => ({ ...publicJob(j), applied: mine.has(String(j._id)) })) });
});

// ---------- AI requirement extraction ----------
router.post('/extract', requireRole('recruiter'), validate({ body: z.object({ description: z.string().trim().min(30).max(10000) }) }), async (req, res) => {
  res.json({ requirements: await extractRequirements(req.body.description) });
});

// ---------- create / read / update ----------
router.post('/', requireRole('recruiter'), validate({ body: jobSchema }), async (req, res) => {
  const body = { ...req.body, requiredSkills: normalizeSkills(req.body.requiredSkills), preferredSkills: normalizeSkills(req.body.preferredSkills) };
  if (!body.requiredSkills.length) {
    // No skills given: extract them from the description so matching still works.
    const ex = await extractRequirements(body.description);
    body.requiredSkills = ex.requiredSkills.map(({ name, importance }) => ({ name, importance }));
    body.preferredSkills = body.preferredSkills.length ? body.preferredSkills : ex.preferredSkills.map(({ name, importance }) => ({ name, importance }));
  }
  const job = await Job.create({ ...body, recruiter: req.user._id });
  res.status(201).json({ job: publicJob(job) });
});

router.get('/:id', async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw new HttpError(404, 'Job not found');
  if (req.user.role === 'candidate') {
    if (job.status !== 'open') {
      const applied = await Application.exists({ job: job._id, candidate: req.user._id });
      if (!applied) throw new HttpError(404, 'Job not found');
    }
    const applied = await Application.exists({ job: job._id, candidate: req.user._id });
    return res.json({ job: { ...publicJob(job), applied: Boolean(applied) } });
  }
  if (String(job.recruiter) !== String(req.user._id)) throw new HttpError(403, 'This job belongs to another recruiter');
  res.json({ job: { ...publicJob(job), weights: job.weights } });
});

router.put('/:id', requireRole('recruiter'), validate({ body: jobSchema }), async (req, res) => {
  const job = await ownedJob(req.params.id, req.user);
  Object.assign(job, { ...req.body, requiredSkills: normalizeSkills(req.body.requiredSkills), preferredSkills: normalizeSkills(req.body.preferredSkills) });
  await job.save();
  const reassessed = await reassessJob(job);
  res.json({ job: publicJob(job), reassessed });
});

router.patch('/:id/status', requireRole('recruiter'), validate({ body: z.object({ status: z.enum(['open', 'closed']) }) }), async (req, res) => {
  const job = await ownedJob(req.params.id, req.user);
  job.status = req.body.status;
  job.closedAt = req.body.status === 'closed' ? new Date() : undefined;
  await job.save();
  res.json({ job: publicJob(job) });
});

// ---------- applying ----------
router.post('/:id/apply', requireRole('candidate'), validate({ body: z.object({ coverNote: z.string().trim().max(2000).optional() }) }), async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job || job.status !== 'open') throw new HttpError(404, 'This job is not accepting applications');
  const profile = await CandidateProfile.findOne({ user: req.user._id });
  if (!profile || profile.resume?.status !== 'parsed') throw new HttpError(400, 'Please upload a readable resume before applying');
  if (await Application.exists({ job: job._id, candidate: req.user._id })) throw new HttpError(409, 'You have already applied to this job');

  const app = new Application({ job: job._id, candidate: req.user._id, profile: profile._id, coverNote: req.body.coverNote });
  app.history.push({ from: null, to: 'submitted', by: req.user._id, byName: req.user.name, note: 'Application submitted' });
  await app.save();
  await assessApplication(app, { job });
  await Notification.create({ user: job.recruiter, title: 'New application', body: `${req.user.name} applied for ${job.title}`, link: `/recruiter/applications/${app._id}` });
  await Notification.create({ user: req.user._id, title: 'Application received', body: `Your application for ${job.title} was submitted.`, link: '/candidate/applications' });
  res.status(201).json({ application: app.toCandidateJSON() });
});

// ---------- ranked applicants with filters ----------
router.get('/:id/applicants', requireRole('recruiter'), async (req, res) => {
  const job = await ownedJob(req.params.id, req.user);
  const minScore = Number(req.query.minScore || 0);
  const status = req.query.status ? String(req.query.status).split(',') : null;
  const skill = req.query.skill ? normalizeSkill(String(req.query.skill)) : null;
  const sort = String(req.query.sort || 'score');

  const apps = await Application.find({ job: job._id }).populate('candidate', 'name email').populate('profile', 'parsed.totalExperienceYears experienceYearsOverride resume.status').lean();
  let rows = apps.map((a) => ({
    id: a._id,
    candidate: { id: a.candidate._id, name: a.candidate.name, email: a.candidate.email },
    status: a.status,
    score: a.override?.score ?? a.assessment?.score ?? null,
    aiScore: a.assessment?.score ?? null,
    overridden: a.override?.score != null,
    breakdown: a.assessment?.breakdown || null,
    matchedSkills: (a.assessment?.matchedSkills || []).map((m) => ({ skill: m.skill, matchedBy: m.matchedBy, required: m.required })),
    gaps: (a.assessment?.gaps || []).filter((g) => g.required).map((g) => ({ skill: g.skill, type: g.type })),
    years: a.profile?.experienceYearsOverride ?? a.profile?.parsed?.totalExperienceYears ?? 0,
    flags: (a.assessment?.flags || []).length,
    appliedAt: a.createdAt,
  }));
  if (minScore) rows = rows.filter((r) => (r.score ?? 0) >= minScore);
  if (status) rows = rows.filter((r) => status.includes(r.status));
  if (skill) rows = rows.filter((r) => r.matchedSkills.some((m) => m.skill === skill));
  rows.sort(sort === 'date' ? (a, b) => new Date(b.appliedAt) - new Date(a.appliedAt) : sort === 'experience' ? (a, b) => b.years - a.years : (a, b) => (b.score ?? -1) - (a.score ?? -1));
  rows.forEach((r, i) => { r.rank = i + 1; });
  res.json({ job: publicJob(job), applicants: rows });
});

/**
 * Talent pool discovery: previously reviewed applicants (from this company's other jobs) scored
 * against this job. Respects candidate consent and the data-retention window.
 */
router.get('/:id/talent-pool', requireRole('recruiter'), async (req, res) => {
  const job = await ownedJob(req.params.id, req.user);
  const colleagues = await User.find({ role: 'recruiter', company: req.user.company }).select('_id');
  const companyJobs = await Job.find({ recruiter: { $in: colleagues.map((c) => c._id) }, _id: { $ne: job._id } }).select('_id title');
  const reviewedStatuses = ['recruiter_review', 'shortlisted', 'rejected', 'interview', 'selected'];
  const pastApps = await Application.find({ job: { $in: companyJobs.map((j) => j._id) }, status: { $in: reviewedStatuses } }).select('profile candidate job status');
  const alreadyApplied = new Set((await Application.find({ job: job._id }).select('candidate')).map((a) => String(a.candidate)));
  const cutoff = new Date(Date.now() - config.retentionDays * 86400000);

  const profileIds = [...new Set(pastApps.filter((a) => !alreadyApplied.has(String(a.candidate))).map((a) => String(a.profile)))];
  const profiles = await CandidateProfile.find({ _id: { $in: profileIds }, talentPoolConsent: true, updatedAt: { $gte: cutoff }, mergedInto: null, 'resume.status': 'parsed' })
    .select('+chunks +embedding').populate('user', 'name email');
  const results = [];
  for (const p of profiles) {
    await ensureIndexed(p);
    const r = await scoreCandidate(job.toObject(), scoringView(p.toObject()), { embedFn: embed });
    const prior = pastApps.filter((a) => String(a.profile) === String(p._id)).map((a) => ({ job: companyJobs.find((j) => String(j._id) === String(a.job))?.title, status: a.status }));
    results.push({ profileId: p._id, candidate: { id: p.user._id, name: p.user.name, email: p.user.email }, score: r.score, matchedSkills: r.matchedSkills.map((m) => m.skill), gaps: r.gaps.filter((g) => g.required).map((g) => g.skill), topEvidence: r.matchedSkills.slice(0, 2).map((m) => m.evidence[0]).filter(Boolean), prior });
  }
  results.sort((a, b) => b.score - a.score);
  res.json({ pool: results.slice(0, 20), policy: { consentRequired: true, retentionDays: config.retentionDays } });
});

/** Invite a talent-pool candidate (simulated notification). */
router.post('/:id/invite', requireRole('recruiter'), validate({ body: z.object({ candidateId: z.string().regex(/^[a-f\d]{24}$/i) }) }), async (req, res) => {
  const job = await ownedJob(req.params.id, req.user);
  await Notification.create({ user: req.body.candidateId, title: 'You are invited to apply', body: `A recruiter thinks you'd be a good fit for ${job.title}.`, link: `/candidate/jobs/${job._id}` });
  res.json({ ok: true });
});

export default router;
