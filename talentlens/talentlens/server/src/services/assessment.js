/** Orchestrates AI assessment of an application and keeps the audit trail consistent. */
import Application from '../models/Application.js';
import CandidateProfile from '../models/CandidateProfile.js';
import Job from '../models/Job.js';
import { scoreCandidate, scoringView } from './matcher.js';
import { embed } from './embeddings.js';
import { ensureIndexed } from './profilePipeline.js';

export function pushHistory(app, to, user, note) {
  app.history.push({ from: app.status, to, by: user?._id, byName: user ? user.name : 'System', note, at: new Date() });
  app.status = to;
}

export async function loadScoringProfile(profileId) {
  const profile = await CandidateProfile.findById(profileId).select('+chunks +embedding +parsed.sanitizedText');
  return ensureIndexed(profile);
}

/** Run (or re-run) scoring. Advances submitted/parsed applications through the automatic states. */
export async function assessApplication(appOrId, { job = null } = {}) {
  const app = appOrId instanceof Application ? appOrId : await Application.findById(appOrId);
  if (!app) return null;
  const theJob = job || (await Job.findById(app.job));
  const profile = await loadScoringProfile(app.profile);

  if (!profile || profile.resume?.status !== 'parsed') {
    app.assessment = null;
    await app.save();
    return app;
  }

  if (app.status === 'submitted') pushHistory(app, 'parsed', null, 'Resume parsed');
  const result = await scoreCandidate(theJob.toObject(), scoringView(profile.toObject()), { embedFn: embed, recruiterAbsent: app.recruiterAbsent || [] });
  app.assessment = result;
  app.assessedAt = new Date();
  app.markModified('assessment');
  if (app.status === 'parsed') pushHistory(app, 'ai_assessed', null, `AI assessment available (score ${result.score})`);
  await app.save();
  return app;
}

/** Re-assess every open application of a candidate (e.g. after a new resume or skill corrections). */
export async function reassessCandidate(profileId) {
  const apps = await Application.find({ profile: profileId, status: { $nin: ['selected', 'rejected'] } });
  for (const a of apps) await assessApplication(a);
  return apps.length;
}

/** Re-assess all active applications of a job (e.g. after requirements change). */
export async function reassessJob(job) {
  const apps = await Application.find({ job: job._id, status: { $nin: ['selected', 'rejected'] } });
  for (const a of apps) await assessApplication(a, { job });
  return apps.length;
}

export const effectiveScore = (app) => (app.override?.score ?? app.assessment?.score ?? null);
