import { Router } from 'express';
import { getRateLimitStats } from '../ai/ratelimit.js';
import { getRecentReactions, getRecentDebugMessages, clearDebugMessages } from '../utils/db.js';
import logger from '../utils/logger.js';

export default function statusRouter(botManager, reactor) {
  const router = Router();

  // ── Bot status & all accounts ────────────────────────────────────────────
  router.get('/status', (req, res) => {
    res.json({
      accounts: botManager.getAllStatus(),
      listener: botManager.listenerAccountId,
      pendingReactions: reactor.getPendingCount(),
      rateLimit: getRateLimitStats(),
    });
  });

  // ── Rate limit stats ─────────────────────────────────────────────────────
  router.get('/status/ratelimit', (req, res) => {
    res.json(getRateLimitStats());
  });

  // ── QR code for a specific account ───────────────────────────────────────
  router.get('/accounts/:id/qr', (req, res) => {
    const session = botManager.getSession(req.params.id);
    if (!session) return res.status(404).json({ ok: false, error: 'Account not found' });
    if (!session.qrDataUrl) return res.status(204).json({ ok: false, error: 'No QR available' });
    res.json({ ok: true, qrDataUrl: session.qrDataUrl });
  });

  // ── Reconnect / logout account ────────────────────────────────────────────
  router.post('/accounts/:id/reconnect', async (req, res) => {
    try {
      const ok = await botManager.reconnect(req.params.id);
      res.json({ ok });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/accounts/:id/logout', async (req, res) => {
    try {
      const ok = await botManager.logoutAccount(req.params.id);
      res.json({ ok, message: 'Session cleared — new QR will be generated' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Recent reactions log ──────────────────────────────────────────────────
  router.get('/reactions', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(getRecentReactions(limit));
  });

  // ── Debug messages ────────────────────────────────────────────────────────
  router.get('/debug/messages', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(getRecentDebugMessages(limit));
  });

  router.delete('/debug/messages', (req, res) => {
    clearDebugMessages();
    res.json({ ok: true, message: 'Debug messages cleared' });
  });

  return router;
}
