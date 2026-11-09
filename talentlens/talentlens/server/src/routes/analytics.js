import { Router } from 'express';
import Job from '../models/Job.js';
import Application, { STATUSES } from '../models/Application.js';
import Interview from '../models/Interview.js';
import { requireAuth, requireRole } from '../middleware/index.js';

const router = Router();
router.use(requireAuth, requireRole('recruiter'));

const SHORTLISTED = ['shortlisted', 'interview', 'selected'];
const PENDING = ['submitted', 'parsed', 'ai_assessed', 'recruiter_review'];

router.get('/overview', async (req, res) => {
  const jobs = await Job.find({ recruiter: req.user._id }).select('title status').lean();
  const jobIds = jobs.map((j) => j._id);
  const apps = await Application.find({ job: { $in: jobIds } }).select('job status createdAt decidedAt history assessment.gaps assessment.score override.score').lean();
  const upcoming = await Interview.countDocuments({ job: { $in: jobIds }, status: 'scheduled', start: { $gte: new Date() } });

  const byStage = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  apps.forEach((a) => { byStage[a.status] += 1; });

  const byJob = jobs.map((j) => {
    const mine = apps.filter((a) => String(a.job) === String(j._id));
    const scores = mine.map((a) => a.override?.score ?? a.assessment?.score).filter((s) => s != null);
    return {
      id: j._id, title: j.title, status: j.status,
      total: mine.length,
      shortlisted: mine.filter((a) => SHORTLISTED.includes(a.status)).length,
      rejected: mine.filter((a) => a.status === 'rejected').length,
      pending: mine.filter((a) => PENDING.includes(a.status)).length,
      avgScore: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
    };
  });

  const everShortlisted = apps.filter((a) => a.history?.some((h) => h.to === 'shortlisted')).length;
  const decided = apps.filter((a) => a.decidedAt);
  const avgProcessingHours = decided.length ? decided.reduce((sum, a) => sum + (new Date(a.decidedAt) - new Date(a.createdAt)), 0) / decided.length / 3600000 : null;

  // Most common job-related skill gaps across applicants (required skills only).
  const gapCounts = {};
  apps.forEach((a) => (a.assessment?.gaps || []).filter((g) => g.required).forEach((g) => {
    gapCounts[g.skill] = gapCounts[g.skill] || { skill: g.skill, count: 0, noEvidence: 0, weak: 0, absent: 0 };
    gapCounts[g.skill].count += 1;
    if (g.type === 'no_evidence') gapCounts[g.skill].noEvidence += 1;
    else if (g.type === 'weak_evidence') gapCounts[g.skill].weak += 1;
    else gapCounts[g.skill].absent += 1;
  }));
  const assessedCount = apps.filter((a) => a.assessment).length;

  // Applications per day for the last 14 days.
  const days = [...Array(14)].map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const trend = days.map((d) => ({ date: d.toISOString().slice(0, 10), count: apps.filter((a) => new Date(a.createdAt) >= d && new Date(a.createdAt) < new Date(d.getTime() + 86400000)).length }));

  const activity = apps.flatMap((a) => (a.history || []).map((h) => ({ ...h, application: a._id, job: jobs.find((j) => String(j._id) === String(a.job))?.title })))
    .sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 10);

  res.json({
    cards: {
      activeJobs: jobs.filter((j) => j.status === 'open').length,
      totalJobs: jobs.length,
      applications: apps.length,
      shortlisted: apps.filter((a) => SHORTLISTED.includes(a.status)).length,
      pendingReviews: apps.filter((a) => PENDING.includes(a.status)).length,
      upcomingInterviews: upcoming,
      selected: byStage.selected,
    },
    byStage,
    byJob,
    shortlistRate: apps.length ? Math.round((everShortlisted / apps.length) * 1000) / 10 : 0,
    avgProcessingHours: avgProcessingHours == null ? null : Math.round(avgProcessingHours * 10) / 10,
    skillGaps: Object.values(gapCounts).sort((a, b) => b.count - a.count).slice(0, 8).map((g) => ({ ...g, share: assessedCount ? Math.round((g.count / assessedCount) * 100) : 0 })),
    trend,
    activity,
  });
});

export default router;
