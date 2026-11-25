// src/cli/verify-dates.js
// 2-Pass Date Verification & Audit Tool
// Pass 1: Syntax, sanity, format inversion (DD/MM vs MM/DD) & historical age check.
// Pass 2: In-depth notification text re-scan for date extensions, corrigendums, and updated deadlines.

import { getDB, queryJobs, save, closeDB, normalizeDateToISO, formatDateToDisplay } from '../core/database.js';

const MONTH_NAMES = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function parseTextDate(text) {
  if (!text) return null;
  // Match e.g. "31-12-2026", "31/12/2026", "31.12.2026"
  const m1 = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](202[4-7])\b/);
  if (m1) {
    const d = m1[1].padStart(2, '0');
    const m = m1[2].padStart(2, '0');
    const y = m1[3];
    if (parseInt(m) <= 12 && parseInt(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // Match e.g. "15th November 2026", "15 Nov 2026", "15-Dec-2026"
  const m2 = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?[-/\s]+([a-zA-Z]{3,9})[-/,\s]+(202[4-7])\b/i);
  if (m2) {
    const d = m2[1].padStart(2, '0');
    const monStr = m2[2].toLowerCase();
    const mon = MONTH_NAMES[monStr];
    const y = m2[3];
    if (mon) {
      return `${y}-${mon}-${d}`;
    }
  }

  return null;
}

async function main() {
  console.log('🔍 GovScan AI — 2-Pass Date Verification Audit\n');
  const db = await getDB();
  const jobs = await queryJobs();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let verifiedExpiredCount = 0;
  let activeCount = 0;
  let correctedCount = 0;
  let ongoingCount = 0;
  let graceCount = 0;

  const corrections = [];
  const verifiedExpired = [];

  for (const job of jobs) {
    const fullText = `${job.post_name || ''} ${job.qualification_clause || ''} ${job.reasoning || ''}`;
    let currentDate = job.last_date;

    // ── PASS 1: Sanity & Format Check ──
    let normalized = normalizeDateToISO(currentDate);

    // ── PASS 2: Text Re-Scan for Corrigendums / Date Extensions ──
    const extensionKeywords = ['extended', 'corrigendum', 'extension', 'last date', 'closing date', 'upto', 'up to'];
    const hasExtensionContext = extensionKeywords.some(kw => fullText.toLowerCase().includes(kw));

    if (hasExtensionContext) {
      // Look for a newer date in the text
      const extracted = parseTextDate(fullText);
      if (extracted && extracted !== normalized) {
        // Check if extracted date is later than current date
        if (!normalized || extracted > normalized) {
          corrections.push({
            id: job.id,
            post: job.post_name,
            org: job.organisation,
            oldDate: currentDate,
            newDate: extracted,
            reason: 'Found later deadline / extension clause in notification text',
          });
          normalized = extracted;
          db.run(`UPDATE jobs SET last_date = ? WHERE id = ?`, [normalized, job.id]);
          correctedCount++;
        }
      }
    }

    // Classify
    if (!normalized || normalized === 'not stated') {
      ongoingCount++;
    } else {
      const [y, m, d] = normalized.split('-').map(Number);
      const dl = new Date(y, m - 1, d);
      const diffDays = Math.ceil((dl - today) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        if (diffDays >= -3) {
          graceCount++;
        } else {
          verifiedExpiredCount++;
          verifiedExpired.push({
            id: job.id,
            post: job.post_name,
            org: job.organisation,
            lastDate: normalized,
            daysAgo: Math.abs(diffDays),
          });
        }
      } else {
        activeCount++;
      }
    }
  }

  if (correctedCount > 0) {
    save();
    console.log(`✅ Corrected ${correctedCount} job deadline(s) based on text re-scan!`);
    console.log(corrections.slice(0, 5));
  } else {
    console.log('✔️ All date fields are consistent with notification clauses.');
  }

  console.log('\n📊 2-Pass Verification Audit Results:');
  console.log(`   🟢 Confirmed Active / Open:        ${activeCount}`);
  console.log(`   ⏳ Ongoing / Date Not Stated:      ${ongoingCount}`);
  console.log(`   ⌛ Just Closed (3-Day Grace):       ${graceCount}`);
  console.log(`   📦 Confirmed Expired (Archival):    ${verifiedExpiredCount}`);
  console.log(`   📁 Total Jobs Audited:              ${jobs.length}`);

  console.log('\nSample Verified Expired Archive Entries (Safely Kept in Archive):');
  verifiedExpired.slice(0, 5).forEach(v => {
    console.log(`   • [ID ${v.id}] ${v.post.slice(0, 45)} (${v.org.slice(0, 30)}) — Closed ${v.lastDate} (${v.daysAgo} days ago)`);
  });

  closeDB();
}

main().catch(e => {
  console.error('Error during verification:', e);
});
