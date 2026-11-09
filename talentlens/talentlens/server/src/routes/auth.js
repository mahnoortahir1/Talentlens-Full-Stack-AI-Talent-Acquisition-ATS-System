import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import User from '../models/User.js';
import CandidateProfile from '../models/CandidateProfile.js';
import { HttpError, validate, issueSession, clearSession, requireAuth } from '../middleware/index.js';

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, please try again in a few minutes.' } });

const password = z.string().min(8, 'Password must be at least 8 characters').max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/\d/, 'Password must contain a number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password,
  role: z.enum(['recruiter', 'candidate']),
  company: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
  const { name, email, password: pw, role, company } = req.body;
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({ name, email, role, company: role === 'recruiter' ? company || 'Default Company' : undefined, passwordHash: await bcrypt.hash(pw, 12) });
  if (role === 'candidate') await CandidateProfile.create({ user: user._id });
  issueSession(res, user);
  res.status(201).json({ user: user.toSafeJSON() });
});

router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  issueSession(res, user);
  res.json({ user: user.toSafeJSON() });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toSafeJSON() }));

export default router;
