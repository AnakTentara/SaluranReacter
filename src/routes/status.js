import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { getAllRateLimitStats } from '../ai/ratelimit.js';
import { getRecentReactions, getRecentDebugMessages, clearDebugMessages, getPostsHistory, togglePostStar, getStarredPosts } from '../utils/db.js';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

export default function statusRouter(botManager, reactor) {
  const router = Router();

  // ── Bot status & all accounts ────────────────────────────────────────────
  router.get('/status', (req, res) => {
    res.json({
      accounts: botManager.getAllStatus(),
      listener: botManager.listenerAccountId,
      pendingReactions: reactor.getPendingCount(),
      rateLimit: getAllRateLimitStats(),
    });
  });

  // ── Rate limit stats ─────────────────────────────────────────────────────
  router.get('/status/ratelimit', (req, res) => {
    res.json(getAllRateLimitStats());
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

  // ── Debug: Force send a reaction ─────────────────────────────────────────
  router.post('/debug/send-reaction', async (req, res) => {
    const { accountId, channelJid, messageId, serverId, emoji } = req.body;

    if (!accountId || !channelJid || !messageId || !emoji) {
      return res.status(400).json({ ok: false, error: 'accountId, channelJid, messageId, and emoji are required' });
    }

    const session = botManager.getSession(accountId);
    if (!session) return res.status(404).json({ ok: false, error: `Account '${accountId}' not found` });
    if (session.status !== 'connected') return res.status(400).json({ ok: false, error: `Account '${accountId}' is not connected (status: ${session.status})` });

    const messageKey = { remoteJid: channelJid, fromMe: false, id: messageId };
    
    try {
      const targetServerId = serverId || messageId;
      logger.info({ accountId, channelJid, messageId, serverId: targetServerId, emoji }, '[DEBUG] Force sending reaction');
      await session.sendReaction(channelJid, messageKey, targetServerId, emoji);
      res.json({ ok: true, message: `Reaction ${emoji} sent from ${accountId} to ${channelJid} (server_id: ${targetServerId})` });
    } catch (err) {
      logger.error({ err: err.message }, '[DEBUG] Force send reaction failed');
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Chat Viewer History ──────────────────────────────────────────────────
  router.get('/posts', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(getPostsHistory(limit));
  });

  // ── Star / Starred Messages ──────────────────────────────────────────────
  router.post('/posts/:id/star', (req, res) => {
    try {
      const { id } = req.params;
      const isStarred = togglePostStar(id);
      res.json({ ok: true, is_starred: isStarred });
    } catch (err) {
      res.status(404).json({ ok: false, error: err.message });
    }
  });

  router.get('/posts/starred', (req, res) => {
    res.json(getStarredPosts());
  });

  // ── Sesi & Database Backup ────────────────────────────────────────────────
  router.get('/backup', (req, res) => {
    try {
      const zipPath = join(ROOT, 'data', 'backup.zip');
      
      // Gunakan tar bawaan OS untuk membackup config.json dan folder data/ ke file zip
      execSync(`tar -a -cf "${zipPath}" config.json data/db.json data/sessions`);

      res.download(zipPath, 'wa-reactor-backup.zip');
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to generate zip backup');
      res.status(500).json({ ok: false, error: `Gagal membuat backup: ${err.message}` });
    }
  });

  return router;
}
