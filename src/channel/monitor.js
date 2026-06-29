import { getConfig } from '../utils/config.js';
import { saveDebugMessage } from '../utils/db.js';
import { detectContentType, extractTextContent, extractCaption, downloadAndEncodeMedia } from './media.js';
import { recordPost, getPostContext, isPostReacted, markPostReacted } from './history.js';
import { analyzePost } from '../ai/gemini.js';
import logger from '../utils/logger.js';

let io = null; // Socket.io instance
let botManager = null; // Bot manager reference
let reactor = null; // Reactor reference
let pollingTimer = null;
let isProcessing = false;

/**
 * Initialize channel monitor.
 */
export function initMonitor({ socketIo, manager, reactionSender }) {
  io = socketIo;
  botManager = manager;
  reactor = reactionSender;
  logger.info('Channel monitor initialized');
}

/**
 * Start polling for new posts.
 */
export function startPolling() {
  const cfg = getConfig();
  const intervalMs = Math.min(cfg.pollingIntervalSeconds || 120, 180) * 1000;

  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(() => poll(), intervalMs);
  logger.info({ intervalMs }, 'Polling started');

  // Also poll immediately on start (after short delay for connections to settle)
  setTimeout(() => poll(), 5000);
}

export function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    logger.info('Polling stopped');
  }
}

/**
 * Handle a new message event from Baileys (called by session.js on messages.upsert).
 * This is the main hook — called whenever any WA message arrives on the listener account.
 */
export async function handleIncomingMessage(sock, messages) {
  const cfg = getConfig();

  for (const msg of messages) {
    if (!msg?.key?.remoteJid) continue;

    const jid = msg.key.remoteJid;
    const contentType = detectContentType(msg);

    // Skip irrelevant types
    if (contentType === 'unknown' || contentType === 'reaction') continue;

    // ── DEBUG MODE ────────────────────────────────────────────────────────
    if (cfg.debugMode || cfg.channels.length === 0) {
      await handleDebugMessage(msg, jid, contentType);
    }

    // ── CHANNEL FILTER ────────────────────────────────────────────────────
    const isNewsletterOrChannel = jid.endsWith('@newsletter') || jid.includes('broadcast');
    if (!isNewsletterOrChannel) continue;

    const enabledChannels = cfg.channels.filter((c) => c.enabled);
    const channel = enabledChannels.find((c) => c.id === jid);
    if (!channel) continue;

    // Process this as a channel post
    await processChannelPost(sock, msg, channel);
  }
}

/**
 * Handle debug message — log everything to DB and emit to dashboard.
 */
async function handleDebugMessage(msg, jid, contentType) {
  const textContent = extractTextContent(msg) || '';
  const preview = textContent ? textContent.substring(0, 100) : `[${contentType}]`;
  const msgId = msg.key?.id;

  const debugEntry = {
    jid,
    messageId: msgId,
    contentType,
    preview,
    raw: JSON.stringify(msg.key || {}),
  };

  saveDebugMessage(debugEntry);

  if (io) {
    io.emit('debug:message', {
      ...debugEntry,
      timestamp: Date.now(),
    });
  }

  logger.info({ jid, msgId, contentType, preview }, '[DEBUG] Incoming message');
}

/**
 * Process a confirmed channel post — download media if needed, call AI, queue reactions.
 */
async function processChannelPost(sock, msg, channel) {
  const msgId = msg.key?.id;
  if (!msgId) return;

  // Deduplicate
  if (isPostReacted(msgId)) {
    logger.debug({ msgId }, 'Post already processed, skipping');
    return;
  }

  const contentType = detectContentType(msg);
  const textContent = extractTextContent(msg);
  const caption = extractCaption(msg);
  const timestamp = msg.messageTimestamp
    ? Number(msg.messageTimestamp) * 1000
    : Date.now();

  logger.info({ msgId, channelId: channel.id, contentType }, 'New channel post detected!');

  if (io) {
    io.emit('channel:newPost', {
      id: msgId,
      channelId: channel.id,
      channelName: channel.name,
      contentType,
      textContent,
      caption,
      timestamp,
    });
  }

  // Download media if applicable
  let mediaBase64 = null;
  let mediaMimeType = null;

  if (['image', 'video', 'audio', 'sticker'].includes(contentType)) {
    try {
      const media = await downloadAndEncodeMedia(msg, contentType, sock);
      if (media) {
        mediaBase64 = media.base64;
        mediaMimeType = media.mimeType;
      }
    } catch (err) {
      logger.error({ err: err.message, msgId, contentType }, 'Media download failed, proceeding without media');
    }
  }

  // Save to history
  recordPost({
    id: msgId,
    channelId: channel.id,
    timestamp,
    contentType,
    textContent,
    caption,
    mediaPath: null,
  });

  // Get AI context
  const cfg = getConfig();
  const enabledAccounts = cfg.accounts.filter((a) => a.enabled);

  if (enabledAccounts.length === 0) {
    logger.warn('No enabled accounts to react — skipping AI call');
    return;
  }

  const contextPosts = getPostContext(channel.id);

  // Call Gemini AI
  let aiResult;
  try {
    aiResult = await analyzePost(
      { id: msgId, contentType, textContent, caption, timestamp, mediaBase64, mediaMimeType },
      contextPosts,
      enabledAccounts
    );
  } catch (err) {
    logger.error({ err: err.message, msgId }, 'AI analysis failed');
    if (io) io.emit('log:error', { message: `AI failed for post ${msgId}: ${err.message}`, timestamp: Date.now() });
    return;
  }

  if (io) {
    io.emit('ai:decision', {
      postId: msgId,
      analysis: aiResult.analysis,
      reactionCount: aiResult.reactions?.filter((r) => r.shouldReact).length || 0,
      timestamp: Date.now(),
    });
  }

  // Queue reactions
  if (reactor && aiResult.reactions?.length > 0) {
    const reacting = aiResult.reactions.filter((r) => r.shouldReact);
    const serverId = msg.newsletterServerId || msg.message?.newsletterServerId || null;
    
    logger.info({ msgId, serverId }, 'Passing serverId to reactor');
    reactor.queueReactions(msgId, channel.id, msg.key, serverId, reacting);
    markPostReacted(msgId, reacting);
  }
}

/**
 * Periodic poll — fetch recent messages from the listener account.
 * This is a fallback in case real-time events are missed.
 */
async function poll() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const cfg = getConfig();
    const enabledChannels = cfg.channels.filter((c) => c.enabled);
    if (enabledChannels.length === 0 && !cfg.debugMode) return;

    // The listener account handles this via its event listener,
    // so polling is mostly a heartbeat check.
    if (io) {
      io.emit('monitor:heartbeat', { timestamp: Date.now() });
    }
    logger.debug('Poll heartbeat');
  } catch (err) {
    logger.error({ err: err.message }, 'Poll error');
  } finally {
    isProcessing = false;
  }
}
