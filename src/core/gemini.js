// src/core/gemini.js
// Gemini API client — sends PDFs/text to Gemini for eligibility checking.
// Tracks daily API call count and enforces the safety limit.

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COUNTER_FILE = path.join(__dirname, '..', '..', 'data', '.api_counter.json');

/**
 * Load or reset the daily API call counter.
 * Resets if the stored date is not today.
 */
function loadCounter() {
  try {
    const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf-8'));
    const today = new Date().toISOString().slice(0, 10);
    if (data.date === today) return data;
    return { date: today, calls: 0 };
  } catch {
    return { date: new Date().toISOString().slice(0, 10), calls: 0 };
  }
}

function saveCounter(counter) {
  fs.mkdirSync(path.dirname(COUNTER_FILE), { recursive: true });
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counter, null, 2));
}

/**
 * Check if we can make another API call within the daily limit.
 */
export function canCallAPI(dailyLimit) {
  const counter = loadCounter();
  return counter.calls < dailyLimit;
}

/**
 * Increment the API call counter. Returns the new count.
 */
function incrementCounter() {
  const counter = loadCounter();
  counter.calls += 1;
  saveCounter(counter);
  return counter.calls;
}

/**
 * Get current counter stats.
 */
export function getCounterStats(dailyLimit) {
  const counter = loadCounter();
  return {
    date: counter.date,
    calls: counter.calls,
    limit: dailyLimit,
    remaining: Math.max(0, dailyLimit - counter.calls),
  };
}

/**
 * Send a notification (PDF buffer or text) to Gemini and get eligibility JSON.
 *
 * @param {Object} options
 * @param {string} options.apiKey - Gemini API key
 * @param {string} options.model - Model name (e.g., 'gemini-2.0-flash')
 * @param {number} options.dailyLimit - Max API calls per day
 * @param {string} options.promptTemplate - The eligibility prompt template
 * @param {string} options.profileJson - The candidate profile as JSON string
 * @param {Buffer|null} options.pdfBuffer - PDF file contents (if sending a PDF)
 * @param {string|null} options.textContent - Plain text content (if sending text)
 * @param {string|null} options.mimeType - MIME type of the file ('application/pdf', etc.)
 * @returns {Object} { result: parsed JSON array, tokensUsed: number, modelUsed: string, raw: string }
 */
export async function checkEligibility({
  apiKey,
  model,
  dailyLimit,
  promptTemplate,
  profileJson,
  pdfBuffer = null,
  textContent = null,
  mimeType = 'application/pdf',
}) {
  // Check daily limit
  if (!canCallAPI(dailyLimit)) {
    const stats = getCounterStats(dailyLimit);
    throw new Error(
      `Daily API limit reached (${stats.calls}/${stats.limit}). ` +
      `Resets tomorrow. Remaining calls: 0.`
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  // Build the prompt with profile injected
  const prompt = promptTemplate.replace('{{PROFILE}}', profileJson);

  // Build the parts array
  const parts = [];

  if (pdfBuffer) {
    // Send as inline data (Gemini native PDF/image support)
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: pdfBuffer.toString('base64'),
      },
    });
    parts.push({ text: prompt });
  } else if (textContent) {
    // Send as text
    parts.push({
      text: `=== NOTIFICATION TEXT ===\n${textContent}\n\n=== END OF NOTIFICATION ===\n\n${prompt}`,
    });
  } else {
    throw new Error('Either pdfBuffer or textContent must be provided.');
  }

  // Robust retry with exponential backoff for transient errors (503 Service Unavailable / 429 Rate Limit)
  let lastError;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = attempt * 8000;
        console.log(`⏳ Retry attempt ${attempt}/${maxRetries} after ${delay / 1000}s backoff...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const result = await genModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1, // Low temperature for factual extraction
          maxOutputTokens: 8192,
        },
      });

      // Increment counter AFTER successful call
      incrementCounter();

      const response = result.response;
      const rawText = response.text();

      // Extract token usage
      const usage = response.usageMetadata || {};
      const tokensUsed = (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);

      return {
        raw: rawText,
        tokensUsed,
        modelUsed: model,
      };
    } catch (err) {
      lastError = err;
      const isTransient = err.message.includes('503') ||
        err.message.includes('429') ||
        err.message.includes('high demand') ||
        err.message.includes('overloaded');

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      console.warn(`⚠️ Transient API error (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}`);
    }
  }

  throw lastError;
}
