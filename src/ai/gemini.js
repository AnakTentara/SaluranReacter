import { GoogleGenAI } from '@google/genai';
import { getConfig } from '../utils/config.js';
import { checkRateLimit, waitForRateLimit, recordCall, backoffOnRateLimit } from './ratelimit.js';
import { SYSTEM_PROMPT, REACTION_SCHEMA, buildUserPrompt } from './prompt.js';
import logger from '../utils/logger.js';

const MODEL = 'gemini-3.1-flash-lite';
const MAX_RETRIES = 4;
const ESTIMATED_TOKENS = 8000; // conservative estimate per request

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
  const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Gemini API key not configured. Set it in the dashboard or .env file.');
  }

  // Wait if rate limit would be hit
  await waitForRateLimit(ESTIMATED_TOKENS);

  const ai = new GoogleGenAI({ apiKey });
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
    try {
      logger.info({ model: MODEL, attempt, accountCount: accounts.length }, 'Calling Gemini AI');

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

      // Record successful call
      const tokensUsed = response.usageMetadata?.totalTokenCount || ESTIMATED_TOKENS;
      recordCall(tokensUsed);

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
      const is429 =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('quota');

      const isRetryable =
        is429 ||
        err?.status === 500 ||
        err?.status === 503 ||
        err?.status === 504;

      if (isRetryable && attempt < MAX_RETRIES) {
        await backoffOnRateLimit(attempt);
        // If it was a 429, also re-check our local rate limit
        if (is429) await waitForRateLimit(ESTIMATED_TOKENS, attempt + 1);
        continue;
      }

      logger.error({ err: err.message, attempt }, 'Gemini AI call failed');
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
