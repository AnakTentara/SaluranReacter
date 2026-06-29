import { Router } from 'express';
import {
  getConfig,
  saveConfig,
  getAccounts,
  getAccount,
  addAccount,
  updateAccount,
  removeAccount,
  getChannels,
  addChannel,
  removeChannel,
  updateChannel,
} from '../utils/config.js';
import { testApiKey } from '../ai/gemini.js';
import logger from '../utils/logger.js';

export default function configRouter(botManager, io) {
  const router = Router();

  // ── GET full config ──────────────────────────────────────────────────────
  router.get('/config', (req, res) => {
    const cfg = getConfig();
    // Mask API key in response
    res.json({
      ...cfg,
      geminiApiKey: cfg.geminiApiKey ? `${cfg.geminiApiKey.slice(0, 8)}...` : '',
      geminiApiKeySet: !!cfg.geminiApiKey,
    });
  });

  // ── UPDATE settings (polling interval, debug mode) ───────────────────────
  router.post('/config/settings', (req, res) => {
    try {
      const { pollingIntervalSeconds, debugMode } = req.body;
      const updates = {};
      if (pollingIntervalSeconds !== undefined) {
        updates.pollingIntervalSeconds = Math.min(Math.max(Number(pollingIntervalSeconds), 60), 180);
      }
      if (debugMode !== undefined) updates.debugMode = Boolean(debugMode);
      const saved = saveConfig(updates);
      res.json({ ok: true, config: saved });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ── SET API key ──────────────────────────────────────────────────────────
  router.post('/config/apikey', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ ok: false, error: 'apiKey is required' });
      }
      // Test the key first
      const test = await testApiKey(apiKey.trim());
      if (!test.ok) {
        return res.status(400).json({ ok: false, error: `Invalid API key: ${test.error}` });
      }
      saveConfig({ geminiApiKey: apiKey.trim() });
      res.json({ ok: true, message: 'API key saved and verified' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── ACCOUNTS ──────────────────────────────────────────────────────────────

  router.get('/accounts', (req, res) => {
    res.json(getAccounts());
  });

  router.post('/accounts', async (req, res) => {
    try {
      const { id, name, personality, reactProbability, minDelaySeconds, maxDelaySeconds } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
      if (!name) return res.status(400).json({ ok: false, error: 'name is required' });

      const account = addAccount({ id, name, personality, reactProbability, minDelaySeconds, maxDelaySeconds });

      // Start connecting the new account
      await botManager.addSession(account);

      res.json({ ok: true, account });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.patch('/accounts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const account = updateAccount(id, updates);

      // If toggling enabled, sync sessions
      if (updates.enabled !== undefined) {
        await botManager.syncWithConfig();
      }

      res.json({ ok: true, account });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.delete('/accounts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      removeAccount(id);
      botManager.removeSession(id);
      res.json({ ok: true, message: `Account ${id} removed` });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ── CHANNELS ──────────────────────────────────────────────────────────────

  router.get('/channels', (req, res) => {
    res.json(getChannels());
  });

  router.post('/channels', (req, res) => {
    try {
      const { id, name } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
      addChannel({ id: id.trim(), name: name || id.trim() });
      // Turn off debug mode once a channel is configured
      saveConfig({ debugMode: false });
      res.json({ ok: true, message: 'Channel added' });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.patch('/channels/:id', (req, res) => {
    try {
      const channel = updateChannel(decodeURIComponent(req.params.id), req.body);
      res.json({ ok: true, channel });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.delete('/channels/:id', (req, res) => {
    try {
      removeChannel(decodeURIComponent(req.params.id));
      res.json({ ok: true, message: 'Channel removed' });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  return router;
}
