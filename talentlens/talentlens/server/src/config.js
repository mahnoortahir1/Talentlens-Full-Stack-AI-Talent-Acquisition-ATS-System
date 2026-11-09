import dns from 'node:dns';

// Ensure SRV records for MongoDB Atlas resolve properly across all networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch { /* ignore */ }

// Load .env natively (Node >= 20.12); silently ignored when the file is absent.
try { process.loadEnvFile(); } catch { /* no .env file */ }

const env = process.env;

export const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT || 5000),
  mongoUri: env.MONGO_URI || 'mongodb://127.0.0.1:27017/talentlens',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',

  // AI providers. Embeddings: "local" (Sentence-Transformers MiniLM via transformers.js),
  // "openai", "gemini" or "hash" (deterministic offline fallback, used in tests).
  embeddingProvider: env.EMBEDDING_PROVIDER || 'local',
  geminiApiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-2.0-flash',
  openaiApiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',

  // Talent pool data retention: profiles not updated within this window are excluded.
  retentionDays: Number(env.RETENTION_DAYS || 365),
  maxUploadBytes: 5 * 1024 * 1024,
};

if (config.isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
