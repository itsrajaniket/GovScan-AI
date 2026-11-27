// src/cli/discover.js
// Automated discovery runner:
// 1. Checks all enabled page watchers (CSS hashing)
// 2. Checks all enabled Google Alerts RSS feeds
// 3. Verifies each item (official domain, recruitment keywords)
// 4. Downloads new notices
// 5. Evaluates eligibility via Gemini
// 6. Stores in SQLite and sends Telegram alerts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../core/config.js';
import { checkSource } from '../core/watcher.js';
import { fetchAndFilterRss } from '../core/rss.js';
import { fetchAggregatorNotices } from '../core/aggregators.js';
import { downloadNotice, readDocument } from '../core/pdf-handler.js';
import { checkEligibility, getCounterStats, canCallAPI } from '../core/gemini.js';
import { parseAndValidate } from '../core/schema.js';
import { getDB, upsertJob, closeDB } from '../core/database.js';
import { sendJobAlerts, sendMessage } from '../core/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function printHeader(title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function printSection(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 54 - title.length))}`);
}

async function main() {
  const config = getConfig();
  const sourcesConfigPath = path.join(config.paths.root, 'config', 'sources.json');
  const sourcesData = JSON.parse(fs.readFileSync(sourcesConfigPath, 'utf8'));

  printHeader('GovScan AI — Discovery Engine');

  const stats = getCounterStats(config.gemini.dailyLimit);
  console.log(`📊 API calls today: ${stats.calls}/${stats.limit} (${stats.remaining} remaining)`);

  const discoveredItems = [];

  // ── Step 1: Check Page Watchers ──
  printSection('Running Page Watchers');
  const watchers = (sourcesData.watchers || []).filter(w => w.enabled);

  if (watchers.length === 0) {
    console.log('ℹ️  No watchers enabled yet in config/sources.json (URLs pending verification).');
  } else {
    for (const watcher of watchers) {
      console.log(`🔍 Checking: ${watcher.name}...`);
      const res = await checkSource(watcher);
      if (res.error) {
        console.warn(`   ⚠️ Error: ${res.error}`);
      } else if (res.changed) {
        console.log(`   ✨ Content change detected! Found ${res.notices.length} candidate notice(s).`);
        discoveredItems.push(...res.notices);
      } else {
        console.log(`   ✔️ No changes detected.`);
      }
      // Polite delay between sources (3 seconds)
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ── Step 2: Check Google Alerts RSS ──
  printSection('Checking Google Alerts RSS');
  const rssFeeds = (sourcesData.google_alerts_rss || []).filter(f => f.enabled);

  if (rssFeeds.length === 0) {
    console.log('ℹ️  No RSS feeds enabled yet in config/sources.json.');
  } else {
    for (const feed of rssFeeds) {
      console.log(`📡 Fetching feed: ${feed.name}...`);
      try {
        const items = await fetchAndFilterRss(feed.feed_url);
        console.log(`   ✨ Found ${items.length} verified candidate notice(s).`);
        for (const it of items) {
          discoveredItems.push({
            source_id: feed.id,
            source_name: feed.name,
            title: it.title,
            url: it.link,
            isCorrigendum: it.isCorrigendum,
            confidence: it.confidence,
            source_type: 'rss',
          });
        }
      } catch (err) {
        console.warn(`   ⚠️ Feed error: ${err.message}`);
      }
    }
  }

  // ── Step 3: Check Aggregators (Multi-Portal Indexers) ──
  printSection('Checking Aggregators (Sarkari Result, FreeJobAlert, IndGovtJobs)');
  const aggregators = (sourcesData.aggregators || []).filter(a => a.enabled);

  if (aggregators.length === 0) {
    console.log('ℹ️  No aggregators enabled in config/sources.json.');
  } else {
    for (const agg of aggregators) {
      console.log(`📡 Fetching aggregator notices from ${agg.name}...`);
      try {
        const notices = await fetchAggregatorNotices(agg);
        console.log(`   ✨ Found ${notices.length} official notice candidate(s) via ${agg.name}.`);
        discoveredItems.push(...notices);
      } catch (err) {
        console.warn(`   ⚠️ Aggregator error (${agg.name}): ${err.message}`);
      }
    }
  }

  // ── Step 4: Process Discovered Candidates ──
  // Deduplicate discovered items by URL
  const uniqueItems = [];
  const seenUrls = new Set();
  for (const item of discoveredItems) {
    if (item.url && !seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueItems.push(item);
    }
  }

  printSection(`Processing Discovered Candidates (${uniqueItems.length})`);

  if (uniqueItems.length === 0) {
    console.log('✅ Discovery complete: No new notices found across active sources.');
    closeDB();
    return;
  }

  const db = await getDB();
  let processedCount = 0;
  let newJobsCount = 0;

  for (const item of uniqueItems) {
    if (!canCallAPI(config.gemini.dailyLimit)) {
      console.warn(`⚠️ Daily Gemini API call limit reached (${config.gemini.dailyLimit}). Halting discovery processing for today.`);
      break;
    }

    // Check if we already processed this exact URL
    const existing = db.exec(`SELECT id FROM jobs WHERE official_notification_url = ?`, [item.url]);
    if (existing.length && existing[0].values.length > 0) {
      console.log(`⏩ Skipping already processed URL: ${item.url}`);
      continue;
    }

    // Safety check: Historical year filter (Drop ancient notices before downloading or spending Gemini tokens)
    const currentYear = new Date().getFullYear();
    const minAllowedYear = currentYear - 1;
    const combinedStr = `${item.title || ''} ${item.url || ''}`.toLowerCase();
    const yearMatches = combinedStr.match(/\b(19\d\d|20\d\d)\b/g);
    if (yearMatches) {
      const explicitYears = yearMatches.map(y => parseInt(y, 10)).filter(y => y >= 1990 && y <= currentYear + 2);
      if (explicitYears.length > 0 && explicitYears.every(y => y < minAllowedYear)) {
        console.log(`⏩ Skipping historical notice (< ${minAllowedYear}): ${item.title}`);
        continue;
      }
    }

    console.log(`\n📥 Downloading notice: ${item.title}`);
    console.log(`   URL: ${item.url}`);

    let filePath;
    try {
      const dl = await downloadNotice(item.url, config.paths.notices);
      filePath = dl.filePath;
    } catch (err) {
      console.error(`   ❌ Failed to download: ${err.message}`);
      continue;
    }

    // Read document
    const doc = await readDocument(filePath);
    if (doc.isPasswordProtected) {
      console.warn(`   ⚠️ Password-protected notice skipped.`);
      continue;
    }

    const isTextPdf = doc.type === 'pdf' && !doc.isScanned && doc.text && doc.text.trim().length >= 200;
    const pdfBuffer = (doc.type === 'pdf' && !isTextPdf) ? doc.buffer : null;
    const textContent = (doc.type !== 'pdf' || isTextPdf) ? doc.text : null;

    // Check eligibility with Gemini
    console.log(`   🤖 Evaluating eligibility via Gemini (${isTextPdf ? 'text mode' : doc.type})...`);
    try {
      const geminiRes = await checkEligibility({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        dailyLimit: config.gemini.dailyLimit,
        promptTemplate: config.promptTemplate,
        profileJson: config.profileJson,
        pdfBuffer,
        textContent,
        mimeType: doc.mimeType,
      });

      const { posts, errors, parseError } = parseAndValidate(geminiRes.raw);
      if (parseError) {
        console.error(`   ❌ Failed to parse Gemini response: ${parseError}`);
        continue;
      }

      console.log(`   📋 Evaluated ${posts.length} post(s).`);

      const postsToAlert = [];
      for (const post of posts) {
        const postData = {
          ...post,
          pdf_hash: doc.hash,
          gemini_model_used: geminiRes.modelUsed,
          tokens_used: geminiRes.tokensUsed,
          source_type: item.source_type,
          local_pdf_path: filePath,
          official_notification_url: item.url,
          official_apply_url: item.official_apply_url || post.official_apply_url || '',
        };

        const upsertRes = await upsertJob(postData);
        if (upsertRes.action === 'inserted' || upsertRes.corrigendum) {
          postsToAlert.push(postData);
          newJobsCount++;
        }
      }

      // Send Telegram alerts (only for actionable: Eligible/Manual Review and not expired)
      if (postsToAlert.length > 0) {
        const alertResults = await sendJobAlerts(postsToAlert);
        const actuallySent = alertResults.filter(r => r.sent).length;
        if (actuallySent > 0) {
          console.log(`   📱 Sent Telegram alerts for ${actuallySent} actionable post(s).`);
        }
      }

      processedCount++;
      // Wait between API calls (polite rate limiting)
      await new Promise(r => setTimeout(r, config.gemini.requestDelayMs || 4000));
    } catch (err) {
      console.error(`   ❌ Error evaluating notice: ${err.message}`);
    }
  }

  printHeader('Discovery Summary');
  console.log(`Candidates discovered: ${uniqueItems.length}`);
  console.log(`Notices processed:    ${processedCount}`);
  console.log(`New jobs stored:       ${newJobsCount}`);

  closeDB();
}

main().catch(err => {
  console.error(`\n❌ Discovery fatal error: ${err.message}`);
  process.exit(1);
});
