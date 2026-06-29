import { logReaction } from '../utils/db.js';
import logger from '../utils/logger.js';

/**
 * Manages the reaction sending queue.
 * Reactions are sent with individual delays to look natural.
 */
export class Reactor {
  constructor(botManager, io) {
    this.botManager = botManager;
    this.io = io;
    this.pendingTimers = new Map(); // `${postId}:${accountId}` → timer
  }

  /**
   * Queue reactions from AI output.
   *
   * @param {string} postId - Message ID of the channel post
   * @param {string} channelJid - Channel JID (e.g. "120363XXX@newsletter")
   * @param {object} messageKey - Baileys message key object
   * @param {string|number} serverId - The newsletter serverId for reactions
   * @param {Array}  reactions - [{ accountId, emoji, delaySeconds }]
   */
  queueReactions(postId, channelJid, messageKey, serverId, reactions) {
    logger.info({ postId, count: reactions.length }, 'Queueing reactions');

    for (const reaction of reactions) {
      const { accountId, emoji, delaySeconds } = reaction;
      // Add small random jitter (0–15s) on top of AI delay for extra naturalness
      const jitter = Math.floor(Math.random() * 15);
      const totalDelay = (delaySeconds + jitter) * 1000;

      const key = `${postId}:${accountId}`;

      const timer = setTimeout(async () => {
        this.pendingTimers.delete(key);
        await this.sendReaction({ postId, channelJid, messageKey, serverId, accountId, emoji });
      }, totalDelay);

      this.pendingTimers.set(key, timer);

      logger.debug(
        { accountId, emoji, delayMs: totalDelay },
        'Reaction scheduled'
      );
    }
  }

  /**
   * Send a single reaction.
   */
  async sendReaction({ postId, channelJid, messageKey, serverId, accountId, emoji }) {
    const session = this.botManager.getReactorSession(accountId);

    if (!session) {
      logger.warn({ accountId, emoji, postId }, 'Account not connected — skipping reaction');
      logReaction({ postId, accountId, emoji, success: false, errorMsg: 'Account not connected' });
      return;
    }

    try {
      await session.sendReaction(channelJid, messageKey, serverId, emoji);

      logReaction({ postId, accountId, emoji, success: true });
      logger.info({ accountId, emoji, postId }, '✅ Reaction sent!');

      if (this.io) {
        this.io.emit('reaction:sent', {
          postId,
          accountId,
          accountName: session.account.name,
          emoji,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.error({ err: err.message, accountId, emoji, postId }, 'Failed to send reaction');
      logReaction({ postId, accountId, emoji, success: false, errorMsg: err.message });

      if (this.io) {
        this.io.emit('reaction:failed', {
          postId,
          accountId,
          emoji,
          error: err.message,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Cancel all pending reactions for a post.
   */
  cancelPost(postId) {
    let cancelled = 0;
    for (const [key, timer] of this.pendingTimers) {
      if (key.startsWith(`${postId}:`)) {
        clearTimeout(timer);
        this.pendingTimers.delete(key);
        cancelled++;
      }
    }
    if (cancelled > 0) logger.info({ postId, cancelled }, 'Cancelled pending reactions');
    return cancelled;
  }

  /**
   * Get count of pending reactions.
   */
  getPendingCount() {
    return this.pendingTimers.size;
  }
}
