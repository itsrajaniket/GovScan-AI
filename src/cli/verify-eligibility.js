// src/cli/verify-eligibility.js
// 2-Pass Eligibility Re-Verification & Rescue Audit
// Audits all jobs classified as "Not Eligible" to ensure zero false negatives.
// Pass 1: Checks for M.Sc/B.Sc Physics/Electronics equivalence, desirable experience, and OBC-NCL age relaxation.
// Pass 2: Promotes any disputed or borderline jobs to "Manual Review" with specific review flags.

import { getDB, queryJobs, save, closeDB } from '../core/database.js';

const RESCUE_KEYWORDS = [
  'electronics', 'physics', 'telecommunication', 'tele-comm',
  'pgdca', 'mca', 'computer applications', 'computer science',
  'instrumentation', 'graduate in science', 'post graduate in science',
  'air traffic control'
];

async function main() {
  console.log('🔍 GovScan AI — 2-Pass Eligibility Re-Verification Audit\n');
  const db = await getDB();
  const jobs = await queryJobs();

  let rescuedCount = 0;
  let confirmedUnrelatedCount = 0;
  const rescuedJobs = [];

  for (const job of jobs) {
    if (job.status !== 'Not Eligible') continue;

    // CRITICAL: Evaluate ONLY the official notice text (post_name and qualification_clause).
    // NEVER search inside reasoning, as reasoning often explains why candidate's degree is rejected!
    const noticeText = `${job.post_name || ''} ${job.qualification_clause || ''}`.toLowerCase();
    const reasonText = (job.reasoning || '').toLowerCase();

    // ── Disqualifier Gate ──
    const isDisqualified =
      noticeText.includes('b.ed') ||
      noticeText.includes('d.el.ed') ||
      noticeText.includes('elementary education') ||
      noticeText.includes('primary teacher') ||
      noticeText.includes('prt') ||
      (noticeText.includes('tgt') && !noticeText.includes('pgt physics')) ||
      noticeText.includes('mbbs') ||
      noticeText.includes('llb') ||
      noticeText.includes('b.sc. (chemistry)') ||
      noticeText.includes('b.sc. in biological science') ||
      noticeText.includes('b.sc chemistry') ||
      (noticeText.includes('chemistry') && !noticeText.includes('physics') && !noticeText.includes('electronics')) ||
      noticeText.includes('civil judge') ||
      noticeText.includes('fire service') ||
      noticeText.includes('fireman') ||
      noticeText.includes('cook') ||
      noticeText.includes('driver') ||
      noticeText.includes('welder') ||
      noticeText.includes('fitter') ||
      noticeText.includes('catering') ||
      noticeText.includes('co-pilot') ||
      noticeText.includes('coconut development') ||
      (noticeText.includes('mechanical') && !noticeText.includes('electronics')) ||
      (noticeText.includes('civil') && !noticeText.includes('electronics'));

    if (isDisqualified) {
      confirmedUnrelatedCount++;
      continue;
    }

    let shouldRescue = false;
    let rescueReason = '';

    // ── Check 1: Education Subject Mentioned in Notice ──
    for (const kw of RESCUE_KEYWORDS) {
      if (noticeText.includes(kw)) {
        shouldRescue = true;
        rescueReason = `Matched keyword "${kw}" directly in post name or qualification clause`;
        break;
      }
    }

    // ── Check 2: Experience was Desirable / Not Essential ──
    if (!shouldRescue && (noticeText.includes('desirable') || noticeText.includes('preferred')) && noticeText.includes('experience')) {
      if (!noticeText.includes('mandatory experience') && !noticeText.includes('essential experience')) {
        shouldRescue = true;
        rescueReason = 'Experience is marked desirable/preferred rather than strictly essential';
      }
    }

    // ── Check 3: Age Relaxation Check (OBC-NCL +3 Years) ──
    // Candidate age is 27 (born 23-03-1999).
    // ONLY rescue if the post is in a relevant technical field and age was the blocker
    if (!shouldRescue && job.max_age_for_my_category) {
      if (27 <= job.max_age_for_my_category) {
        if (reasonText.includes('age') && (reasonText.includes('exceed') || reasonText.includes('overage'))) {
          const isTech = ['electronics', 'physics', 'computer', 'telecom', 'scientist', 'engineer', 'assistant'].some(kw => noticeText.includes(kw));
          if (isTech) {
            shouldRescue = true;
            rescueReason = `Candidate (age 27) is within OBC-NCL relaxed age limit (${job.max_age_for_my_category})`;
          }
        }
      }
    }

    // ── Check 4: Technical Assistance / Scientific Assistant in Electronics/Physics Labs ──
    if (!shouldRescue) {
      const postLower = (job.post_name || '').toLowerCase();
      if ((postLower.includes('scientific assistant') || postLower.includes('technical assistant')) && 
          (noticeText.includes('physics') || noticeText.includes('electronics') || noticeText.includes('computer'))) {
        shouldRescue = true;
        rescueReason = 'Technical/Scientific assistant post in relevant discipline requires manual review';
      }
    }

    if (shouldRescue) {
      rescuedCount++;
      rescuedJobs.push({
        id: job.id,
        post: job.post_name,
        org: job.organisation,
        reason: rescueReason,
      });

      // Update in DB: Promote to Manual Review with Tier 2
      const newTier = (job.tier === 4 || !job.tier) ? 2 : job.tier;
      const updatedReasoning = `[2-Pass Rescue Audit]: Promoted to Manual Review. Reason: ${rescueReason}. Original AI Note: ${job.reasoning || 'N/A'}`;
      db.run(
        `UPDATE jobs SET status = 'Manual Review', tier = ?, reasoning = ? WHERE id = ?`,
        [newTier, updatedReasoning, job.id]
      );
    } else {
      confirmedUnrelatedCount++;
    }
  }

  if (rescuedCount > 0) {
    save();
    console.log(`✨ Successfully rescued ${rescuedCount} job(s) from "Not Eligible" into "Manual Review"!`);
    console.log('\nSample Rescued Jobs:');
    rescuedJobs.slice(0, 8).forEach(r => {
      console.log(`   • [ID ${r.id}] ${r.post.slice(0, 48)} (${r.org.slice(0, 30)})`);
      console.log(`     ↳ Reason: ${r.reason}`);
    });
  } else {
    console.log('✔️ All "Not Eligible" jobs verified as genuinely unrelated.');
  }

  console.log(`\n📊 2-Pass Eligibility Audit Summary:`);
  console.log(`   🛡️ Rescued & Promoted to Manual Review:  ${rescuedCount}`);
  console.log(`   ❌ Confirmed Not Eligible (Unrelated):    ${confirmedUnrelatedCount}`);
  console.log(`   📁 Total Evaluated:                     ${rescuedCount + confirmedUnrelatedCount}`);

  closeDB();
}

main().catch(err => {
  console.error('Audit fatal error:', err);
});
