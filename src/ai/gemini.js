import { GoogleGenAI } from '@google/genai';
import { getConfig, getMaskedKey } from '../utils/config.js';
import { checkRateLimit, waitForRateLimit, recordCall, backoffOnRateLimit } from './ratelimit.js';
import { SYSTEM_PROMPT, REACTION_SCHEMA, buildUserPrompt } from './prompt.js';
import logger from '../utils/logger.js';

const MODEL = 'gemini-3.1-flash-lite';
const MAX_RETRIES = 4;
const ESTIMATED_TOKENS = 8000; // conservative estimate per request

let currentKeyIndex = 0;

/**
 * Main entry point — analyze a new channel post and return reaction decisions.
 *
 * @param {object} post - { id, contentType, textContent, caption, timestamp, mediaBase64, mediaMimeType }
 * @param {object} contextPosts - { todayPosts, yesterdayPosts }
 * @param {Array}  accounts - enabled accounts from config
 * @returns {object} parsed AI JSON response { analysis, reactions }
 */
export async function analyzePost(post, contextPosts, accounts) {
  const cfg = getConfig();
  
  // Get all unique active API keys
  let keys = [];
  if (Array.isArray(cfg.geminiApiKeys)) {
    keys = cfg.geminiApiKeys.map(k => k?.trim()).filter(Boolean);
  }
  if (keys.length === 0 && cfg.geminiApiKey) {
    keys.push(cfg.geminiApiKey.trim());
  }
  if (keys.length === 0 && process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }

  if (keys.length === 0) {
    throw new Error('Gemini API key not configured. Set at least one in the dashboard settings.');
  }

  // Wait if local rate limit would be hit (pre-check with next active key)
  const initialKeyMasked = keys[currentKeyIndex] ? getMaskedKey(keys[currentKeyIndex]) : 'default';
  await waitForRateLimit(initialKeyMasked, ESTIMATED_TOKENS);

  const promptText = buildUserPrompt({ post, contextPosts, accounts });

  // Build content parts — text always first, then media if present
  const parts = [{ text: promptText }];
  if (post.mediaBase64 && post.mediaMimeType) {
    parts.push({
      inlineData: {
        mimeType: post.mediaMimeType,
        data: post.mediaBase64,
      },
    });
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Round-robin selection of the API key
    const activeApiKey = keys[currentKeyIndex];
    const maskedKey = getMaskedKey(activeApiKey);
    
    // Rotate to the next key for the next attempt/call
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;

    try {
      logger.info(
        { model: MODEL, attempt, accountCount: accounts.length, apiKeyIndex: currentKeyIndex, maskedKey },
        'Calling Gemini AI'
      );

      const ai = new GoogleGenAI({ apiKey: activeApiKey });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 1.7,
          responseMimeType: 'application/json',
          responseSchema: REACTION_SCHEMA,
        },
      });

      const raw = response.text;
      const parsed = JSON.parse(raw);

      // Record successful call using this specific key
      const tokensUsed = response.usageMetadata?.totalTokenCount || ESTIMATED_TOKENS;
      recordCall(maskedKey, tokensUsed);

      logger.info(
        {
          mood: parsed.analysis?.mood,
          reactingCount: parsed.analysis?.reactingAccountsCount,
          tokensUsed,
        },
        'Gemini AI response received'
      );

      return parsed;
    } catch (err) {
      const errText = err?.message || '';
      const is429 =
        err?.status === 429 ||
        errText.includes('429') ||
        errText.includes('RESOURCE_EXHAUSTED') ||
        errText.includes('quota');

      const is5xx =
        err?.status === 500 ||
        err?.status === 502 ||
        err?.status === 503 ||
        err?.status === 504 ||
        errText.includes('500') ||
        errText.includes('502') ||
        errText.includes('503') ||
        errText.includes('504');

      const isRetryable = is429 || is5xx || errText.includes('fetch failed') || errText.includes('ETIMEDOUT');

      if (isRetryable && attempt < MAX_RETRIES) {
        const retryDelayMs = 30000; // Fixed 30 seconds retry delay as requested
        logger.warn(
          { err: err.message, attempt, retryDelayMs, nextApiKeyIndex: currentKeyIndex },
          'Gemini temporary error — switching key and retrying in 30 seconds...'
        );
        
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        
        // If it was a 429, also wait again for rate limit on this key
        if (is429) {
          await waitForRateLimit(maskedKey, ESTIMATED_TOKENS, attempt + 1);
        }
        continue;
      }

      logger.error({ err: err.message, attempt }, 'Gemini AI call failed permanently');
      throw err;
    }
  }
}

/**
 * Quick health check — verify API key works.
 */
export async function testApiKey(apiKey) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: 'Say "OK" in one word.',
      config: { temperature: 0 },
    });
    return { ok: true, response: response.text?.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
