import { Router } from 'express';
import { z } from 'zod';
import Application, { TRANSITIONS } from '../models/Application.js';
import CandidateProfile from '../models/CandidateProfile.js';
import Job from '../models/Job.js';
import Interview from '../models/Interview.js';
import Notification from '../models/Notification.js';
import ResumeFile from '../models/ResumeFile.js';
import { HttpError, requireAuth, requireRole, validate } from '../middleware/index.js';
import { assessApplication, pushHistory, reassessCandidate } from '../services/assessment.js';
import { generateQuestions, QUESTION_TYPES } from '../services/questions.js';
import { fairnessCheck } from '../services/fairness.js';
import { verifyClaims, verifyProfileSkills } from '../services/verification.js';
import { normalizeSkill } from '../services/skills.js';
import { scoringView } from '../services/matcher.js';
import { profileJSON } from './profile.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParams = z.object({ id: objectId });

const CANDIDATE_STATUS_TEXT = {
  shortlisted: 'Good news — you have been shortlisted.',
  rejected: 'Thank you for applying. The team has decided not to move forward at this time.',
  interview: 'You have been invited to interview.',
  selected: 'Congratulations — you have been selected!',
};

/** Load an application the current recruiter owns (via the job). */
async function recruiterApp(id, user, { withProfile = false } = {}) {
  const app = await Application.findById(id);
  if (!app) throw new HttpError(404, 'Application not found');
  const job = await Job.findById(app.job);
  if (!job || String(job.recruiter) !== String(user._id)) throw new HttpError(403, 'You do not have access to this application');
  const profile = withProfile ? await CandidateProfile.findById(app.profile).select('+resume.text +parsed.sanitizedText +chunks') : null;
  return { app, job, profile };
}

async function notifyCandidate(app, job, status) {
  if (!CANDIDATE_STATUS_TEXT[status]) return;
  await Notification.create({ user: app.candidate, title: `Update on ${job.title}`, body: CANDIDATE_STATUS_TEXT[status], link: '/candidate/applications' });
}

// ---------- candidate: my applications ----------
router.get('/mine', requireRole('candidate'), async (req, res) => {
  const apps = await Application.find({ candidate: req.user._id }).sort({ createdAt: -1 }).populate('job', 'title department location type status');
  const interviews = await Interview.find({ candidate: req.user._id, status: 'scheduled' }).select('application start type durationMinutes locationOrLink');
  res.json({
    applications: apps.map((a) => ({
      ...a.toCandidateJSON(),
      interviews: interviews.filter((i) => String(i.application) === String(a._id)).map((i) => ({ start: i.start, type: i.type, durationMinutes: i.durationMinutes, locationOrLink: i.locationOrLink })),
    })),
  });
});

// ---------- recruiter: side-by-side comparison ----------
router.get('/compare', requireRole('recruiter'), async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter((x) => /^[a-f\d]{24}$/i.test(x)).slice(0, 4);
  if (ids.length < 2) throw new HttpError(400, 'Select 2 to 4 applications to compare');
  const rows = [];
  for (const id of ids) {
    const { app, job } = await recruiterApp(id, req.user);
    const profile = await CandidateProfile.findById(app.profile).populate('user', 'name');
    rows.push({ id: app._id, jobId: job._id, jobTitle: job.title, name: profile.user.name, status: app.status, score: app.override?.score ?? app.assessment?.score ?? null, aiScore: app.assessment?.score ?? null, assessment: app.assessment, years: profile.experienceYearsOverride ?? profile.parsed?.totalExperienceYears ?? 0, education: (profile.parsed?.education || []).map((e) => e.text), projects: (profile.parsed?.projects || []).map((p) => p.name) });
  }
  const jobIds = new Set(rows.map((r) => String(r.jobId)));
  const job = await Job.findById(rows[0].jobId);
  res.json({ sameJob: jobIds.size === 1, job: { id: job._id, title: job.title, requiredSkills: job.requiredSkills, preferredSkills: job.preferredSkills }, candidates: rows });
});

// ---------- detail ----------
router.get('/:id', validate({ params: idParams }), async (req, res) => {
  if (req.user.role === 'candidate') {
    const app = await Application.findOne({ _id: req.params.id, candidate: req.user._id }).populate('job', 'title department location type');
    if (!app) throw new HttpError(404, 'Application not found');
    return res.json({ application: app.toCandidateJSON() }); // no scores, notes or AI internals
  }
  const { app, job, profile } = await recruiterApp(req.params.id, req.user, { withProfile: true });
  await app.populate('candidate', 'name email');
  const interviews = await Interview.find({ application: app._id }).sort({ start: 1 });
  const view = scoringView(profile.toObject());
  res.json({
    application: app.toObject(),
    job,
    profile: profileJSON(profile),
    verification: verifyProfileSkills(view.skills.filter((s) => !s.removed), profile.resume?.text || ''),
    interviews,
    allowedTransitions: TRANSITIONS[app.status] || [],
  });
});

router.get('/:id/resume', requireRole('recruiter'), validate({ params: idParams }), async (req, res) => {
  const { app } = await recruiterApp(req.params.id, req.user);
  const profile = await CandidateProfile.findById(app.profile);
  const file = profile?.resume?.fileId && (await ResumeFile.findById(profile.resume.fileId));
  if (!file) throw new HttpError(404, 'Resume file not found');
  res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"` });
  res.send(file.data);
});

// ---------- pipeline: manual status changes (human in control) ----------
router.patch('/:id/status', requireRole('recruiter'), validate({ params: idParams, body: z.object({ status: z.enum(['recruiter_review', 'shortlisted', 'rejected', 'interview', 'selected']), note: z.string().trim().max(500).optional() }) }), async (req, res) => {
  const { app, job } = await recruiterApp(req.params.id, req.user);
  const { status, note } = req.body;
  if (!(TRANSITIONS[app.status] || []).includes(status)) throw new HttpError(409, `Cannot move from "${app.status}" to "${status}"`);
  if (status === 'selected' || (status === 'rejected' && app.status === 'interview')) {
    app.decision = { outcome: status, by: req.user._id, at: new Date(), reason: note };
  }
  if (!app.decidedAt && ['shortlisted', 'rejected'].includes(status)) app.decidedAt = new Date();
  pushHistory(app, status, req.user, note);
  await app.save();
  await notifyCandidate(app, job, status);
  res.json({ application: app.toObject(), allowedTransitions: TRANSITIONS[app.status] || [] });
});

router.post('/:id/notes', requireRole('recruiter'), validate({ params: idParams, body: z.object({ text: z.string().trim().min(1).max(2000) }) }), async (req, res) => {
  const { app } = await recruiterApp(req.params.id, req.user);
  app.notes.push({ author: req.user._id, authorName: req.user.name, text: req.body.text });
  await app.save();
  res.status(201).json({ notes: app.notes });
});

router.post('/:id/override', requireRole('recruiter'), validate({ params: idParams, body: z.object({ score: z.number().min(0).max(100).nullable(), reason: z.string().trim().max(500).optional() }) }), async (req, res) => {
  const { app } = await recruiterApp(req.params.id, req.user);
  if (req.body.score === null) app.override = undefined;
  else {
    if (!req.body.reason) throw new HttpError(400, 'Please give a reason for overriding the AI score');
    app.override = { score: req.body.score, reason: req.body.reason, by: req.user._id, at: new Date() };
  }
  app.history.push({ from: app.status, to: app.status, by: req.user._id, byName: req.user.name, note: req.body.score === null ? 'Score override removed' : `Score overridden to ${req.body.score}: ${req.body.reason}` });
  await app.save();
  res.json({ application: app.toObject() });
});

router.post('/:id/reassess', requireRole('recruiter'), validate({ params: idParams }), async (req, res) => {
  const { app, job } = await recruiterApp(req.params.id, req.user);
  await assessApplication(app, { job });
  res.json({ application: app.toObject() });
});

/** Recruiter skill corrections: add/remove extracted skills, or confirm a skill is absent. */
router.post('/:id/skills', requireRole('recruiter'), validate({ params: idParams, body: z.object({
  add: z.array(z.object({ name: z.string().trim().min(1).max(60), evidence: z.string().trim().max(300).optional() })).max(20).default([]),
  remove: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  confirmAbsent: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  clearAbsent: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
}) }), async (req, res) => {
  const { app } = await recruiterApp(req.params.id, req.user);
  const profile = await CandidateProfile.findById(app.profile);
  for (const s of req.body.add) profile.skillCorrections.push({ name: normalizeSkill(s.name), action: 'add', by: 'recruiter', evidence: s.evidence });
  for (const n of req.body.remove) profile.skillCorrections.push({ name: normalizeSkill(n), action: 'remove', by: 'recruiter' });
  await profile.save();
  const absent = new Set(app.recruiterAbsent || []);
  req.body.confirmAbsent.forEach((n) => absent.add(normalizeSkill(n)));
  req.body.clearAbsent.forEach((n) => absent.delete(normalizeSkill(n)));
  app.recruiterAbsent = [...absent];
  const changes = [...req.body.add.map((s) => `+${s.name}`), ...req.body.remove.map((s) => `-${s}`), ...req.body.confirmAbsent.map((s) => `absent:${s}`)].join(', ');
  if (changes) app.history.push({ from: app.status, to: app.status, by: req.user._id, byName: req.user.name, note: `Skills corrected (${changes})` });
  await app.save();
  await reassessCandidate(profile._id);
  const fresh = await Application.findById(app._id);
  res.json({ application: fresh.toObject(), profile: profileJSON(profile) });
});

// ---------- interview questions ----------
router.post('/:id/questions/generate', requireRole('recruiter'), validate({ params: idParams, body: z.object({ focus: z.string().trim().max(300).optional(), replaceId: z.string().max(60).optional(), previousQuestions: z.array(z.string().max(500)).max(100).optional() }) }), async (req, res) => {
  const { app, job, profile } = await recruiterApp(req.params.id, req.user, { withProfile: true });
  // Everything already shown for this application (stored history + current set + what the client sent) is excluded.
  const previous = [...new Set([...(app.previousQuestions || []), ...(app.questions || []).map((q) => q.text), ...(req.body.previousQuestions || [])].filter(Boolean))];
  const parsed = profile.toObject().parsed;
  if (req.body.replaceId) {
    // Regenerate a single question: replace it with a new, unseen one of the same type.
    const old = app.questions.find((q) => q.id === req.body.replaceId);
    if (old) {
      const type = QUESTION_TYPES.includes(old.type) ? old.type : 'technical';
      const [pick] = await generateQuestions(job.toObject(), parsed, app.assessment, { focus: req.body.focus, previousQuestions: previous, mix: { [type]: 1 } });
      if (pick) app.questions = app.questions.map((q) => (q.id === old.id ? pick : q));
    }
  } else {
    app.questions = await generateQuestions(job.toObject(), parsed, app.assessment, { focus: req.body.focus, previousQuestions: previous });
  }
  app.previousQuestions = [...new Set([...previous, ...app.questions.map((q) => q.text)])].slice(-100);
  await app.save();
  res.json({ questions: app.questions, previousQuestions: app.previousQuestions });
});

router.put('/:id/questions', requireRole('recruiter'), validate({ params: idParams, body: z.object({ questions: z.array(z.object({
  id: z.string().max(60), text: z.string().trim().min(5).max(500), difficulty: z.enum(['beginner', 'intermediate', 'advanced']), type: z.enum(['technical', 'project', 'scenario', 'behavioral', 'role', 'gap']).default('technical'),
  skill: z.string().max(60).nullable().optional(), projectRef: z.string().max(120).nullable().optional(), guideline: z.string().max(500).default(''), source: z.string().max(40).optional(), flagged: z.boolean().optional(), flagReason: z.string().nullable().optional(), edited: z.boolean().optional(),
})).max(30) }) }), async (req, res) => {
  const { app } = await recruiterApp(req.params.id, req.user);
  const before = new Map(app.questions.map((q) => [q.id, q.text]));
  app.questions = req.body.questions.map((q) => ({ ...q, edited: q.edited || (before.has(q.id) && before.get(q.id) !== q.text) }));
  await app.save();
  res.json({ questions: app.questions });
});

// ---------- fairness & hallucination checks ----------
router.post('/:id/fairness', requireRole('recruiter'), validate({ params: idParams }), async (req, res) => {
  const { app, job, profile } = await recruiterApp(req.params.id, req.user, { withProfile: true });
  if (!profile.resume?.text) throw new HttpError(400, 'No resume text available for this application');
  app.fairness = await fairnessCheck(job.toObject(), profile.resume.text);
  app.markModified('fairness');
  await app.save();
  res.json({ fairness: app.fairness });
});

router.post('/:id/verify', requireRole('recruiter'), validate({ params: idParams }), async (req, res) => {
  const { app, profile } = await recruiterApp(req.params.id, req.user, { withProfile: true });
  const text = profile.resume?.text || '';
  const claims = [
    ...(app.assessment?.matchedSkills || []).map((m) => ({ claim: `Has ${m.skill}`, skill: m.skill })),
    ...(app.questions || []).filter((q) => q.projectRef).map((q) => ({ claim: `Worked on project "${q.projectRef}"` })),
    ...(app.assessment?.explanation || []).filter((e) => !/^Gap:|^Matched|years of experience/.test(e)).slice(0, 5).map((e) => ({ claim: e })),
  ];
  const results = await verifyClaims(claims, text, profile.chunks || []);
  res.json({ results, unsupported: results.filter((r) => !r.supported).length });
});

export default router;
