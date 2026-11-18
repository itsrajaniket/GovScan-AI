// src/cli/add.js
// Manual "add URL/PDF" CLI command:
// Usage: node src/cli/add.js <url-or-pdf-path> [--no-alert]
//
// 1. Fetches/reads document
// 2. Checks eligibility via Gemini
// 3. Validates JSON schema
// 4. Stores in SQLite database (with dedup and corrigendum tracking)
// 5. Sends Telegram alert if post is Tier 1, 2, or Manual Review

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../core/config.js';
import { checkEligibility, getCounterStats } from '../core/gemini.js';
import { readDocument, downloadNotice } from '../core/pdf-handler.js';
import { parseAndValidate } from '../core/schema.js';
import { upsertJob, closeDB } from '../core/database.js';
import { sendJobAlerts } from '../core/telegram.js';
import { isOfficialDomain } from '../core/verify.js';

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
  const args = process.argv.slice(2);
  const noAlert = args.includes('--no-alert');
  const input = args.find(a => !a.startsWith('--'));

  if (!input) {
    console.error('Usage: node src/cli/add.js <url-or-file-path> [--no-alert]');
    console.error('\nExamples:');
    console.error('  node src/cli/add.js https://www.cdac.in/careers/PE_2026.pdf');
    console.error('  node src/cli/add.js ./data/notices/isro_scientist.pdf');
    process.exit(1);
  }

  const config = getConfig();

  if (!config.gemini.apiKey) {
    console.error('❌ ERROR: GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  printHeader('GovScan AI — Add Notification');

  const stats = getCounterStats(config.gemini.dailyLimit);
  console.log(`📊 Gemini API calls today: ${stats.calls}/${stats.limit} (${stats.remaining} remaining)`);

  const isUrl = input.startsWith('http://') || input.startsWith('https://');
  let filePath = input;
  let wasDownloaded = false;

  // 1. Download or verify file
  if (isUrl) {
    if (!isOfficialDomain(input)) {
      console.warn('⚠️  Warning: Domain does not match standard official/PSU list.');
      console.warn('   Proceeding as manual addition requested by user.');
    }

    printSection('Downloading notice');
    console.log(`🌐 URL: ${input}`);
    try {
      const dl = await downloadNotice(input, config.paths.notices);
      filePath = dl.filePath;
      wasDownloaded = true;
      console.log(`💾 Saved to: ${filePath}`);
    } catch (err) {
      console.error(`❌ Download failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    filePath = path.resolve(input);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
  }

  // 2. Read and classify document
  printSection('Reading document');
  const doc = await readDocument(filePath);
  console.log(`📄 Type: ${doc.type} | SHA-256: ${doc.hash.slice(0, 16)}...`);
  if (doc.pageCount) console.log(`📑 Pages: ${doc.pageCount}`);

  if (doc.isPasswordProtected) {
    console.error('❌ Document is password protected. Cannot auto-process.');
    process.exit(1);
  }

  // 3. Send to Gemini
  printSection('Analyzing eligibility via Gemini');
  let pdfBuffer = doc.type === 'pdf' ? doc.buffer : null;
  let textContent = doc.type !== 'pdf' ? doc.text : null;

  console.log('⏳ Evaluating against your profile...');
  const result = await checkEligibility({
    apiKey: config.gemini.apiKey,
    model: config.gemini.model,
    dailyLimit: config.gemini.dailyLimit,
    promptTemplate: config.promptTemplate,
    profileJson: config.profileJson,
    pdfBuffer,
    textContent,
    mimeType: doc.mimeType,
  });

  // 4. Validate schema
  printSection('Validating output');
  const { posts, errors, parseError } = parseAndValidate(result.raw);

  if (parseError) {
    console.error(`❌ Parse error: ${parseError}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.log('⚠️  Validation warnings:');
    errors.forEach(e => console.log(`   • ${e}`));
  }

  console.log(`✅ Extracted ${posts.length} post(s) successfully.`);

  // 5. Save to database
  printSection('Saving to database');
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const savedPosts = [];

  for (const post of posts) {
    const postRecord = {
      ...post,
      pdf_hash: doc.hash,
      gemini_model_used: result.modelUsed,
      tokens_used: result.tokensUsed,
      source_type: wasDownloaded ? 'manual_url' : 'manual_file',
      local_pdf_path: filePath,
      official_notification_url: isUrl ? input : post.official_notification_url,
    };

    const dbRes = await upsertJob(postRecord);
    if (dbRes.action === 'inserted') inserted++;
    else if (dbRes.action === 'updated') updated++;
    else unchanged++;

    if (dbRes.corrigendum) {
      console.log(`⚠️  Corrigendum detected for post: ${post.post_name}`);
    }

    savedPosts.push({ ...postRecord, db_action: dbRes.action, corrigendum: dbRes.corrigendum });
  }

  console.log(`💾 DB summary: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`);

  // 6. Alert via Telegram
  if (!noAlert) {
    printSection('Telegram Alerts');
    // Send alerts for inserted or corrigendum-updated jobs
    const toAlert = savedPosts.filter(p => p.db_action === 'inserted' || p.corrigendum);
    if (toAlert.length > 0) {
      const alertResults = await sendJobAlerts(toAlert);
      const sentCount = alertResults.filter(r => r.sent).length;
      console.log(`📱 ${sentCount} Telegram alert(s) sent.`);
    } else {
      console.log('ℹ️  No new or updated posts required an alert.');
    }
  }

  // Summary display
  printHeader('Summary of Posts Added');
  for (const p of savedPosts) {
    const tierEmoji = { 1: '🟢', 2: '🔵', 3: '🟡', 4: '🔴' }[p.tier] || '⚪';
    const statusEmoji = { 'Eligible': '✅', 'Not Eligible': '❌', 'Manual Review': '🔍' }[p.status] || '❓';
    console.log(`${tierEmoji} Tier ${p.tier} | ${statusEmoji} ${p.status} | ${p.organisation} — ${p.post_name} (${p.db_action})`);
  }

  closeDB();
}

main().catch(err => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
