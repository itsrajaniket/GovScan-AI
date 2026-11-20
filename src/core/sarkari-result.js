// src/core/sarkari-result.js
// Uses Sarkari Result as a fast discovery index to find official government notification PDFs.
// Strictly adheres to Rule 11: Third-party summaries are hints only; always extracts the
// official .gov.in / PSU notification PDF directly and evaluates the official text.

import https from 'https';
import * as cheerio from 'cheerio';
import { verifyNoticeCandidate } from './verify.js';

const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Fetch a page HTML politely.
 */
async function fetchHtml(url) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url, {
    agent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 20000,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return await res.text();
}

/**
 * Inspect a Sarkari Result job page to extract the official notification PDF and apply link.
 */
export async function extractOfficialLinksFromSarkariPage(pageUrl) {
  try {
    const html = await fetchHtml(pageUrl);
    const $ = cheerio.load(html);

    let notificationPdfUrl = null;
    let applyUrl = null;
    let officialWebsiteUrl = null;

    $('table tr').each((_, row) => {
      const text = $(row).text().replace(/\s+/g, ' ').trim();

      if (text.includes('Download Notification') || text.includes('Notification')) {
        $(row).find('a').each((_, a) => {
          const h = $(a).attr('href');
          if (h && (h.toLowerCase().includes('.pdf') || h.includes('http')) && !h.includes('sarkariresult.com')) {
            notificationPdfUrl = h;
          }
        });
      }

      if (text.includes('Apply Online')) {
        $(row).find('a').each((_, a) => {
          const h = $(a).attr('href');
          if (h && h.startsWith('http') && !h.includes('sarkariresult.com')) {
            applyUrl = h;
          }
        });
      }

      if (text.includes('Official Website')) {
        $(row).find('a').each((_, a) => {
          const h = $(a).attr('href');
          if (h && h.startsWith('http') && !h.includes('sarkariresult.com')) {
            officialWebsiteUrl = h;
          }
        });
      }
    });

    return {
      notificationPdfUrl,
      applyUrl,
      officialWebsiteUrl,
    };
  } catch (err) {
    return { notificationPdfUrl: null, applyUrl: null, error: err.message };
  }
}

/**
 * Fetch latest jobs from Sarkari Result and resolve their official notification links.
 *
 * @param {number} limit - Number of latest jobs to check (default: 10)
 * @returns {Promise<Array>} List of verified official candidate notices
 */
export async function fetchSarkariResultNotices(limit = 10) {
  const indexUrl = 'https://www.sarkariresult.com/latestjob/';
  const html = await fetchHtml(indexUrl);
  const $ = cheerio.load(html);

  const candidatePosts = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().replace(/\s+/g, ' ').trim();

    if (
      href &&
      !href.startsWith('#') &&
      !href.startsWith('javascript:') &&
      title.length > 8 &&
      !title.includes('Admit Card') &&
      !title.includes('Result') &&
      !title.includes('Answer Key')
    ) {
      try {
        const fullUrl = new URL(href, indexUrl).href;
        if (
          (fullUrl.includes('/202') || fullUrl.includes('/latestjob')) &&
          !candidatePosts.some(p => p.url === fullUrl)
        ) {
          candidatePosts.push({ title, url: fullUrl });
        }
      } catch { }
    }
  });

  const selected = candidatePosts.slice(0, limit);
  const verifiedNotices = [];

  for (const post of selected) {
    // Check if the title has keywords of interest
    const verify = verifyNoticeCandidate(post.title, post.url);
    if (!verify.isVacancy) continue;

    // Fetch official PDF and Apply link from the detail page
    const details = await extractOfficialLinksFromSarkariPage(post.url);

    if (details.notificationPdfUrl) {
      verifiedNotices.push({
        source_id: 'sarkari_result',
        source_name: 'Sarkari Result Indexer',
        title: post.title,
        url: details.notificationPdfUrl, // Official PDF link!
        official_apply_url: details.applyUrl,
        official_website_url: details.officialWebsiteUrl,
        isCorrigendum: verify.isCorrigendum,
        confidence: 'high',
        source_type: 'aggregator_official_pdf',
      });
    }

    // Polite delay (1 second) between detail pages
    await new Promise(r => setTimeout(r, 1000));
  }

  return verifiedNotices;
}
