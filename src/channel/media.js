import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import logger from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'data', 'media_cache');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (1 week)
// Gemini inline_data limit ~20MB
const MAX_MEDIA_BYTES = 18 * 1024 * 1024;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

/**
 * Detect content type from a Baileys message object.
 * Returns: 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'unknown'
 */
export function detectContentType(msg) {
  const m = msg?.message;
  if (!m) return 'unknown';

  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage || m.pttMessage) return 'audio';
  if (m.stickerMessage) return 'sticker';
  if (m.documentMessage) return 'document';
  if (m.reactionMessage) return 'reaction';

  return 'unknown';
}

/**
 * Extract text content from a message.
 */
export function extractTextContent(msg) {
  const m = msg?.message;
  if (!m) return null;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    null
  );
}

/**
 * Extract caption (for media messages).
 */
export function extractCaption(msg) {
  const m = msg?.message;
  if (!m) return null;
  return m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || null;
}

/**
 * Download media from a message and return base64 + mimeType.
 * Returns null if media too large or download fails.
 *
 * @param {object} msg - full Baileys message object
 * @param {string} contentType - 'image' | 'video' | 'audio' | 'sticker'
 * @param {object} sock - Baileys socket (needed for download)
 * @returns {{ base64: string, mimeType: string, filePath: string } | null}
 */
export async function downloadAndEncodeMedia(msg, contentType, sock) {
  const msgId = msg.key?.id || `msg_${Date.now()}`;
  const cacheKey = `${msgId}_${contentType}`;
  const cachePath = join(CACHE_DIR, cacheKey);

  // Return cached version if exists
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
      return cached;
    } catch {
      // Cache corrupted, re-download
    }
  }

  try {
    const mediaType = contentType === 'audio' ? 'audio' : contentType;
    const buffer = await downloadMediaMessage(msg, mediaType, {}, { logger, reuploadRequest: sock?.updateMediaMessage });

    if (!buffer || buffer.length === 0) {
      logger.warn({ msgId, contentType }, 'Empty media buffer');
      return null;
    }

    if (buffer.length > MAX_MEDIA_BYTES) {
      logger.warn({ msgId, contentType, size: buffer.length }, 'Media too large for Gemini inline, skipping');
      return null;
    }

    const mimeType = getMimeType(msg, contentType);
    const base64 = buffer.toString('base64');

    const result = { base64, mimeType, filePath: cachePath, size: buffer.length };

    // Cache to disk
    writeFileSync(cachePath, JSON.stringify(result), 'utf-8');

    logger.debug({ msgId, contentType, size: buffer.length, mimeType }, 'Media downloaded & cached');
    return result;
  } catch (err) {
    logger.error({ err: err.message, msgId, contentType }, 'Failed to download media');
    return null;
  }
}

/**
 * Get MIME type from message object.
 */
function getMimeType(msg, contentType) {
  const m = msg?.message;
  switch (contentType) {
    case 'image':
      return m?.imageMessage?.mimetype || 'image/jpeg';
    case 'video':
      return m?.videoMessage?.mimetype || 'video/mp4';
    case 'audio':
      return m?.audioMessage?.mimetype || m?.pttMessage?.mimetype || 'audio/ogg; codecs=opus';
    case 'sticker':
      return m?.stickerMessage?.mimetype || 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Clean up cached media files older than TTL.
 * Call periodically (e.g., every hour).
 */
export function cleanMediaCache() {
  try {
    const files = readdirSync(CACHE_DIR);
    const now = Date.now();
    let removed = 0;
    for (const file of files) {
      const filePath = join(CACHE_DIR, file);
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > CACHE_TTL_MS) {
        unlinkSync(filePath);
        removed++;
      }
    }
    if (removed > 0) logger.info({ removed }, 'Media cache cleaned');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to clean media cache');
  }
}
