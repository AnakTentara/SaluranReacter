import logger from '../utils/logger.js';
import { logApiCall, getTodayApiCallCount } from '../utils/db.js';

// ─── Free Tier Limits (with -2 buffer) ────────────────────────────────────
const LIMITS = {
  RPM: 13,          // 15 - 2
  TPM: 248000,      // 250000 - 2000
  RPD: 498,         // 500 - 2
};

// Sliding window entries: { timestamp: ms, tokens: number }
const minuteWindow = [];
let tokenMinuteUsed = 0;

// Reset minute window every 60s
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  let removed = 0;
  while (minuteWindow.length > 0 && minuteWindow[0].timestamp < cutoff) {
    tokenMinuteUsed -= minuteWindow[0].tokens;
    minuteWindow.shift();
    removed++;
  }
  if (tokenMinuteUsed < 0) tokenMinuteUsed = 0;
}, 5_000);

/**
 * Check if we can make a Gemini API call.
 * Returns { allowed: boolean, waitMs: number, reason: string }
 */
export function checkRateLimit(estimatedTokens = 5000) {
  const now = Date.now();
  const cutoff = now - 60_000;

  // Clean expired entries from window
  while (minuteWindow.length > 0 && minuteWindow[0].timestamp < cutoff) {
    tokenMinuteUsed -= minuteWindow[0].tokens;
    minuteWindow.shift();
  }
  if (tokenMinuteUsed < 0) tokenMinuteUsed = 0;

  const currentRpm = minuteWindow.length;
  const todayCount = getTodayApiCallCount();

  if (todayCount >= LIMITS.RPD) {
    return { allowed: false, waitMs: msUntilMidnight(), reason: `RPD limit reached (${todayCount}/${LIMITS.RPD})` };
  }

  if (currentRpm >= LIMITS.RPM) {
    // Wait until oldest entry exits the 60s window
    const oldestTs = minuteWindow[0]?.timestamp || now;
    const waitMs = Math.max(0, 60_000 - (now - oldestTs)) + 500;
    return { allowed: false, waitMs, reason: `RPM limit reached (${currentRpm}/${LIMITS.RPM})` };
  }

  if (tokenMinuteUsed + estimatedTokens > LIMITS.TPM) {
    const oldestTs = minuteWindow[0]?.timestamp || now;
    const waitMs = Math.max(0, 60_000 - (now - oldestTs)) + 500;
    return { allowed: false, waitMs, reason: `TPM limit would be exceeded (${tokenMinuteUsed}+${estimatedTokens}/${LIMITS.TPM})` };
  }

  return { allowed: true, waitMs: 0, reason: 'ok' };
}

/**
 * Record a successful API call.
 */
export function recordCall(tokensUsed = 0) {
  const now = Date.now();
  minuteWindow.push({ timestamp: now, tokens: tokensUsed });
  tokenMinuteUsed += tokensUsed;
  logApiCall(tokensUsed);
}

/**
 * Get current usage stats for dashboard.
 */
export function getRateLimitStats() {
  const currentRpm = minuteWindow.length;
  const todayCount = getTodayApiCallCount();
  return {
    rpm: { used: currentRpm, limit: LIMITS.RPM },
    tpm: { used: tokenMinuteUsed, limit: LIMITS.TPM },
    rpd: { used: todayCount, limit: LIMITS.RPD },
  };
}

/**
 * Wait until rate limit allows a call, then resolve.
 * Includes exponential backoff for 429 errors.
 */
export async function waitForRateLimit(estimatedTokens = 5000, attempt = 0) {
  const check = checkRateLimit(estimatedTokens);
  if (check.allowed) return;

  logger.warn({ reason: check.reason, waitMs: check.waitMs }, 'Rate limit — waiting');
  await sleep(check.waitMs);
  return waitForRateLimit(estimatedTokens, attempt + 1);
}

/**
 * Exponential backoff for 429 responses from API.
 */
export async function backoffOnRateLimit(attempt) {
  const baseMs = 2000;
  const jitter = Math.random() * 1000;
  const waitMs = Math.min(baseMs * Math.pow(2, attempt) + jitter, 60_000);
  logger.warn({ attempt, waitMs: Math.round(waitMs) }, '429 received — backing off');
  await sleep(waitMs);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  return midnight.getTime() - now.getTime();
}
