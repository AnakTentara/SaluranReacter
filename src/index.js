import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';

import logger from './utils/logger.js';
import { initDB } from './utils/db.js';
import { loadConfig } from './utils/config.js';
import { BotManager } from './bot/manager.js';
import { Reactor } from './bot/reactor.js';
import { initMonitor, startPolling } from './channel/monitor.js';
import { cleanMediaCache } from './channel/media.js';
import { getAllRateLimitStats } from './ai/ratelimit.js';
import configRouter from './routes/config.js';
import statusRouter from './routes/status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC_DIR = join(ROOT, 'public');

// Ensure required dirs exist
for (const dir of ['data', 'data/sessions', 'data/media_cache', 'logs']) {
  const p = join(ROOT, dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// ── Init ────────────────────────────────────────────────────────────────────
const cfg = loadConfig();
initDB();

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, { cors: { origin: '*' } });

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));
// Serves cached media files using metadata to set correct MIME type headers
app.get('/media_cache/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = join(ROOT, 'data', 'media_cache', filename);
  const metaPath = filePath + '.json';

  if (!existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  let mimeType = 'application/octet-stream';
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      mimeType = meta.mimeType || mimeType;
    } catch (e) {
      logger.error({ err: e.message }, 'Failed to parse media metadata');
    }
  }

  res.setHeader('Content-Type', mimeType);
  res.sendFile(filePath);
});

// ── Bot Setup ────────────────────────────────────────────────────────────────
const botManager = new BotManager(io);
const reactor = new Reactor(botManager, io);

// Init channel monitor with references
initMonitor({ socketIo: io, manager: botManager, reactionSender: reactor });

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', configRouter(botManager, io));
app.use('/api', statusRouter(botManager, reactor));

// ── Catch-all: serve index.html for SPA navigation ──────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

// ── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.debug({ id: socket.id }, 'Dashboard client connected');

  // Send current status on connect
  socket.emit('accounts:all', botManager.getAllStatus());
  socket.emit('ratelimit:stats', getAllRateLimitStats());

  socket.on('disconnect', () => {
    logger.debug({ id: socket.id }, 'Dashboard client disconnected');
  });
});

// Broadcast rate limit stats every 10s
setInterval(() => {
  io.emit('ratelimit:stats', getAllRateLimitStats());
}, 10_000);

// Clean media cache every hour
setInterval(() => cleanMediaCache(), 60 * 60 * 1000);

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, async () => {
  logger.info(`🚀 WA Reactor running at http://localhost:${PORT}`);

  if (!cfg.geminiApiKey && !process.env.GEMINI_API_KEY) {
    logger.warn('⚠️  No Gemini API key configured! Set it in the dashboard.');
  }

  // Start bot connections
  try {
    await botManager.start();
  } catch (err) {
    logger.error({ err: err.message }, 'Bot manager start error');
  }

  // Start polling
  startPolling();
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully...');
  botManager.stop();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000);
}
