import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} from '@whiskeysockets/baileys';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, rmSync } from 'fs';
import qrcode from 'qrcode';
import pino from 'pino';
import { handleIncomingMessage } from '../channel/monitor.js';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dirname, '..', '..', 'data', 'sessions');

if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

// Suppress Baileys internal logs (very noisy)
const baileysLogger = pino({ level: 'silent' });

/**
 * Represents a single WhatsApp account connection.
 */
export class BotSession {
  constructor(account, io) {
    this.account = account; // { id, name, enabled, ... }
    this.io = io;
    this.sock = null;
    this.status = 'disconnected'; // disconnected | connecting | scanning | connected | error
    this.qrDataUrl = null;
    this.retryCount = 0;
    this.maxRetries = 10;
    this.retryTimer = null;
    this.isListener = false; // first connected account becomes listener
    this.sessionDir = join(SESSIONS_DIR, account.id);
  }

  get id() {
    return this.account.id;
  }

  /**
   * Start connecting this account.
   */
  async connect() {
    if (this.status === 'connected' || this.status === 'connecting') return;

    this.setStatus('connecting');
    logger.info({ accountId: this.id }, 'Connecting account');

    try {
      if (!existsSync(this.sessionDir)) mkdirSync(this.sessionDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        printQRInTerminal: false,
        logger: baileysLogger,
        shouldIgnoreJid: (jid) => isJidBroadcast(jid) && !jid.endsWith('@newsletter'),
        getMessage: async () => undefined,
      });

      // Save credentials on update
      this.sock.ev.on('creds.update', saveCreds);

      // Connection state changes
      this.sock.ev.on('connection.update', (update) => this.onConnectionUpdate(update));

      // Incoming messages — only listener account processes channel messages
      this.sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        handleIncomingMessage(this.sock, messages);
      });
    } catch (err) {
      logger.error({ err: err.message, accountId: this.id }, 'Connection setup failed');
      this.setStatus('error');
      this.scheduleRetry();
    }
  }

  async onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.setStatus('scanning');
      try {
        this.qrDataUrl = await qrcode.toDataURL(qr);
        logger.info({ accountId: this.id }, 'QR code generated');
        if (this.io) {
          this.io.emit(`qr:${this.id}`, { accountId: this.id, qrDataUrl: this.qrDataUrl });
          this.io.emit('accounts:statusUpdate', this.getStatusInfo());
        }
      } catch (err) {
        logger.error({ err: err.message }, 'QR generation failed');
      }
    }

    if (connection === 'open') {
      this.retryCount = 0;
      this.qrDataUrl = null;
      this.setStatus('connected');
      logger.info({ accountId: this.id, name: this.account.name }, '✅ Account connected!');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn({ accountId: this.id, statusCode, isLoggedOut }, 'Connection closed');

      if (isLoggedOut) {
        // Clear session — user needs to scan QR again
        logger.warn({ accountId: this.id }, 'Account logged out — clearing session');
        try {
          rmSync(this.sessionDir, { recursive: true, force: true });
        } catch {}
        this.setStatus('disconnected');
        if (this.io) this.io.emit('accounts:statusUpdate', this.getStatusInfo());
      } else {
        this.setStatus('disconnected');
        this.scheduleRetry();
      }
    }
  }

  scheduleRetry() {
    if (this.retryCount >= this.maxRetries) {
      logger.error({ accountId: this.id }, 'Max retries reached');
      this.setStatus('error');
      return;
    }

    const delay = Math.min(5000 * Math.pow(2, this.retryCount), 120_000);
    this.retryCount++;
    logger.info({ accountId: this.id, delay, attempt: this.retryCount }, 'Scheduling reconnect');

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Send a reaction emoji to a message.
   */
  async sendReaction(jid, messageKey, serverId, emoji) {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error(`Account ${this.id} is not connected`);
    }

    if (jid.endsWith('@newsletter')) {
      const targetId = serverId || messageKey.id;
      if (!targetId) throw new Error('Missing serverId or message key ID for newsletter reaction');
      
      logger.info({ accountId: this.id, jid, targetId, emoji }, 'Sending reaction to newsletter');
      await this.sock.newsletterReactMessage(jid, targetId.toString(), emoji);
    } else {
      await this.sock.sendMessage(jid, {
        react: { text: emoji, key: messageKey },
      });
    }
  }

  setStatus(status) {
    this.status = status;
    if (this.io) {
      this.io.emit('accounts:statusUpdate', this.getStatusInfo());
    }
  }

  getStatusInfo() {
    return {
      id: this.account.id,
      name: this.account.name,
      status: this.status,
      enabled: this.account.enabled,
      isListener: this.isListener,
      hasQr: !!this.qrDataUrl,
    };
  }

  /**
   * Check if session files exist (already authenticated).
   */
  hasSession() {
    return existsSync(join(this.sessionDir, 'creds.json'));
  }

  /**
   * Delete session data (force re-login).
   */
  clearSession() {
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
    }
  }
}
