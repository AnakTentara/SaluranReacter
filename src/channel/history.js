import { savePost, getPostById, getContextPosts, markReactionSent } from '../utils/db.js';
import logger from '../utils/logger.js';

/**
 * Save a newly detected post to the database.
 * Returns the saved post object, or null if it was already processed.
 */
export function recordPost({ id, channelId, timestamp, contentType, textContent, mediaPath, caption }) {
  const existing = getPostById(id);
  if (existing) return null; // already processed

  const post = {
    id,
    channelId,
    timestamp,
    contentType: contentType || 'text',
    textContent: textContent || null,
    mediaPath: mediaPath || null,
    caption: caption || null,
  };

  savePost(post);
  logger.info({ id, channelId, contentType }, 'Post recorded');
  return post;
}

/**
 * Get context posts for AI prompt building.
 * Returns { todayPosts, yesterdayPosts }
 */
export function getPostContext(channelId) {
  return getContextPosts(channelId);
}

/**
 * Mark a post as having reactions sent.
 */
export function markPostReacted(postId, reactions) {
  markReactionSent(postId, reactions);
}

/**
 * Check if a post has already been reacted to.
 */
export function isPostReacted(postId) {
  const post = getPostById(postId);
  if (!post) return false;
  try {
    const reactions = JSON.parse(post.reactions_sent || '[]');
    return reactions.length > 0;
  } catch {
    return false;
  }
}
