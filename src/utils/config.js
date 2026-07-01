import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'config.json');

const DEFAULT_CONFIG = {
  geminiApiKey: '',
  geminiApiKeys: [],
  pollingIntervalSeconds: 120,
  debugMode: true,
  channels: [],
  accounts: [],
};

let _config = null;

export function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      
      // Auto-migrate legacy string apiKey to array geminiApiKeys
      if (parsed.geminiApiKey && (!parsed.geminiApiKeys || parsed.geminiApiKeys.length === 0)) {
        parsed.geminiApiKeys = [parsed.geminiApiKey.trim()];
      }
      
      // Clean up legacy fields (botType, personality) from accounts
      if (Array.isArray(parsed.accounts)) {
        parsed.accounts = parsed.accounts.map(acc => {
          const { botType, personality, ...rest } = acc;
          return rest;
        });
      }
      
      _config = { ...DEFAULT_CONFIG, ...parsed };
      saveConfig();
    } else {
      _config = { ...DEFAULT_CONFIG };
      saveConfig();
    }
    logger.info('Config loaded');
    return _config;
  } catch (err) {
    logger.error({ err }, 'Failed to load config, using defaults');
    _config = { ...DEFAULT_CONFIG };
    return _config;
  }
}

export function getConfig() {
  if (!_config) loadConfig();
  return _config;
}

export function saveConfig(partial = null) {
  if (partial) {
    _config = { ..._config, ...partial };
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2), 'utf-8');
  logger.info('Config saved');
  return _config;
}

// ── Account CRUD ───────────────────────────────────────────────────────────

export function getAccounts() {
  return getConfig().accounts;
}

export function getAccount(id) {
  return getConfig().accounts.find((a) => a.id === id);
}

export function addAccount(account) {
  const cfg = getConfig();
  // Validate no duplicate ID
  if (cfg.accounts.find((a) => a.id === account.id)) {
    throw new Error(`Account with id "${account.id}" already exists`);
  }
  const newAccount = {
    id: account.id,
    name: account.name || account.id,
    enabled: account.enabled !== false,
    reactProbability: account.reactProbability ?? 0.7,
    minDelaySeconds: account.minDelaySeconds ?? 10,
    maxDelaySeconds: account.maxDelaySeconds ?? 120,
  };
  cfg.accounts.push(newAccount);
  saveConfig(cfg);
  return newAccount;
}

export function updateAccount(id, updates) {
  const cfg = getConfig();
  const idx = cfg.accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Account "${id}" not found`);
  cfg.accounts[idx] = { ...cfg.accounts[idx], ...updates };
  saveConfig(cfg);
  return cfg.accounts[idx];
}

export function removeAccount(id) {
  const cfg = getConfig();
  const idx = cfg.accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Account "${id}" not found`);
  const removed = cfg.accounts.splice(idx, 1)[0];
  saveConfig(cfg);
  return removed;
}

// ── Channel CRUD ───────────────────────────────────────────────────────────

export function getChannels() {
  return getConfig().channels;
}

export function addChannel(channel) {
  const cfg = getConfig();
  if (cfg.channels.find((c) => c.id === channel.id)) {
    throw new Error(`Channel "${channel.id}" already exists`);
  }
  cfg.channels.push({ id: channel.id, name: channel.name || channel.id, enabled: true });
  saveConfig(cfg);
}

export function removeChannel(id) {
  const cfg = getConfig();
  cfg.channels = cfg.channels.filter((c) => c.id !== id);
  saveConfig(cfg);
}

export function updateChannel(id, updates) {
  const cfg = getConfig();
  const idx = cfg.channels.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Channel "${id}" not found`);
  cfg.channels[idx] = { ...cfg.channels[idx], ...updates };
  saveConfig(cfg);
  return cfg.channels[idx];
}

export function getMaskedKey(key) {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

