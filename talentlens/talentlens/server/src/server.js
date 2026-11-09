import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { embed } from './services/embeddings.js';

async function connectWithRetry(retries = 5, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      await mongoose.connect(config.mongoUri);
      return;
    } catch (err) {
      console.warn(`[db] connection attempt ${i}/${retries} failed (${err.message})`);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  await connectWithRetry();
  console.log(`[db] connected to ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
  const app = createApp();
  app.listen(config.port, () => console.log(`[api] listening on http://localhost:${config.port}`));
  // Warm up the embedding model in the background so the first request is fast.
  embed(['warm up']).then(() => console.log('[ai] embedding model ready')).catch(() => {});
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
