// src/core/config.js
// Loads configuration from .env, config/*.json, and config/prompt.txt.

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// Load .env
dotenv.config({ path: path.join(ROOT, '.env') });

export function getConfig() {
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'profile.json'), 'utf-8'));
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'settings.json'), 'utf-8'));
  const promptTemplate = fs.readFileSync(path.join(ROOT, 'config', 'prompt.txt'), 'utf-8');

  return {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || settings.gemini.model,
      dailyLimit: parseInt(process.env.GEMINI_DAILY_LIMIT, 10) || settings.gemini.daily_limit,
      rpmLimit: settings.gemini.rpm_limit,
      requestDelayMs: settings.gemini.request_delay_ms,
      maxRetriesPerItem: settings.gemini.max_retries_per_item,
      maxPdfPagesAuto: settings.gemini.max_pdf_pages_auto,
    },
    profile,
    profileJson: JSON.stringify(profile, null, 2),
    promptTemplate,
    settings,
    paths: {
      root: ROOT,
      data: path.join(ROOT, 'data'),
      notices: path.join(ROOT, 'data', 'notices'),
      exports: path.join(ROOT, 'data', 'exports'),
      logs: path.join(ROOT, 'logs'),
    },
  };
}
