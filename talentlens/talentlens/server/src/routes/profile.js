import { Router } from 'express';
import { z } from 'zod';
import CandidateProfile from '../models/CandidateProfile.js';
import ResumeFile from '../models/ResumeFile.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import { HttpError, requireAuth, requireRole, validate, resumeUpload } from '../middleware/index.js';
import { extractText } from '../services/textExtract.js';
import { buildProfileFromText, ensureIndexed } from '../services/profilePipeline.js';
import { reassessCandidate } from '../services/assessment.js';
import { normalizeSkill } from '../services/skills.js';
import { verifyProfileSkills } from '../services/verification.js';
import { scoreCandidate, scoringView } from '../services/matcher.js';
import { embed, cosine } from '../services/embeddings.js';

const router = Router();
router.use(requireAuth, requireRole('candidate'));

async function myProfile(userId, extra = '') {
  const p = await CandidateProfile.findOne({ user: userId }).select(extra);
  if (!p) return CandidateProfile.create({ user: userId });
  return p;
}

export function profileJSON(p) {
  const o = p.toObject();
  delete o.embedding;
  delete o.chunks;
  if (o.resume) delete o.resume.text;
  if (o.parsed) delete o.parsed.sanitizedText;
  // Effective skill list = parser output + corrections.
  const view = scoringView(o);
  o.effectiveSkills = view.skills.filter((s) => !s.removed).map((s) => ({ name: s.name, evidence: s.evidence || [], source: s.source || 'parser' }));
  return o;
}

router.get('/me', async (req, res) => {
  res.json({ profile: profileJSON(await myProfile(req.user._id)) });
});

const updateSchema = z.object({
  headline: z.string().trim().max(140).optional(),
  phone: z.string().trim().max(40).optional(),
  location: z.string().trim().max(120).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  talentPoolConsent: z.boolean().optional(),
  experienceYearsOverride: z.number().min(0).max(60).nullable().optional(),
});

router.put('/me', validate({ body: updateSchema }), async (req, res) => {
  const p = await myProfile(req.user._id);
  Object.assign(p, req.body);
  if (req.body.experienceYearsOverride === null) p.experienceYearsOverride = undefined;
  await p.save();
  if ('experienceYearsOverride' in req.body) await reassessCandidate(p._id);
  res.json({ profile: profileJSON(p) });
});

router.post('/me/resume', (req, res, next) => resumeUpload(req, res, next), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Please choose a resume file to upload (field "resume").');
  const p = await myProfile(req.user._id, '+chunks +embedding');
  const { text } = await extractText(req.file.buffer, req.file.originalname);

  const file = await ResumeFile.create({ owner: req.user._id, fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, data: req.file.buffer });
  if (p.resume?.fileId) await ResumeFile.deleteOne({ _id: p.resume.fileId });

  const built = await buildProfileFromText(text);
  p.resume = { fileId: file._id, fileName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size, uploadedAt: new Date(), status: built.parsed.status, error: built.parsed.status === 'empty' ? built.parsed.warnings[0] : undefined, text };

  if (built.parsed.status === 'parsed') {
    const { name, email, phone, links, summary, skills, education, experience, totalExperienceYears, projects, sanitizedText, warnings, protectedLines } = built.parsed;
    p.parsed = { name, email, phone, links, summary, skills, education, experience, totalExperienceYears, projects, sanitizedText, warnings, protectedLinesRemoved: protectedLines.length };
    p.chunks = built.chunks;
    p.embedding = built.embedding;
    p.embeddingModel = built.embeddingModel;
    p.skillCorrections = p.skillCorrections.filter((c) => c.by === 'recruiter'); // candidate re-confirms after a new upload
    if (!p.phone && phone) p.phone = phone;
  } else {
    p.parsed = { warnings: built.parsed.warnings, skills: [] };
    p.chunks = [];
  }
  await p.save();
  const reassessed = await reassessCandidate(p._id);
  res.status(201).json({ profile: profileJSON(p), reassessed, message: built.parsed.status === 'parsed' ? 'Resume parsed successfully. Please review the extracted details.' : built.parsed.warnings[0] });
});

const correctionsSchema = z.object({
  add: z.array(z.object({ name: z.string().trim().min(1).max(60), evidence: z.string().trim().max(300).optional() })).max(30).default([]),
  remove: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  declaredAbsent: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

router.put('/me/skills', validate({ body: correctionsSchema }), async (req, res) => {
  const p = await myProfile(req.user._id);
  const norm = (n) => normalizeSkill(n);
  const corrections = p.skillCorrections.filter((c) => c.by === 'recruiter');
  for (const s of req.body.add) corrections.push({ name: norm(s.name), action: 'add', by: 'candidate', evidence: s.evidence });
  for (const n of req.body.remove) corrections.push({ name: norm(n), action: 'remove', by: 'candidate' });
  p.skillCorrections = corrections;
  if (req.body.declaredAbsent) p.declaredAbsent = [...new Set(req.body.declaredAbsent.map(norm))];
  await p.save();
  await reassessCandidate(p._id);
  res.json({ profile: profileJSON(p) });
});

router.get('/me/verification', async (req, res) => {
  const p = await myProfile(req.user._id, '+resume.text');
  const view = scoringView(p.toObject());
  res.json({ skills: verifyProfileSkills(view.skills.filter((s) => !s.removed), p.resume?.text || '') });
});

router.get('/me/resume', async (req, res) => {
  const p = await myProfile(req.user._id);
  const file = p.resume?.fileId && (await ResumeFile.findById(p.resume.fileId));
  if (!file) throw new HttpError(404, 'No resume uploaded yet');
  res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"` });
  res.send(file.data);
});

/** Resume-to-job recommendations: open jobs ranked by score using verified skills, interests and projects. */
router.get('/me/recommendations', async (req, res) => {
  let p = await myProfile(req.user._id, '+chunks +embedding');
  if (p.resume?.status !== 'parsed') return res.json({ recommendations: [], reason: 'Upload a resume to get job recommendations.' });
  p = await ensureIndexed(p);
  const applied = new Set((await Application.find({ candidate: req.user._id }).select('job')).map((a) => String(a.job)));
  const jobs = await Job.find({ status: 'open' }).limit(100);
  const view = scoringView(p.toObject());
  const interestText = (p.interests || []).join(', ');
  const interestVec = interestText ? (await embed([interestText]))[0] : null;
  const recs = [];
  for (const job of jobs) {
    const r = await scoreCandidate(job.toObject(), view, { embedFn: embed });
    let interestBoost = 0;
    if (interestVec) interestBoost = Math.max(0, cosine(interestVec, (await embed([`${job.title} ${job.department || ''}`]))[0])) * 10;
    recs.push({
      job: { id: job._id, title: job.title, department: job.department, location: job.location, type: job.type },
      score: Math.min(100, Math.round(r.score + interestBoost)),
      matchedSkills: r.matchedSkills.map((m) => m.skill),
      missingSkills: r.gaps.filter((g) => g.required).map((g) => g.skill),
      learningAreas: r.learningAreas.slice(0, 3),
      applied: applied.has(String(job._id)),
    });
  }
  recs.sort((a, b) => b.score - a.score);
  res.json({ recommendations: recs.slice(0, 10) });
});

export default router;
