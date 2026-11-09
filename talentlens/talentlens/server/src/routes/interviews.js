import { Router } from 'express';
import { z } from 'zod';
import Interview from '../models/Interview.js';
import Application from '../models/Application.js';
import Job from '../models/Job.js';
import Notification from '../models/Notification.js';
import { HttpError, requireAuth, requireRole, validate } from '../middleware/index.js';
import { pushHistory } from '../services/assessment.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const scheduleSchema = z.object({
  applicationId: objectId,
  start: z.coerce.date().refine((d) => d.getTime() > Date.now() - 5 * 60000, 'Interview must be scheduled in the future'),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(45),
  type: z.enum(['phone', 'video', 'onsite', 'technical', 'hr']).default('video'),
  interviewer: z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().optional().or(z.literal('')) }),
  locationOrLink: z.string().trim().max(300).optional(),
  force: z.boolean().default(false),
});

/** Overlapping interviews for the same interviewer or the same candidate. */
export async function findConflicts({ start, durationMinutes, interviewer, candidate, excludeId }) {
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const windowStart = new Date(start.getTime() - 8 * 3600000);
  const nearby = await Interview.find({ status: 'scheduled', start: { $gte: windowStart, $lt: end }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).populate('candidate', 'name');
  return nearby
    .filter((i) => i.end > start)
    .filter((i) => String(i.candidate._id) === String(candidate) || (interviewer.email && i.interviewer.email === interviewer.email) || i.interviewer.name.toLowerCase() === interviewer.name.toLowerCase())
    .map((i) => ({ id: i._id, start: i.start, end: i.end, interviewer: i.interviewer.name, candidate: i.candidate.name, reason: String(i.candidate._id) === String(candidate) ? 'Candidate already has an interview at this time' : 'Interviewer is already booked at this time' }));
}

router.get('/', async (req, res) => {
  if (req.user.role === 'candidate') {
    const list = await Interview.find({ candidate: req.user._id }).sort({ start: 1 }).populate('job', 'title').select('-feedback');
    return res.json({ interviews: list });
  }
  const jobs = await Job.find({ recruiter: req.user._id }).select('_id');
  const filter = { job: { $in: jobs.map((j) => j._id) } };
  if (req.query.status) filter.status = String(req.query.status);
  const list = await Interview.find(filter).sort({ start: 1 }).populate('job', 'title').populate('candidate', 'name email');
  res.json({ interviews: list });
});

router.post('/', requireRole('recruiter'), validate({ body: scheduleSchema }), async (req, res) => {
  const { applicationId, force, ...data } = req.body;
  const app = await Application.findById(applicationId);
  if (!app) throw new HttpError(404, 'Application not found');
  const job = await Job.findById(app.job);
  if (String(job.recruiter) !== String(req.user._id)) throw new HttpError(403, 'You do not have access to this application');
  if (!['shortlisted', 'interview'].includes(app.status)) throw new HttpError(409, 'Shortlist the candidate before scheduling an interview');

  const conflicts = await findConflicts({ ...data, candidate: app.candidate });
  if (conflicts.length && !force) return res.status(409).json({ error: 'Scheduling conflict detected', conflicts });

  const interview = await Interview.create({ ...data, interviewer: { name: data.interviewer.name, email: data.interviewer.email || undefined }, application: app._id, job: job._id, candidate: app.candidate, scheduledBy: req.user._id });
  if (app.status === 'shortlisted') {
    pushHistory(app, 'interview', req.user, `Interview scheduled for ${data.start.toISOString()}`);
    await app.save();
  }
  await Notification.create({ user: app.candidate, title: `Interview scheduled: ${job.title}`, body: `${data.type} interview on ${data.start.toUTCString()} (${data.durationMinutes} min).`, link: '/candidate/applications' });
  res.status(201).json({ interview, conflicts });
});

router.patch('/:id', requireRole('recruiter'), validate({ body: z.object({ start: z.coerce.date().optional(), durationMinutes: z.coerce.number().int().min(15).max(480).optional(), status: z.enum(['scheduled', 'completed', 'cancelled']).optional(), locationOrLink: z.string().trim().max(300).optional(), force: z.boolean().default(false) }) }), async (req, res) => {
  const interview = await Interview.findById(req.params.id);
  if (!interview) throw new HttpError(404, 'Interview not found');
  const job = await Job.findById(interview.job);
  if (String(job.recruiter) !== String(req.user._id)) throw new HttpError(403, 'You do not have access to this interview');
  const { force, ...changes } = req.body;
  if (changes.start || changes.durationMinutes) {
    const conflicts = await findConflicts({ start: changes.start || interview.start, durationMinutes: changes.durationMinutes || interview.durationMinutes, interviewer: interview.interviewer, candidate: interview.candidate, excludeId: interview._id });
    if (conflicts.length && !force) return res.status(409).json({ error: 'Scheduling conflict detected', conflicts });
  }
  Object.assign(interview, changes);
  await interview.save();
  if (changes.start || changes.status === 'cancelled') {
    await Notification.create({ user: interview.candidate, title: `Interview ${changes.status === 'cancelled' ? 'cancelled' : 'rescheduled'}: ${job.title}`, body: changes.start ? `New time: ${interview.start.toUTCString()}` : 'Your interview was cancelled.', link: '/candidate/applications' });
  }
  res.json({ interview });
});

const rating = z.coerce.number().int().min(1).max(5);
router.post('/:id/feedback', requireRole('recruiter'), validate({ body: z.object({
  ratings: z.object({ technical: rating, communication: rating, problemSolving: rating, roleFit: rating }),
  strengths: z.string().trim().max(2000).default(''),
  concerns: z.string().trim().max(2000).default(''),
  recommendation: z.enum(['strong_yes', 'yes', 'no', 'strong_no']),
}) }), async (req, res) => {
  const interview = await Interview.findById(req.params.id);
  if (!interview) throw new HttpError(404, 'Interview not found');
  const job = await Job.findById(interview.job);
  if (String(job.recruiter) !== String(req.user._id)) throw new HttpError(403, 'You do not have access to this interview');
  interview.feedback = { ...req.body, submittedBy: req.user._id, submittedAt: new Date() };
  interview.status = 'completed';
  await interview.save();
  const app = await Application.findById(interview.application);
  app.history.push({ from: app.status, to: app.status, by: req.user._id, byName: req.user.name, note: `Interview feedback recorded (${req.body.recommendation.replace('_', ' ')})` });
  await app.save();
  res.json({ interview });
});

export default router;
