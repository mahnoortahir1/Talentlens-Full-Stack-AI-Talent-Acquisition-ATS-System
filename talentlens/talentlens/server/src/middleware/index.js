import jwt from 'jsonwebtoken';
import multer from 'multer';
import { config } from '../config.js';
import User from '../models/User.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const COOKIE_NAME = 'tl_session';

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Verifies the httpOnly session cookie and loads the user. */
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return next(new HttpError(401, 'Session is no longer valid'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'));
  }
}

export const requireRole = (...roles) => (req, _res, next) => (roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'You do not have access to this resource')));

/** Validate req.body / req.query / req.params with a zod schema object { body, query, params }. */
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['body', 'params', 'query']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      return next(new HttpError(400, 'Validation failed', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
    }
    if (key === 'query') req.validQuery = result.data; // req.query is read-only in Express 5
    else req[key] = result.data;
  }
  next();
};

/** Strip MongoDB operator keys ($gt, $where, dotted paths) from user input to prevent NoSQL injection. */
export function sanitizeInput(req, _res, next) {
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) delete obj[key];
      else clean(obj[key]);
    }
    return obj;
  };
  clean(req.body);
  clean(req.params);
  next();
}

const ALLOWED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype] || /\.(pdf|docx)$/i.test(file.originalname)) return cb(null, true);
    cb(new HttpError(415, 'Unsupported file type. Please upload a PDF (or DOCX) resume.'));
  },
}).single('resume');

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err?.name === 'ValidationError') return res.status(400).json({ error: 'Validation failed', details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })) });
  if (err?.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}` });
  if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate record', details: err.keyValue });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message, details: err.details });
}
