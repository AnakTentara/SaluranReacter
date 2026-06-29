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
    
    // Mask all API keys in response
    const maskedKeys = (cfg.geminiApiKeys || []).map(k => k ? `${k.slice(0, 8)}...` : '');
    
    res.json({
      ...cfg,
      geminiApiKey: cfg.geminiApiKey ? `${cfg.geminiApiKey.slice(0, 8)}...` : '',
      geminiApiKeys: maskedKeys,
      geminiApiKeySet: (cfg.geminiApiKeys && cfg.geminiApiKeys.length > 0) || !!cfg.geminiApiKey,
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
  // ── PATCH config (generic config updater) ───────────────────────────────
  router.patch('/config', (req, res) => {
    try {
      const updates = req.body;
      const saved = saveConfig(updates);
      res.json({ ok: true, config: saved });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ── SET API keys ──────────────────────────────────────────────────────────
  router.post('/config/apikey', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ ok: false, error: 'API key(s) are required' });
      }

      // Split keys by comma or newlines
      const rawKeys = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
      if (rawKeys.length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid API keys found' });
      }

      logger.info({ count: rawKeys.length }, 'Verifying API keys...');
      
      // Verify each API key
      const verifiedKeys = [];
      const errors = [];
      
      for (let i = 0; i < rawKeys.length; i++) {
        const key = rawKeys[i];
        const test = await testApiKey(key);
        if (test.ok) {
          verifiedKeys.push(key);
        } else {
          errors.push(`Key #${i+1} failed: ${test.error}`);
        }
      }

      if (verifiedKeys.length === 0) {
        return res.status(400).json({ ok: false, error: `All provided API keys are invalid: \n${errors.join('\n')}` });
      }

      saveConfig({
        geminiApiKey: verifiedKeys[0], // for legacy compatibility
        geminiApiKeys: verifiedKeys
      });

      const msg = errors.length > 0 
        ? `Berhasil memverifikasi ${verifiedKeys.length} key. Gagal: \n${errors.join('\n')}`
        : `Semua ${verifiedKeys.length} API key berhasil diverifikasi dan disimpan!`;

      res.json({ ok: true, message: msg, warning: errors.length > 0 ? errors : null });
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
      const { id, name, botType, personality, reactProbability, minDelaySeconds, maxDelaySeconds } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
      if (!name) return res.status(400).json({ ok: false, error: 'name is required' });

      const account = addAccount({ id, name, botType, personality, reactProbability, minDelaySeconds, maxDelaySeconds });

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
