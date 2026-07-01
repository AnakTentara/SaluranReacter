import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import logger from '../utils/logger.js';
import { isMediaStarred } from '../utils/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'data', 'media_cache');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (1 week)
// Gemini inline_data limit ~20MB
const MAX_MEDIA_BYTES = 18 * 1024 * 1024;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

/**
 * Recursively normalizes message content to handle viewOnce, ephemeral, 
 * documentWithCaption, and newsletter message wrappers in Baileys.
 */
export function getNormalizedMessage(msg) {
  if (!msg) return null;
  let m = msg.message || msg;

  while (m) {
    if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
    } else if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
    } else if (m.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
    } else if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
    } else if (m.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
    } else if (m.newsletterMessage?.message) {
      m = m.newsletterMessage.message;
    } else {
      break;
    }
  }
  return m;
}

/**
 * Detect content type from a Baileys message object.
 * Returns: 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'unknown'
 */
export function detectContentType(msg) {
  const m = getNormalizedMessage(msg);
  if (!m) return 'unknown';

  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage || m.pttMessage) return 'audio';
  if (m.stickerMessage) return 'sticker';
  if (m.documentMessage) {
    const mime = m.documentMessage.mimetype || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }
  if (m.reactionMessage) return 'reaction';

  return 'unknown';
}

/**
 * Extract text content from a message.
 */
export function extractTextContent(msg) {
  const m = getNormalizedMessage(msg);
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
  const m = getNormalizedMessage(msg);
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
  const metaPath = cachePath + '.json';
  if (existsSync(cachePath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      const buffer = readFileSync(cachePath);
      return {
        base64: buffer.toString('base64'),
        mimeType: meta.mimeType,
        filePath: cachePath,
        size: buffer.length
      };
    } catch {
      // Cache corrupted, re-download
    }
  }

  try {
    const m = getNormalizedMessage(msg);
    let mediaType = contentType === 'audio' ? 'audio' : contentType;
    if (m?.documentMessage) {
      mediaType = 'document';
    }

    const normalizedMsg = {
      ...msg,
      message: m
    };

    const buffer = await downloadMediaMessage(
      normalizedMsg,
      mediaType,
      {},
      { 
        logger, 
        reuploadRequest: sock?.updateMediaMessage 
      }
    );

    if (!buffer || buffer.length === 0) {
      logger.warn({ msgId, contentType, mediaType }, 'Empty media buffer returned from Baileys');
      return null;
    }

    if (buffer.length > MAX_MEDIA_BYTES) {
      logger.warn({ msgId, contentType, size: buffer.length }, 'Media too large for Gemini inline, skipping');
      return null;
    }

    const mimeType = getMimeType(msg, contentType);
    const base64 = buffer.toString('base64');

    // Save raw binary file to disk
    writeFileSync(cachePath, buffer);

    // Save metadata separately
    const meta = { mimeType, size: buffer.length };
    writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');

    logger.debug({ msgId, contentType, size: buffer.length, mimeType }, 'Media downloaded & cached (raw buffer + meta.json)');
    return { base64, mimeType, filePath: cachePath, size: buffer.length };
  } catch (err) {
    logger.error({ err: err.stack || err.message, msgId, contentType }, 'Failed to download media message');
    return null;
  }
}

/**
 * Get MIME type from message object.
 */
function getMimeType(msg, contentType) {
  const m = getNormalizedMessage(msg);
  switch (contentType) {
    case 'image':
      return m?.imageMessage?.mimetype || m?.documentMessage?.mimetype || 'image/jpeg';
    case 'video':
      return m?.videoMessage?.mimetype || m?.documentMessage?.mimetype || 'video/mp4';
    case 'audio':
      return m?.audioMessage?.mimetype || m?.pttMessage?.mimetype || m?.documentMessage?.mimetype || 'audio/ogg; codecs=opus';
    case 'sticker':
      return m?.stickerMessage?.mimetype || m?.documentMessage?.mimetype || 'image/webp';
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
        // Skip metadata files directly, they are cleaned up with the raw media files
        if (file.endsWith('.json')) {
          continue;
        }

        // Protect starred media from deletion
        if (isMediaStarred(file)) {
          logger.debug({ file }, 'Skipping cleanup of starred media file');
          continue;
        }
        unlinkSync(filePath);
        const metaPath = filePath + '.json';
        if (existsSync(metaPath)) {
          unlinkSync(metaPath);
        }
        removed++;
      }
    }
    if (removed > 0) logger.info({ removed }, 'Media cache cleaned');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to clean media cache');
  }
}
