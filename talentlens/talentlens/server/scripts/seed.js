/**
 * Demo data for the final demonstration scenario.
 *   npm run seed            -> seeds an empty database
 *   npm run seed -- --reset -> wipes the configured database first
 *
 * Creates a recruiter, a "Backend Developer" job (Python, Django, PostgreSQL, Docker), three
 * applicants who apply with real PDF resumes (parsed and scored by the actual pipeline), plus a
 * second job whose reviewed applicants feed the talent pool and the duplicate-detection demo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import User from '../src/models/User.js';
import CandidateProfile from '../src/models/CandidateProfile.js';
import ResumeFile from '../src/models/ResumeFile.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import Interview from '../src/models/Interview.js';
import Notification from '../src/models/Notification.js';
import { extractText } from '../src/services/textExtract.js';
import { buildProfileFromText } from '../src/services/profilePipeline.js';
import { extractRequirements } from '../src/services/jobExtraction.js';
import { assessApplication, pushHistory } from '../src/services/assessment.js';

const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../samples');
const PASSWORD = 'Demo@1234';

const BACKEND_JD = `We're hiring a Backend Developer to build and scale the APIs behind our hiring platform.
Requirements:
- 3+ years of professional experience with Python and Django
- Strong PostgreSQL skills, including schema design and query tuning
- Docker for local development and deployments
Nice to have:
- Kubernetes and AWS experience
- Celery or other background job queues
Qualifications: Bachelor's degree in Computer Science or a related field`;

const FRONTEND_JD = `We are looking for a Frontend Engineer to build our recruiter dashboard.
Requirements:
- 2+ years of experience with React and JavaScript
- Solid CSS and responsive design
Nice to have: TypeScript, Next.js
Bachelor's degree in Computer Science or similar`;

async function candidate(name, email, file) {
  const user = await User.create({ name, email, role: 'candidate', passwordHash: await bcrypt.hash(PASSWORD, 12) });
  const buffer = fs.readFileSync(path.join(SAMPLES, file));
  const { text } = await extractText(buffer, file);
  const built = await buildProfileFromText(text);
  const stored = await ResumeFile.create({ owner: user._id, fileName: file, mimeType: 'application/pdf', size: buffer.length, data: buffer });
  const { name: n, email: e, phone, links, summary, skills, education, experience, totalExperienceYears, projects, sanitizedText, warnings, protectedLines } = built.parsed;
  const profile = await CandidateProfile.create({
    user: user._id,
    phone,
    resume: { fileId: stored._id, fileName: file, mimeType: 'application/pdf', size: buffer.length, uploadedAt: new Date(), status: built.parsed.status, text },
    parsed: { name: n, email: e, phone, links, summary, skills, education, experience, totalExperienceYears, projects, sanitizedText, warnings, protectedLinesRemoved: protectedLines.length },
    chunks: built.chunks, embedding: built.embedding, embeddingModel: built.embeddingModel,
    interests: ['APIs', 'backend'],
  });
  return { user, profile };
}

async function apply(job, { user, profile }, daysAgo = 0) {
  const app = new Application({ job: job._id, candidate: user._id, profile: profile._id });
  app.history.push({ from: null, to: 'submitted', by: user._id, byName: user.name, note: 'Application submitted', at: new Date(Date.now() - daysAgo * 86400000) });
  app.createdAt = new Date(Date.now() - daysAgo * 86400000);
  await app.save();
  await assessApplication(app, { job });
  return app;
}

async function main() {
  await mongoose.connect(config.mongoUri);
  if (process.argv.includes('--reset')) {
    await Promise.all([User, CandidateProfile, ResumeFile, Job, Application, Interview, Notification].map((m) => m.deleteMany({})));
    console.log('Database cleared.');
  } else if (await User.estimatedDocumentCount()) {
    console.log('Database already has users. Run "npm run seed -- --reset" to wipe and reseed.');
    return mongoose.disconnect();
  }
  await Promise.all([User, Application].map((m) => m.syncIndexes()));

  const recruiter = await User.create({ name: 'Hina Raza', email: 'recruiter@demo.com', role: 'recruiter', company: 'Riphah Tech', passwordHash: await bcrypt.hash(PASSWORD, 12) });

  const be = await extractRequirements(BACKEND_JD);
  const backend = await Job.create({ recruiter: recruiter._id, title: 'Backend Developer', department: 'Engineering', location: 'Islamabad (hybrid)', type: 'full-time', salaryMin: 250000, salaryMax: 400000, currency: 'PKR', description: BACKEND_JD, requiredSkills: be.requiredSkills.map(({ name, importance }) => ({ name, importance })), preferredSkills: be.preferredSkills.map(({ name, importance }) => ({ name, importance })), minExperienceYears: be.minExperienceYears, qualifications: be.qualifications });

  const fe = await extractRequirements(FRONTEND_JD);
  const frontend = await Job.create({ recruiter: recruiter._id, title: 'Frontend Engineer', department: 'Engineering', location: 'Lahore', type: 'full-time', description: FRONTEND_JD, requiredSkills: fe.requiredSkills.map(({ name, importance }) => ({ name, importance })), preferredSkills: fe.preferredSkills.map(({ name, importance }) => ({ name, importance })), minExperienceYears: fe.minExperienceYears, qualifications: fe.qualifications, createdAt: new Date(Date.now() - 20 * 86400000) });

  const ayesha = await candidate('Ayesha Malik', 'ayesha@demo.com', 'ayesha-malik.pdf');
  const bilal = await candidate('Bilal Ahmed', 'bilal@demo.com', 'bilal-ahmed.pdf');
  const sara = await candidate('Sara Iqbal', 'sara@demo.com', 'sara-iqbal.pdf');
  const usman = await candidate('Usman Tariq', 'usman@demo.com', 'usman-tariq.pdf');
  const ayesha2 = await candidate('Ayesha Malik', 'ayesha.second@demo.com', 'ayesha-malik-duplicate.pdf');

  // Earlier, already-reviewed applications to the frontend job (talent pool + analytics history).
  for (const [c, days, status] of [[usman, 12, 'recruiter_review'], [sara, 10, 'shortlisted'], [ayesha2, 9, 'rejected']]) {
    const app = await apply(frontend, c, days);
    pushHistory(app, 'recruiter_review', recruiter, 'Reviewed');
    if (status !== 'recruiter_review') {
      pushHistory(app, status, recruiter, status === 'rejected' ? 'Backend profile, not frontend' : 'Strong React work');
      app.decidedAt = new Date(Date.now() - (days - 2) * 86400000);
    }
    await app.save();
  }

  // The demo scenario: three candidates apply to the Backend Developer job.
  for (const [c, days] of [[ayesha, 2], [bilal, 1], [sara, 0]]) await apply(backend, c, days);

  console.log('\nSeed complete. Sign in with password', PASSWORD);
  console.log('  Recruiter : recruiter@demo.com');
  console.log('  Candidates: ayesha@demo.com, bilal@demo.com, sara@demo.com, usman@demo.com');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
