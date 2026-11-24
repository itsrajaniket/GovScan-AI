// src/core/watcher.js
// Career page watcher with CSS-selector content hashing & link extraction.
// Tracks source health, respects politeness delays, detects updates.

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { getDB, save } from './database.js';
import { verifyNoticeCandidate, isOfficialDomain } from './verify.js';

/**
 * Fetch HTML of a career page politely.
 */
async function fetchPage(url) {
  const fetch = (await import('node-fetch')).default;
  const https = (await import('https')).default;
  const agent = new https.Agent({ rejectUnauthorized: false });
  const res = await fetch(url, {
    agent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 30000,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return await res.text();
}

/**
 * Check a single source for changes and extract new notice links.
 *
 * @param {Object} source
 * @param {string} source.id - Unique ID (e.g., 'cdac')
 * @param {string} source.name - Friendly name
 * @param {string} source.career_url - URL of careers page
 * @param {string} source.css_selector - CSS selector targeting the notices area/table
 * @returns {Promise<{ changed: boolean, notices: Array, error: string|null }>}
 */
export async function checkSource(source) {
  const db = await getDB();

  // Retrieve stored hash
  const healthRow = db.exec(`SELECT last_checked, last_found_items, consecutive_empty_checks FROM source_health WHERE source_id = ?`, [source.id]);

  try {
    const html = await fetchPage(source.career_url);
    const $ = cheerio.load(html);

    // Select the designated notice area or fallback to body/main if selector not found
    let targetArea = $(source.css_selector);
    if (targetArea.length === 0) {
      targetArea = $('main, #content, .content, table, body');
    }

    const areaHtml = targetArea.html() || '';
    const currentHash = createHash('sha256').update(areaHtml.trim()).digest('hex');

    // Check stored hash in table
    const storedHashRow = db.exec(`SELECT content_hash FROM source_health WHERE source_id = ?`, [source.id]);
    const storedHash = storedHashRow.length && storedHashRow[0].values.length ? storedHashRow[0].values[0][0] : null;

    const changed = !storedHash || storedHash !== currentHash;
    const notices = [];

    if (changed) {
      // Extract links inside the target area
      targetArea.find('a').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href');
        const text = $a.text().replace(/\s+/g, ' ').trim();

        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          let fullUrl;
          try {
            fullUrl = new URL(href, source.career_url).href;
          } catch {
            return;
          }

          // Verify if it's a vacancy link
          const check = verifyNoticeCandidate(text, fullUrl);
          if (check.isVacancy) {
            notices.push({
              source_id: source.id,
              source_name: source.name,
              title: text || source.name + ' Notification',
              url: fullUrl,
              isCorrigendum: check.isCorrigendum,
              confidence: check.confidence,
              source_type: 'watcher',
            });
          }
        }
      });
    }

    // Update source health
    const now = new Date().toISOString();
    const hasItems = notices.length > 0;

    db.run(`
      INSERT INTO source_health (source_id, source_name, last_checked, last_found_items, consecutive_empty_checks, is_healthy, content_hash)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        last_checked = ?,
        last_found_items = CASE WHEN ? THEN ? ELSE last_found_items END,
        consecutive_empty_checks = CASE WHEN ? THEN 0 ELSE consecutive_empty_checks + 1 END,
        is_healthy = 1,
        content_hash = ?
    `, [
      source.id, source.name, now, hasItems ? now : null, hasItems ? 0 : 1, currentHash,
      now, hasItems ? 1 : 0, now, hasItems ? 1 : 0, currentHash
    ]);
    save();

    return { changed, notices, error: null };
  } catch (err) {
    db.run(`
      INSERT INTO source_health (source_id, source_name, last_checked, is_healthy)
      VALUES (?, ?, datetime('now'), 0)
      ON CONFLICT(source_id) DO UPDATE SET
        last_checked = datetime('now'),
        is_healthy = 0
    `, [source.id, source.name]);
    save();

    return { changed: false, notices: [], error: err.message };
  }
}
