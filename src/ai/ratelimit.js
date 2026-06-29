import logger from '../utils/logger.js';
import { logApiCall, getTodayApiCallCount } from '../utils/db.js';
import { getConfig } from '../utils/config.js';

// ─── Free Tier Limits (with -2 buffer) ────────────────────────────────────
const LIMITS = {
  RPM: 13,          // 15 - 2
  TPM: 248000,      // 250000 - 2000
  RPD: 498,         // 500 - 2
};

// Map of keyMasked → { minuteWindow: Array, tokenMinuteUsed: Number }
const keyStates = new Map();

function getKeyState(keyMasked = 'default') {
  if (!keyStates.has(keyMasked)) {
    keyStates.set(keyMasked, {
      minuteWindow: [],
      tokenMinuteUsed: 0
    });
  }
  return keyStates.get(keyMasked);
}

// Reset minute windows for all tracked keys every 5s
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, state] of keyStates.entries()) {
    while (state.minuteWindow.length > 0 && state.minuteWindow[0].timestamp < cutoff) {
      state.tokenMinuteUsed -= state.minuteWindow[0].tokens;
      state.minuteWindow.shift();
    }
    if (state.tokenMinuteUsed < 0) state.tokenMinuteUsed = 0;
  }
}, 5_000);

/**
 * Check if we can make a Gemini API call with a specific key.
 * Returns { allowed: boolean, waitMs: number, reason: string }
 */
export function checkRateLimit(apiKeyMasked = 'default', estimatedTokens = 5000) {
  const now = Date.now();
  const cutoff = now - 60_000;
  const state = getKeyState(apiKeyMasked);

  // Clean expired entries from window
  while (state.minuteWindow.length > 0 && state.minuteWindow[0].timestamp < cutoff) {
    state.tokenMinuteUsed -= state.minuteWindow[0].tokens;
    state.minuteWindow.shift();
  }
  if (state.tokenMinuteUsed < 0) state.tokenMinuteUsed = 0;

  const currentRpm = state.minuteWindow.length;
  const todayCount = getTodayApiCallCount(apiKeyMasked);

  if (todayCount >= LIMITS.RPD) {
    return { allowed: false, waitMs: msUntilMidnight(), reason: `RPD limit reached (${todayCount}/${LIMITS.RPD})` };
  }

  if (currentRpm >= LIMITS.RPM) {
    // Wait until oldest entry exits the 60s window
    const oldestTs = state.minuteWindow[0]?.timestamp || now;
    const waitMs = Math.max(0, 60_000 - (now - oldestTs)) + 500;
    return { allowed: false, waitMs, reason: `RPM limit reached (${currentRpm}/${LIMITS.RPM})` };
  }

  if (state.tokenMinuteUsed + estimatedTokens > LIMITS.TPM) {
    const oldestTs = state.minuteWindow[0]?.timestamp || now;
    const waitMs = Math.max(0, 60_000 - (now - oldestTs)) + 500;
    return { allowed: false, waitMs, reason: `TPM limit would be exceeded (${state.tokenMinuteUsed}+${estimatedTokens}/${LIMITS.TPM})` };
  }

  return { allowed: true, waitMs: 0, reason: 'ok' };
}

/**
 * Record a successful API call.
 */
export function recordCall(apiKeyMasked = 'default', tokensUsed = 0) {
  const now = Date.now();
  const state = getKeyState(apiKeyMasked);
  state.minuteWindow.push({ timestamp: now, tokens: tokensUsed });
  state.tokenMinuteUsed += tokensUsed;
  logApiCall(apiKeyMasked, tokensUsed);
}

/**
 * Get current usage stats for a specific key.
 */
export function getRateLimitStats(apiKeyMasked = 'default') {
  const state = getKeyState(apiKeyMasked);
  const currentRpm = state.minuteWindow.length;
  const todayCount = getTodayApiCallCount(apiKeyMasked);
  return {
    key: apiKeyMasked,
    rpm: { used: currentRpm, limit: LIMITS.RPM },
    tpm: { used: state.tokenMinuteUsed, limit: LIMITS.TPM },
    rpd: { used: todayCount, limit: LIMITS.RPD },
  };
}

/**
 * Get rate limit stats for all currently configured keys.
 */
export function getAllRateLimitStats() {
  const cfg = getConfig();
  let keys = [];
  if (Array.isArray(cfg.geminiApiKeys)) {
    keys = cfg.geminiApiKeys.map(k => k ? `${k.trim().slice(0, 8)}...` : '').filter(Boolean);
  }
  if (keys.length === 0 && cfg.geminiApiKey) {
    keys.push(`${cfg.geminiApiKey.trim().slice(0, 8)}...`);
  }
  if (keys.length === 0) {
    keys.push('default');
  }

  return keys.map(k => getRateLimitStats(k));
}

/**
 * Wait until rate limit allows a call, then resolve.
 * Includes exponential backoff for 429 errors.
 */
export async function waitForRateLimit(apiKeyMasked = 'default', estimatedTokens = 5000, attempt = 0) {
  const check = checkRateLimit(apiKeyMasked, estimatedTokens);
  if (check.allowed) return;

  logger.warn({ key: apiKeyMasked, reason: check.reason, waitMs: check.waitMs }, 'Rate limit — waiting');
  await sleep(check.waitMs);
  return waitForRateLimit(apiKeyMasked, estimatedTokens, attempt + 1);
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
