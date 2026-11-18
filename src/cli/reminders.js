// src/cli/reminders.js
// Deadline reminder & weekly report runner:
// 1. Sends deadline alerts for deadlines in next 7 days and next 2 days
// 2. Marks expired jobs as 'missed'
// 3. Sends weekly report (every Sunday, or when --weekly flag is passed)

import {
  getUpcomingDeadlines,
  getMissedJobs,
  getUnreviewedManualReviewJobs,
  markMissedJobs,
  closeDB
} from '../core/database.js';
import {
  sendDeadlineReminder,
  sendWeeklyReport
} from '../core/telegram.js';

async function main() {
  const args = process.argv.slice(2);
  const forceWeekly = args.includes('--weekly');
  const today = new Date();
  const isSunday = today.getDay() === 0;

  console.log('⏰ GovScan AI — Deadline & Report Runner');
  console.log(`📅 Date: ${today.toISOString().slice(0, 10)} (${isSunday ? 'Sunday' : 'Weekday'})\n`);

  // 1. Check upcoming deadlines (next 7 days)
  console.log('🔍 Checking upcoming deadlines (next 7 days)...');
  const upcoming = await getUpcomingDeadlines(7);

  if (upcoming.length > 0) {
    console.log(`   Found ${upcoming.length} upcoming deadline(s). Sending Telegram reminder...`);
    await sendDeadlineReminder(upcoming);
    console.log('   ✅ Reminder sent.');
  } else {
    console.log('   ℹ️ No deadlines approaching in the next 7 days.');
  }

  // 2. Mark newly expired jobs as 'missed'
  const newlyMissedCount = await markMissedJobs();
  if (newlyMissedCount > 0) {
    console.log(`\n📋 Marked ${newlyMissedCount} newly expired job(s) as 'missed'.`);
  }

  // 3. Weekly Report (Sundays, or forced via --weekly)
  if (isSunday || forceWeekly) {
    console.log('\n📊 Generating Weekly Report...');
    const missed = await getMissedJobs();
    const unreviewed = await getUnreviewedManualReviewJobs();

    console.log(`   Missed jobs: ${missed.length}`);
    console.log(`   Unreviewed Manual Review jobs: ${unreviewed.length}`);

    await sendWeeklyReport(missed, unreviewed);
    console.log('   ✅ Weekly report sent to Telegram.');
  }

  closeDB();
}

main().catch(err => {
  console.error(`❌ Reminders error: ${err.message}`);
  process.exit(1);
});
