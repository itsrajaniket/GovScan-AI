// src/core/rss.js
// Google Alerts RSS Feed reader & parser.
// Unwraps Google redirect URLs, verifies official domain, filters out non-vacancies.

import * as cheerio from 'cheerio';
import { isOfficialDomain, verifyNoticeCandidate } from './verify.js';

/**
 * Unwrap Google Alerts redirect URL to extract actual destination.
 * e.g., https://www.google.com/url?rct=j&sa=t&url=https://nielit.gov.in/job.pdf&...
 */
export function unwrapGoogleUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    if (rawUrl.includes('google.com/url?') && rawUrl.includes('url=')) {
      const parsed = new URL(rawUrl);
      const target = parsed.searchParams.get('url');
      if (target) return decodeURIComponent(target);
    }
  } catch {}
  return rawUrl;
}

/**
 * Parse an RSS feed string (XML) and return array of items.
 */
export function parseRssXml(xmlContent) {
  const $ = cheerio.load(xmlContent, { xmlMode: true });
  const items = [];

  // Supports standard <item> (RSS 2.0) and <entry> (Atom)
  $('item, entry').each((_, el) => {
    const $el = $(el);

    // Title: strip HTML tags (Google Alerts bolds search terms with <b>)
    let title = $el.find('title').first().text() || '';
    title = title.replace(/<[^>]+>/g, '').trim();

    // Link: RSS uses <link>, Atom often uses <link href="..." />
    let link = $el.find('link').text() || $el.find('link').attr('href') || '';
    link = unwrapGoogleUrl(link.trim());

    // Description/snippet
    let snippet = $el.find('description, content, summary').first().text() || '';
    snippet = snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    // Published Date
    const pubDate = $el.find('pubDate, published, updated').first().text() || '';

    if (link) {
      items.push({
        title,
        link,
        snippet,
        pubDate: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      });
    }
  });

  return items;
}

/**
 * Fetch and process a Google Alerts RSS feed.
 *
 * @param {string} feedUrl - RSS feed URL
 * @param {Object} options - { requireOfficialDomain: boolean }
 * @returns {Promise<Array>} List of verified vacancy candidate items
 */
export async function fetchAndFilterRss(feedUrl, options = { requireOfficialDomain: true }) {
  const fetch = (await import('node-fetch')).default;

  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    timeout: 20000,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: HTTP ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const rawItems = parseRssXml(xml);

  const verified = [];
  for (const item of rawItems) {
    // Check official domain if required
    if (options.requireOfficialDomain && !isOfficialDomain(item.link)) {
      continue;
    }

    // Verify candidate
    const check = verifyNoticeCandidate(item.title + ' ' + item.snippet, item.link);
    if (check.isVacancy) {
      verified.push({
        ...item,
        isCorrigendum: check.isCorrigendum,
        confidence: check.confidence,
        source_type: 'rss',
      });
    }
  }

  return verified;
}
