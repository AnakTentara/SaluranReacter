import { BotSession } from './session.js';
import { getAccounts } from '../utils/config.js';
import logger from '../utils/logger.js';

/**
 * Manages all WhatsApp bot account connections.
 */
export class BotManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map(); // accountId → BotSession
    this.listenerAccountId = null;
  }

  /**
   * Initialize sessions for all enabled accounts.
   */
  async start() {
    const accounts = getAccounts().filter((a) => a.enabled);
    logger.info({ count: accounts.length }, 'Starting bot manager');

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      await this.addSession(account);
      // Stagger connections to avoid WA flood detection
      if (i < accounts.length - 1) {
        await sleep(3000);
      }
    }

    this.assignListener();
  }

  /**
   * Add and connect a new session.
   */
  async addSession(account) {
    if (this.sessions.has(account.id)) {
      logger.warn({ accountId: account.id }, 'Session already exists, skipping');
      return this.sessions.get(account.id);
    }

    const session = new BotSession(account, this.io);
    session.onStatusChange = (status) => {
      logger.info({ accountId: account.id, status }, 'Session status changed — evaluating listener');
      this.assignListener();
    };

    this.sessions.set(account.id, session);

    await session.connect();
    this.assignListener();

    return session;
  }

  /**
   * Remove and disconnect a session.
   */
  removeSession(accountId) {
    const session = this.sessions.get(accountId);
    if (!session) return false;

    session.disconnect();
    this.sessions.delete(accountId);

    // Re-assign listener if this was it
    if (this.listenerAccountId === accountId) {
      this.listenerAccountId = null;
      this.assignListener();
    }

    logger.info({ accountId }, 'Session removed');
    return true;
  }

  /**
   * Reload sessions based on updated config (add new, remove deleted).
   */
  async syncWithConfig() {
    const configAccounts = getAccounts();
    const configIds = new Set(configAccounts.map((a) => a.id));
    const sessionIds = new Set(this.sessions.keys());

    // Remove sessions not in config
    for (const id of sessionIds) {
      if (!configIds.has(id)) {
        this.removeSession(id);
      }
    }

    // Add new accounts from config
    for (const account of configAccounts) {
      if (account.enabled && !this.sessions.has(account.id)) {
        await this.addSession(account);
        await sleep(2000);
      } else if (!account.enabled && this.sessions.has(account.id)) {
        this.removeSession(account.id);
      }
    }
  }

  /**
   * Assign the first connected (or connecting) account as the "listener".
   * The listener account receives and monitors channel messages.
   */
  assignListener() {
    // Keep existing listener if still connected
    if (this.listenerAccountId && this.sessions.has(this.listenerAccountId)) {
      const s = this.sessions.get(this.listenerAccountId);
      if (s.status === 'connected' || s.status === 'scanning' || s.status === 'connecting') {
        s.isListener = true;
        return;
      }
    }

    // Pick the first available session
    this.listenerAccountId = null;
    for (const [id, session] of this.sessions) {
      session.isListener = false;
      if (!this.listenerAccountId && session.status !== 'error') {
        session.isListener = true;
        this.listenerAccountId = id;
      }
    }

    if (this.listenerAccountId) {
      logger.info({ accountId: this.listenerAccountId }, 'Listener account assigned');
    }
  }

  /**
   * Get a specific session.
   */
  getSession(accountId) {
    return this.sessions.get(accountId);
  }

  /**
   * Get a connected reactor session for sending a reaction.
   * Prefers non-listener accounts.
   */
  getReactorSession(accountId) {
    const session = this.sessions.get(accountId);
    if (session?.status === 'connected') return session;
    return null;
  }

  /**
   * Get status of all sessions.
   */
  getAllStatus() {
    const statuses = [];
    for (const session of this.sessions.values()) {
      statuses.push(session.getStatusInfo());
    }
    return statuses;
  }

  /**
   * Reconnect a specific account.
   */
  async reconnect(accountId) {
    const session = this.sessions.get(accountId);
    if (!session) return false;
    session.disconnect();
    await sleep(1000);
    await session.connect();
    return true;
  }

  /**
   * Clear session data and force re-QR for an account.
   */
  async logoutAccount(accountId) {
    const session = this.sessions.get(accountId);
    if (!session) return false;
    session.disconnect();
    session.clearSession();
    await sleep(1000);
    await session.connect();
    return true;
  }

  stop() {
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
    this.sessions.clear();
    logger.info('Bot manager stopped');
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
