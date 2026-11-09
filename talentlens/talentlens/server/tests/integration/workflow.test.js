/**
 * End-to-end API test of the demonstration scenario, against an in-memory MongoDB:
 * recruiter posts a Backend Developer job -> three candidates upload PDF resumes and apply ->
 * applicants are scored with evidence -> recruiter shortlists one, generates questions,
 * schedules an interview -> dashboard reflects it. Also checks role-based access control.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../samples');

let mongo;
let app;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { setEmbeddingProvider } = await import('../../src/services/embeddings.js');
  setEmbeddingProvider('hash');
  const { createApp } = await import('../../src/app.js');
  app = createApp();
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const JD = `We're hiring a Backend Developer.
Requirements:
- 3+ years of professional experience with Python and Django
- Strong PostgreSQL skills
- Docker for local development and deployments
Nice to have:
- Kubernetes and AWS
Bachelor's degree in Computer Science or a related field`;

async function register(role, name, email, extra = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Passw0rd!', role, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return agent;
}

test('demonstration scenario end to end', async () => {
  // Recruiter posts the job, using AI extraction of requirements.
  const recruiter = await register('recruiter', 'Hina Raza', 'hina@test.com', { company: 'Acme' });
  const ex = await recruiter.post('/api/jobs/extract').send({ description: JD });
  assert.equal(ex.status, 200);
  const reqSkills = ex.body.requirements.requiredSkills.map(({ name, importance }) => ({ name, importance }));
  assert.deepEqual(reqSkills.map((s) => s.name).sort(), ['Django', 'Docker', 'PostgreSQL', 'Python']);

  const jobRes = await recruiter.post('/api/jobs').send({
    title: 'Backend Developer', department: 'Engineering', location: 'Islamabad', type: 'full-time', description: JD,
    requiredSkills: reqSkills, preferredSkills: ex.body.requirements.preferredSkills.map(({ name, importance }) => ({ name, importance })),
    minExperienceYears: 3, qualifications: ex.body.requirements.qualifications,
  });
  assert.equal(jobRes.status, 201, JSON.stringify(jobRes.body));
  const jobId = jobRes.body.job.id;

  // Three candidates upload resumes and apply.
  const candidates = {};
  for (const [name, email, file] of [['Ayesha Malik', 'ayesha@test.com', 'ayesha-malik.pdf'], ['Bilal Ahmed', 'bilal@test.com', 'bilal-ahmed.pdf'], ['Sara Iqbal', 'sara@test.com', 'sara-iqbal.pdf']]) {
    const agent = await register('candidate', name, email);
    const up = await agent.post('/api/profile/me/resume').attach('resume', path.join(SAMPLES, file));
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.profile.resume.status, 'parsed');
    assert.ok(up.body.profile.parsed.skills.length > 3);
    const ap = await agent.post(`/api/jobs/${jobId}/apply`).send({});
    assert.equal(ap.status, 201, JSON.stringify(ap.body));
    candidates[name] = agent;
  }

  // Duplicate application is rejected.
  const dup = await candidates['Ayesha Malik'].post(`/api/jobs/${jobId}/apply`).send({});
  assert.equal(dup.status, 409);

  // Ranked, explained scores for human review.
  const ranked = await recruiter.get(`/api/jobs/${jobId}/applicants`);
  assert.equal(ranked.status, 200);
  assert.equal(ranked.body.applicants.length, 3);
  const [top, , last] = ranked.body.applicants;
  assert.equal(top.candidate.name, 'Ayesha Malik');
  assert.equal(last.candidate.name, 'Sara Iqbal');
  assert.ok(top.score > last.score);
  assert.equal(top.status, 'ai_assessed');

  const detail = await recruiter.get(`/api/applications/${top.id}`);
  assert.equal(detail.status, 200);
  const a = detail.body.application.assessment;
  assert.ok(a.matchedSkills.every((m) => m.evidence.length > 0));
  assert.ok(a.explanation.length > 2);
  assert.ok(detail.body.allowedTransitions.includes('shortlisted'));

  const sara = await recruiter.get(`/api/applications/${last.id}`);
  assert.ok(sara.body.application.assessment.gaps.some((g) => g.type === 'no_evidence'));

  // Candidate sees status only: no score, notes or AI internals.
  const mine = await candidates['Ayesha Malik'].get('/api/applications/mine');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.applications[0].assessment, undefined);
  const peek = await candidates['Ayesha Malik'].get(`/api/applications/${top.id}`);
  assert.equal(peek.body.application.assessment, undefined);
  assert.equal(peek.body.application.notes, undefined);

  // Recruiter shortlists (human decision), adds a note.
  const sl = await recruiter.patch(`/api/applications/${top.id}/status`).send({ status: 'shortlisted', note: 'Strong Django + Docker evidence' });
  assert.equal(sl.status, 200, JSON.stringify(sl.body));
  const bad = await recruiter.patch(`/api/applications/${last.id}/status`).send({ status: 'selected' });
  assert.equal(bad.status, 409, 'cannot skip pipeline stages');
  await recruiter.post(`/api/applications/${top.id}/notes`).send({ text: 'Ask about query tuning' });

  // Interview questions.
  const qs = await recruiter.post(`/api/applications/${top.id}/questions/generate`).send({});
  assert.equal(qs.status, 200);
  assert.ok(qs.body.questions.length >= 5);
  assert.ok(new Set(qs.body.questions.map((q) => q.difficulty)).size >= 2);

  // Schedule interview, then detect a conflict for the same interviewer.
  const start = new Date(Date.now() + 2 * 86400000).toISOString();
  const iv = await recruiter.post('/api/interviews').send({ applicationId: top.id, start, durationMinutes: 60, type: 'technical', interviewer: { name: 'Omar Farooq', email: 'omar@acme.com' } });
  assert.equal(iv.status, 201, JSON.stringify(iv.body));

  await recruiter.patch(`/api/applications/${ranked.body.applicants[1].id}/status`).send({ status: 'shortlisted' });
  const clash = await recruiter.post('/api/interviews').send({ applicationId: ranked.body.applicants[1].id, start, durationMinutes: 30, type: 'video', interviewer: { name: 'Omar Farooq', email: 'omar@acme.com' } });
  assert.equal(clash.status, 409);
  assert.ok(clash.body.conflicts.length === 1);

  // Dashboard updates.
  const dash = await recruiter.get('/api/analytics/overview');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.cards.activeJobs, 1);
  assert.equal(dash.body.cards.applications, 3);
  assert.equal(dash.body.byStage.interview, 1);
  assert.equal(dash.body.cards.upcomingInterviews, 1);
  assert.ok(dash.body.shortlistRate > 0);
  assert.ok(dash.body.skillGaps.length > 0);

  // Audit trail recorded every step.
  const after1 = await recruiter.get(`/api/applications/${top.id}`);
  const steps = after1.body.application.history.map((h) => h.to);
  for (const s of ['submitted', 'parsed', 'ai_assessed', 'shortlisted', 'interview']) assert.ok(steps.includes(s), s);

  // Fairness check passes on a real resume.
  const fair = await recruiter.post(`/api/applications/${top.id}/fairness`);
  assert.equal(fair.status, 200);
  assert.equal(fair.body.fairness.passed, true);

  // Natural-language search returns evidence.
  const search = await recruiter.post('/api/search/talent').send({ query: 'Python developers with REST API experience' });
  assert.equal(search.status, 200);
  assert.ok(search.body.results.length >= 2);
  assert.ok(search.body.results[0].evidence.length > 0);

  // Role-based access control.
  assert.equal((await candidates['Sara Iqbal'].get('/api/analytics/overview')).status, 403);
  assert.equal((await candidates['Sara Iqbal'].get(`/api/jobs/${jobId}/applicants`)).status, 403);
  assert.equal((await request(app).get('/api/jobs')).status, 401);
  const other = await register('recruiter', 'Other Recruiter', 'other@test.com', { company: 'Other' });
  assert.equal((await other.get(`/api/applications/${top.id}`)).status, 403);
});

test('validation and upload errors are handled gracefully', async () => {
  const agent = request.agent(app);
  const weak = await agent.post('/api/auth/register').send({ name: 'X', email: 'not-an-email', password: 'short', role: 'candidate' });
  assert.equal(weak.status, 400);
  assert.ok(weak.body.details.length >= 2);

  const cand = await register('candidate', 'Test User', 'upload@test.com');
  const txt = await cand.post('/api/profile/me/resume').attach('resume', Buffer.from('hello'), { filename: 'resume.txt', contentType: 'text/plain' });
  assert.equal(txt.status, 415);
  const fake = await cand.post('/api/profile/me/resume').attach('resume', Buffer.from('not really a pdf'), { filename: 'resume.pdf', contentType: 'application/pdf' });
  assert.equal(fake.status, 415);

  const login = await request(app).post('/api/auth/login').send({ email: 'upload@test.com', password: 'wrong-password1' });
  assert.equal(login.status, 401);
  const inj = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: 'x' });
  assert.equal(inj.status, 400);
});
