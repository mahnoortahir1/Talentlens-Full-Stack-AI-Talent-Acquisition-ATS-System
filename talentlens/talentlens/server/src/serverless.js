/**
 * Serverless (Vercel) request handler.
 * Reuses one MongoDB connection and one Express app across warm invocations.
 * No app.listen() and no process.exit(): the platform owns the process.
 */
import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';

mongoose.set('bufferCommands', false);

let app;
let connecting;

async function connectDb() {
  if (mongoose.connection.readyState === 1) return;
  if (!connecting) {
    connecting = mongoose
      .connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
      .catch((err) => {
        connecting = null; // allow a retry on the next request
        throw err;
      });
  }
  await connecting;
}

export default async function handler(req, res) {
  try {
    await connectDb();
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database unavailable. Check MONGO_URI and MongoDB Atlas network access (allow 0.0.0.0/0).' }));
    return;
  }
  if (!app) app = createApp();
  return app(req, res);
}
