// src/cli/check.js
// CLI command: node src/cli/check.js <pdf-path-or-url> [--save] [--alert]
// Sends one notice to Gemini, prints validated JSON.
// --save: also saves results to the database
// --alert: also sends Telegram alerts for eligible/manual-review posts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../core/config.js';
import { checkEligibility, getCounterStats } from '../core/gemini.js';
import { readDocument, downloadNotice } from '../core/pdf-handler.js';
import { parseAndValidate } from '../core/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────

function printHeader(title) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function printSection(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 54 - title.length))}`);
}

function isURL(str) {
  return str.startsWith('http://') || str.startsWith('https://');
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flagSave = args.includes('--save');
  const flagAlert = args.includes('--alert');
  const input = args.find(a => !a.startsWith('--'));

  if (!input) {
    console.error('Usage: node src/cli/check.js <pdf-path-or-url> [--save] [--alert]');
    console.error('');
    console.error('Options:');
    console.error('  --save   Save results to the database');
    console.error('  --alert  Send Telegram alerts for Tier 1/2 and Manual Review posts');
    console.error('');
    console.error('Examples:');
    console.error('  node src/cli/check.js ./data/notices/cdac-notification.pdf');
    console.error('  node src/cli/check.js https://www.cdac.in/some-notification.pdf --save --alert');
    process.exit(1);
  }

  const config = getConfig();

  // Validate API key
  if (!config.gemini.apiKey) {
    console.error('ERROR: GEMINI_API_KEY not set in .env file.');
    console.error('Get your key at https://aistudio.google.com/apikey');
    process.exit(1);
  }

  printHeader('GovScan AI — Eligibility Check');

  // Show API counter
  const stats = getCounterStats(config.gemini.dailyLimit);
  console.log(`📊 API calls today: ${stats.calls}/${stats.limit} (${stats.remaining} remaining)`);
  console.log(`🤖 Model: ${config.gemini.model}`);

  // ── Step 1: Get the document ──

  let filePath;
  let wasDownloaded = false;

  if (isURL(input)) {
    printSection('Downloading from URL');
    console.log(`🌐 URL: ${input}`);
    try {
      const dl = await downloadNotice(input, config.paths.notices);
      filePath = dl.filePath;
      wasDownloaded = true;
      console.log(`💾 Saved to: ${dl.filePath}`);
      console.log(`📦 Size: ${(dl.size / 1024).toFixed(1)} KB | Type: ${dl.contentType}`);
    } catch (err) {
      console.error(`\n❌ Failed to download: ${err.message}`);
      if (err.message.includes('CAPTCHA') || err.message.includes('403')) {
        console.error('⚠️  This site may require CAPTCHA or login. Download the file manually and run:');
        console.error(`   node src/cli/check.js <path-to-downloaded-file>`);
      }
      process.exit(1);
    }
  } else {
    filePath = path.resolve(input);
    if (!fs.existsSync(filePath)) {
      console.error(`\n❌ File not found: ${filePath}`);
      process.exit(1);
    }
  }

  // ── Step 2: Read and classify the document ──

  printSection('Reading document');
  console.log(`📄 File: ${path.basename(filePath)}`);

  const doc = await readDocument(filePath);

  console.log(`📋 Type: ${doc.type} | MIME: ${doc.mimeType}`);
  console.log(`🔑 SHA-256: ${doc.hash.slice(0, 16)}...`);

  if (doc.pageCount) console.log(`📑 Pages: ${doc.pageCount}`);
  if (doc.isScanned) console.log(`🖼️  Scanned/image PDF detected — sending via Gemini vision`);

  if (doc.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    doc.warnings.forEach(w => console.log(`   • ${w}`));
  }

  // Handle blockers
  if (doc.isPasswordProtected) {
    console.error('\n❌ PDF is password-protected. Cannot process automatically.');
    console.error('   Please unlock the PDF and try again.');
    process.exit(1);
  }

  if (doc.isTooLarge) {
    console.log(`\n⚠️  PDF is very large (${doc.pageCount} pages). Sending anyway — Gemini has a large context window.`);
    console.log('   If this fails, the notification will be flagged for manual review.');
  }

  // ── Step 3: Send to Gemini ──

  printSection('Sending to Gemini for eligibility check');

  // Decide what to send: PDF buffer (for PDFs) or text (for everything else)
  let pdfBuffer = null;
  let textContent = null;
  let mimeType = doc.mimeType;

  if (doc.type === 'pdf') {
    // Always send PDF as buffer — Gemini handles both text and scanned PDFs
    pdfBuffer = doc.buffer;
  } else {
    // For DOCX, HTML, text — send extracted text
    textContent = doc.text;
    if (!textContent || textContent.trim().length < 20) {
      console.error('\n❌ Could not extract sufficient text from the document.');
      process.exit(1);
    }
    console.log(`📝 Extracted ${textContent.length} characters of text.`);
  }

  let rawResponse;
  let tokensUsed;
  let modelUsed;
  let retryCount = 0;
  const maxRetries = 3; // Retry up to 3 times for transient errors (503, rate limits)

  while (retryCount <= maxRetries) {
    try {
      if (retryCount > 0) console.log(`\n🔄 Retry ${retryCount}/${maxRetries}...`);
      console.log('⏳ Waiting for Gemini response...');

      const result = await checkEligibility({
        apiKey: config.gemini.apiKey,
        model: config.gemini.model,
        dailyLimit: config.gemini.dailyLimit,
        promptTemplate: config.promptTemplate,
        profileJson: config.profileJson,
        pdfBuffer,
        textContent,
        mimeType,
      });

      rawResponse = result.raw;
      tokensUsed = result.tokensUsed;
      modelUsed = result.modelUsed;
      break; // Success
    } catch (err) {
      const isTransient = err.message.includes('503') || err.message.includes('429')
        || err.message.includes('overloaded') || err.message.includes('high demand');
      retryCount++;
      if (retryCount > maxRetries) {
        console.error(`\n❌ Gemini API error after ${maxRetries + 1} attempts: ${err.message}`);
        process.exit(1);
      }
      const delay = isTransient ? retryCount * 10 : 5; // Back off longer for 503/429
      console.log(`\n⚠️  Error: ${err.message}`);
      console.log(`   Retrying in ${delay} seconds...`);
      await new Promise(r => setTimeout(r, delay * 1000));
    }
  }

  // ── Step 4: Parse and validate ──

  printSection('Parsing and validating response');
  console.log(`📊 Tokens used: ${tokensUsed} | Model: ${modelUsed}`);

  const updatedStats = getCounterStats(config.gemini.dailyLimit);
  console.log(`📊 API calls today: ${updatedStats.calls}/${updatedStats.limit}`);

  const { posts, errors, parseError } = parseAndValidate(rawResponse);

  if (parseError) {
    console.error(`\n❌ Parse error: ${parseError}`);
    printSection('Raw Gemini Response');
    console.log(rawResponse);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.log('\n⚠️  Validation warnings:');
    errors.forEach(e => console.log(`   • ${e}`));
  }

  // ── Step 5: Display results ──

  printHeader(`Results: ${posts.length} post(s) found`);

  for (const post of posts) {
    const tierEmoji = { 1: '🟢', 2: '🔵', 3: '🟡', 4: '🔴' }[post.tier] || '⚪';
    const statusEmoji = {
      'Eligible': '✅',
      'Not Eligible': '❌',
      'Manual Review': '🔍',
    }[post.status] || '❓';

    console.log(`\n${tierEmoji} TIER ${post.tier} — ${statusEmoji} ${post.status}`);
    console.log('━'.repeat(50));
    console.log(`📋 ${post.organisation} | ${post.post_name}`);
    if (post.advertisement_no) console.log(`📌 Advt: ${post.advertisement_no}${post.post_code ? ` | Post: ${post.post_code}` : ''}`);
    if (post.employment_type) console.log(`💼 Type: ${post.employment_type}`);
    if (post.pay) console.log(`💰 Pay: ${post.pay}`);
    if (post.location) console.log(`📍 Location: ${post.location}`);
    if (post.vacancies_count) console.log(`👥 Vacancies: ${post.vacancies_count}`);
    if (post.fee) console.log(`💳 Fee: ${post.fee}`);
    if (post.last_date) {
      const daysLeft = computeDaysLeft(post.last_date);
      const daysStr = daysLeft !== null
        ? (daysLeft > 0 ? `(${daysLeft} days left)` : daysLeft === 0 ? '(TODAY!)' : '(EXPIRED)')
        : '';
      console.log(`⏰ Last Date: ${post.last_date} ${daysStr}`);
    }
    if (post.age_cutoff_date) console.log(`🎂 Age Cut-off: ${post.age_cutoff_date} | Max age (OBC): ${post.max_age_for_my_category || 'not stated'}`);
    if (post.flags && post.flags.length > 0) console.log(`⚠️  Flags: ${post.flags.join(', ')}`);
    if (post.qualification_clause) {
      console.log(`📖 Qualification: "${post.qualification_clause.slice(0, 200)}${post.qualification_clause.length > 200 ? '...' : ''}"`);
      if (post.page_number) console.log(`   (Page ${post.page_number})`);
    }
    if (post.reasoning) console.log(`💡 Reasoning: ${post.reasoning.slice(0, 300)}${post.reasoning.length > 300 ? '...' : ''}`);
    if (post.official_notification_url) console.log(`🔗 Official: ${post.official_notification_url}`);
  }

  // ── Summary ──

  printSection('Summary');
  const tierCounts = {};
  const statusCounts = {};
  for (const p of posts) {
    tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1;
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  }
  console.log(`Total posts: ${posts.length}`);
  console.log(`By tier: ${JSON.stringify(tierCounts)}`);
  console.log(`By status: ${JSON.stringify(statusCounts)}`);
  console.log(`\n📊 Tokens used: ${tokensUsed} | Model: ${modelUsed}`);

  // Output full JSON
  printSection('Full JSON output');
  const output = posts.map(p => ({
    ...p,
    _meta: {
      pdf_hash: doc.hash,
      gemini_model_used: modelUsed,
      tokens_used: tokensUsed,
      source_file: path.basename(filePath),
      checked_at: new Date().toISOString(),
    },
  }));
  console.log(JSON.stringify(output, null, 2));

  // ── Step 6 (optional): Save to database ──

  if (flagSave) {
    printSection('Saving to database');
    const { upsertJob, closeDB } = await import('../core/database.js');
    let inserted = 0, updated = 0, unchanged = 0;
    for (const p of output) {
      const result = await upsertJob({
        ...p,
        pdf_hash: doc.hash,
        gemini_model_used: modelUsed,
        tokens_used: tokensUsed,
        source_type: wasDownloaded ? 'manual_url' : 'manual_file',
        local_pdf_path: filePath,
      });
      if (result.action === 'inserted') inserted++;
      else if (result.action === 'updated') updated++;
      else unchanged++;
      if (result.corrigendum) console.log(`⚠️  Corrigendum detected for: ${p.post_name}`);
    }
    console.log(`💾 Database: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged`);
    closeDB();
  }

  // ── Step 7 (optional): Send Telegram alerts ──

  if (flagAlert) {
    printSection('Sending Telegram alerts');
    const { sendJobAlerts } = await import('../core/telegram.js');
    const results = await sendJobAlerts(output);
    const sent = results.filter(r => r.sent).length;
    const skipped = output.length - results.length;
    console.log(`📱 Telegram: ${sent} alerts sent, ${skipped} skipped (tier/status rules)`);
    for (const r of results) {
      if (!r.sent) console.log(`   ⚠️  Failed: ${r.post} — ${r.error}`);
    }
  }
}

function computeDaysLeft(dateStr) {
  if (!dateStr || dateStr === 'not stated') return null;
  try {
    let yyyy, mm, dd;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-').map(Number);
      if (parts[0] > 1000) {
        // YYYY-MM-DD
        [yyyy, mm, dd] = parts;
      } else {
        // DD-MM-YYYY
        [dd, mm, yyyy] = parts;
      }
    } else {
      return null;
    }
    const deadline = new Date(yyyy, mm - 1, dd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

// Run
main().catch(err => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
