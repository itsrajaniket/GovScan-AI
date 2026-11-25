// scripts/cleanup-database.js
import { getDB, queryJobs, save, closeDB } from '../src/core/database.js';

async function cleanup() {
  console.log('🧹 GovScan AI — Database Remediation & Health Restoration\n');
  const db = await getDB();
  const jobs = await queryJobs();

  console.log(`Starting with ${jobs.length} jobs in database.`);

  // ── 1. Revert False Rescues from 2-Pass Audit ──
  let revertedCount = 0;
  let validRescuesCount = 0;

  for (const j of jobs) {
    if ((j.reasoning || '').includes('[2-Pass Rescue Audit]')) {
      const noticeText = [j.post_name, j.qualification_clause].join(' ').toLowerCase();
      const hasNoticeMatch = ['electronics', 'physics', 'computer', 'telecom', 'tele-comm', 'instrumentation', 'pgdca', 'mca'].some(kw => noticeText.includes(kw));

      // Disqualifiers that make the candidate 100% ineligible
      const isDisqualified =
        noticeText.includes('b.ed') ||
        noticeText.includes('d.el.ed') ||
        noticeText.includes('mbbs') ||
        noticeText.includes('llb') ||
        noticeText.includes('b.sc. (chemistry)') ||
        noticeText.includes('b.sc. in biological science') ||
        noticeText.includes('b.sc chemistry') ||
        noticeText.includes('chemistry') && !noticeText.includes('physics') && !noticeText.includes('electronics') ||
        noticeText.includes('civil judge') ||
        noticeText.includes('fire service') ||
        noticeText.includes('co-pilot') ||
        (noticeText.includes('mechanical') && !noticeText.includes('electronics')) ||
        (noticeText.includes('civil') && !noticeText.includes('electronics'));

      if (!hasNoticeMatch || isDisqualified) {
        revertedCount++;
        // Restore clean original AI reasoning
        let originalReason = j.reasoning;
        if (originalReason.includes('Original AI Note: ')) {
          originalReason = originalReason.split('Original AI Note: ')[1];
        }
        db.run(
          `UPDATE jobs SET status = 'Not Eligible', tier = 4, reasoning = ? WHERE id = ?`,
          [originalReason, j.id]
        );
      } else {
        validRescuesCount++;
      }
    }
  }

  console.log(`✅ Reverted ${revertedCount} false rescues back to 'Not Eligible' (Tier 4).`);
  console.log(`🛡️ Retained ${validRescuesCount} genuine matches in 'Manual Review' (Tier 2).`);

  // ── 2. Tag Stale Historical Archive Notices ──
  let archivedCount = 0;
  for (const j of jobs) {
    if (!j.last_date) {
      const text = [j.post_name, j.advertisement_no, j.official_notification_url].join(' ');
      const match = text.match(/\b(201[0-9]|202[0-5])\b/g);
      if (match && match.length > 0) {
        const years = match.map(Number);
        const maxYear = Math.max(...years);
        if (maxYear < 2026) {
          archivedCount++;
          const estimatedPastDate = `${maxYear}-12-31`;
          const updatedReason = `[Historical Notice: Year ${maxYear}] ${j.reasoning || ''}`;
          db.run(
            `UPDATE jobs SET last_date = ?, reasoning = ? WHERE id = ?`,
            [estimatedPastDate, updatedReason, j.id]
          );
        }
      }
    }
  }

  console.log(`📦 Tagged ${archivedCount} historical notices (years 2012–2025) with past deadlines to move them into Archive.`);

  // ── 3. Remove Duplicate Jobs ──
  const map = {};
  const duplicateIds = [];

  for (const j of jobs) {
    const k = (j.organisation + '||' + j.post_name + '||' + (j.advertisement_no || '')).toLowerCase().trim();
    if (map[k]) {
      duplicateIds.push(j.id);
    } else {
      map[k] = j.id;
    }
  }

  if (duplicateIds.length > 0) {
    for (const id of duplicateIds) {
      db.run(`DELETE FROM jobs WHERE id = ?`, [id]);
      db.run(`DELETE FROM corrigenda WHERE job_id = ?`, [id]);
    }
    console.log(`🗑️ Removed ${duplicateIds.length} duplicate job record(s).`);
  }

  save();

  // Summary
  const updatedJobs = await queryJobs();
  const summary = updatedJobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    const isPast = j.last_date && j.last_date < '2026-11-25';
    if (!isPast) {
      acc['live_' + j.status] = (acc['live_' + j.status] || 0) + 1;
    } else {
      acc['expired'] = (acc['expired'] || 0) + 1;
    }
    return acc;
  }, {});

  console.log('\n📊 Cleaned Database Summary:');
  console.log(`   Total Unique Jobs: ${updatedJobs.length}`);
  console.log(`   🟢 Live Eligible: ${summary['live_Eligible'] || 0}`);
  console.log(`   🔍 Live Manual Review: ${summary['live_Manual Review'] || 0}`);
  console.log(`   🎯 Total Actionable Live: ${(summary['live_Eligible'] || 0) + (summary['live_Manual Review'] || 0)}`);
  console.log(`   ❌ Live Not Eligible (in drawer): ${summary['live_Not Eligible'] || 0}`);
  console.log(`   📦 Past Deadlines Archive: ${summary['expired'] || 0}`);

  closeDB();
}

cleanup().catch(console.error);
