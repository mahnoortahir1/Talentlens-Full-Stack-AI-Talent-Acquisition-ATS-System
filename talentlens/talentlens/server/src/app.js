import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorHandler, sanitizeInput, HttpError } from './middleware/index.js';
import { embeddingModelName } from './services/embeddings.js';
import { llmName } from './services/llm.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import jobRoutes from './routes/jobs.js';
import applicationRoutes from './routes/applications.js';
import interviewRoutes from './routes/interviews.js';
import analyticsRoutes from './routes/analytics.js';
import searchRoutes from './routes/search.js';
import notificationRoutes from './routes/notifications.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.isProd ? undefined : false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);
  if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  // Basic CSRF defence for cookie auth: state-changing requests must be JSON/multipart from our origin.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== config.clientOrigin && !origin.endsWith(`//${req.get('host')}`)) return next(new HttpError(403, 'Cross-site request blocked'));
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, embeddings: embeddingModelName(), llm: llmName() || 'none (data-driven fallback)' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/interviews', interviewRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API route not found')));

  // In production the API also serves the built React app.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
