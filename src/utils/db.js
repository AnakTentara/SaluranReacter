import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'db.json');

// Memory cache of the database
let _db = {
  posts: [],
  reaction_log: [],
  debug_messages: [],
  rate_limit_log: [],
};

// Save changes to disk
function saveToDisk() {
  try {
    writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), 'utf-8');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to write DB to disk');
  }
}

export function initDB() {
  try {
    if (existsSync(DB_PATH)) {
      const raw = readFileSync(DB_PATH, 'utf-8');
      _db = { ..._db, ...JSON.parse(raw) };
    } else {
      saveToDisk();
    }
    logger.info({ path: DB_PATH }, 'Pure JSON Database initialized');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to initialize DB, using empty state');
    saveToDisk();
  }
}

// ── Posts ──────────────────────────────────────────────────────────────────

export function savePost(post) {
  const existing = _db.posts.find((p) => p.id === post.id);
  if (existing) return;

  _db.posts.push({
    id: post.id,
    channel_id: post.channelId,
    timestamp: post.timestamp,
    content_type: post.contentType || 'text',
    text_content: post.textContent || null,
    media_path: post.mediaPath || null,
    caption: post.caption || null,
    reactions_sent: post.reactions_sent || '[]',
    created_at: Math.floor(Date.now() / 1000),
  });
  saveToDisk();
}

export function getPostById(id) {
  return _db.posts.find((p) => p.id === id) || null;
}

/**
 * Get context posts for AI:
 * - All text posts from today (WIB = UTC+7)
 * - Up to 15 text posts from yesterday
 */
export function getContextPosts(channelId) {
  const now = Date.now();
  const offsetMs = 7 * 60 * 60 * 1000; // UTC+7
  const localNow = now + offsetMs;
  const localMidnight = localNow - (localNow % 86400000);
  const todayStart = localMidnight - offsetMs;
  const yesterdayStart = todayStart - 86400000;

  // Filter posts for this channel
  const chPosts = _db.posts.filter((p) => p.channel_id === channelId);

  // Today's posts (descending by timestamp)
  const todayPosts = chPosts
    .filter((p) => p.timestamp >= todayStart && ['text', 'image', 'video', 'audio', 'sticker'].includes(p.content_type))
    .sort((a, b) => b.timestamp - a.timestamp);

  // Yesterday's text posts (limit 15, descending)
  const yesterdayPosts = chPosts
    .filter((p) => p.timestamp >= yesterdayStart && p.timestamp < todayStart && p.content_type === 'text')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 15);

  return { todayPosts, yesterdayPosts };
}

export function markReactionSent(postId, reactionsArray) {
  const post = _db.posts.find((p) => p.id === postId);
  if (post) {
    post.reactions_sent = JSON.stringify(reactionsArray);
    saveToDisk();
  }
}

// ── Reaction Log ───────────────────────────────────────────────────────────

export function logReaction({ postId, accountId, emoji, success, errorMsg }) {
  _db.reaction_log.push({
    id: Date.now() + Math.random(),
    post_id: postId,
    account_id: accountId,
    emoji: emoji,
    sent_at: Math.floor(Date.now() / 1000),
    success: success ? 1 : 0,
    error_msg: errorMsg || null,
  });

  // Keep log size sane (max 500 entries)
  if (_db.reaction_log.length > 500) {
    _db.reaction_log.shift();
  }

  saveToDisk();
}

export function getRecentReactions(limit = 50) {
  const sorted = [..._db.reaction_log].sort((a, b) => b.sent_at - a.sent_at);
  const result = sorted.slice(0, limit).map((r) => {
    const post = getPostById(r.post_id);
    return {
      ...r,
      text_content: post?.text_content || null,
      content_type: post?.content_type || null,
    };
  });
  return result;
}

// ── Debug Messages ─────────────────────────────────────────────────────────

export function saveDebugMessage({ jid, messageId, contentType, preview, raw }) {
  _db.debug_messages.push({
    id: Date.now() + Math.random(),
    jid,
    message_id: messageId,
    content_type: contentType,
    preview,
    raw,
    received_at: Math.floor(Date.now() / 1000),
  });

  // Cap at 100 entries to save space
  if (_db.debug_messages.length > 100) {
    _db.debug_messages.shift();
  }

  saveToDisk();
}

export function getRecentDebugMessages(limit = 100) {
  return [..._db.debug_messages]
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, limit);
}

export function clearDebugMessages() {
  _db.debug_messages = [];
  saveToDisk();
}

// ── Rate Limit Log ─────────────────────────────────────────────────────────

export function logApiCall(apiKeyMasked, tokensUsed = 0) {
  _db.rate_limit_log.push({
    id: Date.now() + Math.random(),
    event: 'call',
    api_key: apiKeyMasked || 'default',
    tokens_used: tokensUsed,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Clean old rate limit logs (older than 2 days)
  const cutoff = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
  _db.rate_limit_log = _db.rate_limit_log.filter((l) => l.timestamp >= cutoff);

  saveToDisk();
}

export function getTodayApiCallCount(apiKeyMasked) {
  const midnight = Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 86400);
  return _db.rate_limit_log.filter(
    (l) => l.event === 'call' && l.timestamp >= midnight && l.api_key === (apiKeyMasked || 'default')
  ).length;
}
