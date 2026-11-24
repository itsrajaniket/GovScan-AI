// src/core/aggregators.js
// Multi-portal discovery engine that searches top Indian government job indexers
// to discover official .gov.in / PSU notification PDFs and online application portals.
// Strictly adheres to Rule 11: Third-party indexers are hints only; always extracts
// the official notification PDF and applies directly.

import https from 'https';
import * as cheerio from 'cheerio';
import { verifyNoticeCandidate } from './verify.js';
import { fetchSarkariResultNotices } from './sarkari-result.js';

const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Fetch HTML of an aggregator page politely.
 */
async function fetchHtml(url) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url, {
    agent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 25000,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return await res.text();
}

/**
 * Extract official notification PDF and apply portal from a FreeJobAlert job article.
 */
async function extractOfficialLinksFromFreeJobAlert(detailUrl) {
  try {
    const html = await fetchHtml(detailUrl);
    const $ = cheerio.load(html);

    let notificationPdfUrl = null;
    let applyUrl = null;
    let officialWebsiteUrl = null;

    $('table tr').each((_, row) => {
      const rowText = $(row).text().replace(/\s+/g, ' ').toLowerCase();

      if (rowText.includes('notification') || rowText.includes('detailed')) {
        $(row).find('a').each((_, a) => {
          const h = $(a).attr('href');
          if (h && (h.includes('.pdf') || h.startsWith('http')) && !h.includes('freejobalert.com')) {
            notificationPdfUrl = h;
          }
        });
      }

      if (rowText.includes('apply online') || rowText.includes('registration')) {
        $(row).find('a').each((_, a) => {
          const h = $(a).attr('href');
          if (h && h.startsWith('http') && !h.includes('freejobalert.com')) {
            applyUrl = h;
          }
        });
      }

      if (rowText.includes('official website')) {
        $(row).find('a').each((_, a) => {
          const h = $(a).attr('href');
          if (h && h.startsWith('http') && !h.includes('freejobalert.com')) {
            officialWebsiteUrl = h;
          }
        });
      }
    });

    // Fallback search across all anchors if table rows were irregular
    if (!notificationPdfUrl) {
      $('a').each((_, a) => {
        const h = $(a).attr('href') || '';
        const t = $(a).text().toLowerCase();
        if ((t.includes('notification') || h.endsWith('.pdf')) && !h.includes('freejobalert.com') && h.startsWith('http')) {
          notificationPdfUrl = h;
        }
        if (t.includes('apply online') && !h.includes('freejobalert.com') && h.startsWith('http') && !applyUrl) {
          applyUrl = h;
        }
      });
    }

    return { notificationPdfUrl, applyUrl, officialWebsiteUrl };
  } catch (err) {
    return { notificationPdfUrl: null, applyUrl: null, error: err.message };
  }
}

/**
 * Fetch latest technical and engineering notices from FreeJobAlert.
 *
 * @param {number} limit - Number of latest notices to resolve (default: 10)
 * @returns {Promise<Array>} List of verified official candidate notices
 */
export async function fetchFreeJobAlertNotices(limit = 10) {
  const indexUrl = 'https://www.freejobalert.com/latest-notifications/';
  const html = await fetchHtml(indexUrl);
  const $ = cheerio.load(html);

  const candidatePosts = [];

  // Parse notification table rows
  $('table tr').each((_, row) => {
    const text = $(row).text().replace(/\s+/g, ' ').trim();
    const link = $(row).find('a').attr('href');

    if (link && link.includes('freejobalert.com') && !link.includes('#')) {
      // Prioritize technical, scientific, engineering, assistant, officer, and graduate posts
      const lower = text.toLowerCase();
      const isTechRelevant = lower.includes('engineer') || lower.includes('scientist') ||
        lower.includes('technical') || lower.includes('assistant') ||
        lower.includes('officer') || lower.includes('graduate') ||
        lower.includes('electronics') || lower.includes('physics') ||
        lower.includes('trainee') || lower.includes('project');

      if (isTechRelevant && !candidatePosts.some(p => p.url === link)) {
        candidatePosts.push({ title: text, url: link });
      }
    }
  });

  const selected = candidatePosts.slice(0, limit);
  const verifiedNotices = [];

  for (const post of selected) {
    const verify = verifyNoticeCandidate(post.title, post.url);
    if (!verify.isVacancy) continue;

    const details = await extractOfficialLinksFromFreeJobAlert(post.url);

    if (details.notificationPdfUrl) {
      verifiedNotices.push({
        source_id: 'freejobalert',
        source_name: 'FreeJobAlert Indexer',
        title: post.title,
        url: details.notificationPdfUrl,
        official_apply_url: details.applyUrl,
        official_website_url: details.officialWebsiteUrl,
        isCorrigendum: verify.isCorrigendum,
        confidence: 'high',
        source_type: 'aggregator_official_pdf',
      });
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  return verifiedNotices;
}

/**
 * Fetch M.Sc & Tech notices from IndGovtJobs.
 *
 * @param {number} limit - Number of latest notices to resolve (default: 10)
 * @returns {Promise<Array>} List of verified official candidate notices
 */
export async function fetchIndGovtJobsNotices(limit = 10) {
  const indexUrl = 'https://www.indgovtjobs.in/search/label/M.Sc%20Jobs';
  const html = await fetchHtml(indexUrl);
  const $ = cheerio.load(html);

  const candidatePosts = [];

  $('.post-title a, h2.post-title a, article h2 a').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().replace(/\s+/g, ' ').trim();

    if (href && title && !candidatePosts.some(p => p.url === href)) {
      candidatePosts.push({ title, url: href });
    }
  });

  const selected = candidatePosts.slice(0, limit);
  const verifiedNotices = [];

  for (const post of selected) {
    const verify = verifyNoticeCandidate(post.title, post.url);
    if (!verify.isVacancy) continue;

    try {
      const detailHtml = await fetchHtml(post.url);
      const $d = cheerio.load(detailHtml);

      let notifUrl = null;
      let applyUrl = null;

      $d('a').each((_, a) => {
        const h = $d(a).attr('href') || '';
        const t = $d(a).text().toLowerCase();

        if ((t.includes('notification') || t.includes('detailed notification') || h.endsWith('.pdf')) &&
            !h.includes('indgovtjobs.in') && h.startsWith('http')) {
          notifUrl = h;
        }
        if ((t.includes('apply online') || t.includes('official website')) &&
            !h.includes('indgovtjobs.in') && h.startsWith('http') && !applyUrl) {
          applyUrl = h;
        }
      });

      if (notifUrl) {
        verifiedNotices.push({
          source_id: 'indgovtjobs',
          source_name: 'IndGovtJobs M.Sc Feed',
          title: post.title,
          url: notifUrl,
          official_apply_url: applyUrl,
          isCorrigendum: verify.isCorrigendum,
          confidence: 'high',
          source_type: 'aggregator_official_pdf',
        });
      }
    } catch {
      // Continue on detail fetch error
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  return verifiedNotices;
}

/**
 * Unified dispatcher to run any configured aggregator.
 */
export async function fetchAggregatorNotices(aggregatorConfig) {
  const limit = aggregatorConfig.limit || 10;
  if (aggregatorConfig.id === 'sarkari_result') {
    return await fetchSarkariResultNotices(limit);
  }
  if (aggregatorConfig.id === 'freejobalert') {
    return await fetchFreeJobAlertNotices(limit);
  }
  if (aggregatorConfig.id === 'indgovtjobs') {
    return await fetchIndGovtJobsNotices(limit);
  }
  return [];
}

export { fetchSarkariResultNotices };
