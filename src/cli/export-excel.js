// src/cli/export-excel.js
// Exports the entire database into a categorized multi-tab Excel spreadsheet (.xlsx):
// Tab 1: 🟢 Ready_To_Apply (Eligible + Deadline Open)
// Tab 2: 🔍 Manual_Review (Borderline / Equivalence check)
// Tab 3: ⏰ Expired_Deadlines (Past last_date)
// Tab 4: 📁 All_Jobs_Archive (Full history)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { queryJobs, getStats, closeDB, formatDateToDisplay } from '../core/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

function computeDaysLeft(isoDate) {
  if (!isoDate || isoDate === 'not stated') return null;
  try {
    const [yyyy, mm, dd] = isoDate.split('-').map(Number);
    const deadline = new Date(yyyy, mm - 1, dd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function formatJobForExcel(job) {
  const daysLeft = computeDaysLeft(job.last_date);
  let deadlineStatus = 'No Deadline';
  if (daysLeft !== null) {
    if (daysLeft < 0) deadlineStatus = `EXPIRED (${Math.abs(daysLeft)} days ago)`;
    else if (daysLeft === 0) deadlineStatus = 'CLOSING TODAY!';
    else if (daysLeft === 1) deadlineStatus = 'CLOSING TOMORROW!';
    else deadlineStatus = `${daysLeft} days remaining`;
  }

  const flagsStr = Array.isArray(job.flags) ? job.flags.join(', ') : (job.flags || '');

  return {
    'Post Name': job.post_name,
    'Organisation': job.organisation,
    'Tier': `Tier ${job.tier}`,
    'Eligibility Status': job.status,
    'Last Date': formatDateToDisplay(job.last_date) || 'Not Stated',
    'Deadline Urgency': deadlineStatus,
    'Pay / Stipend': job.pay || 'N/A',
    'Employment Type': job.employment_type || 'N/A',
    'Vacancies': job.vacancies_count || 'N/A',
    'Location': job.location || 'N/A',
    'Application Fee': job.fee || 'N/A',
    'Max Age (OBC)': job.max_age_for_my_category || 'N/A',
    'Age Cutoff Date': formatDateToDisplay(job.age_cutoff_date) || 'Not Stated',
    'Flags': flagsStr,
    'Essential Qualification (Clause)': job.qualification_clause || '',
    'AI Eligibility Reasoning': job.reasoning || '',
    'Official Notice URL': job.official_notification_url || '',
    'Apply URL': job.official_apply_url || '',
    'First Detected': job.date_first_detected || '',
  };
}

async function main() {
  console.log('📊 GovScan AI — Multi-Tab Excel Export\n');

  const allJobs = await queryJobs();
  if (allJobs.length === 0) {
    console.log('No jobs found in database to export.');
    closeDB();
    return;
  }

  // Split into categories
  const readyToApply = [];
  const manualReview = [];
  const expired = [];
  const allFormatted = [];

  for (const job of allJobs) {
    const formatted = formatJobForExcel(job);
    allFormatted.push(formatted);

    const daysLeft = computeDaysLeft(job.last_date);
    const isExpired = daysLeft !== null && daysLeft < 0;

    if (isExpired) {
      expired.push(formatted);
    } else {
      if (job.status === 'Eligible') {
        readyToApply.push(formatted);
      } else if (job.status === 'Manual Review') {
        manualReview.push(formatted);
      }
    }
  }

  // Create Workbook
  const wb = XLSX.utils.book_new();

  // Helper to set column widths nicely
  const colWidths = [
    { wch: 32 }, // Post Name
    { wch: 30 }, // Organisation
    { wch: 10 }, // Tier
    { wch: 16 }, // Status
    { wch: 14 }, // Last Date
    { wch: 20 }, // Urgency
    { wch: 25 }, // Pay
    { wch: 16 }, // Type
    { wch: 12 }, // Vacancies
    { wch: 16 }, // Location
    { wch: 16 }, // Fee
    { wch: 14 }, // Max Age
    { wch: 16 }, // Age Cutoff
    { wch: 24 }, // Flags
    { wch: 45 }, // Clause
    { wch: 55 }, // Reasoning
    { wch: 40 }, // Official URL
    { wch: 40 }, // Apply URL
    { wch: 14 }, // First Detected
  ];

  function addSheet(data, name) {
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ 'Status': 'No records in this category' }]);
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  // Add the 4 tabs in priority order
  addSheet(readyToApply, '1_Ready_To_Apply');
  addSheet(manualReview, '2_Manual_Review');
  addSheet(expired, '3_Expired_Deadlines');
  addSheet(allFormatted, '4_All_Jobs_Archive');

  const todayStr = new Date().toISOString().slice(0, 10);
  const exportDir = path.join(ROOT, 'data', 'exports');
  fs.mkdirSync(exportDir, { recursive: true });
  const filename = `GovScan_Job_Report_${todayStr}.xlsx`;
  const exportPath = path.join(exportDir, filename);

  XLSX.writeFile(wb, exportPath);

  console.log(`✅ Multi-Tab Excel Workbook generated successfully!`);
  console.log(`📂 Location: ${exportPath}`);
  console.log(`\n📋 Sheet Breakdown:`);
  console.log(`   🟢 1_Ready_To_Apply:    ${readyToApply.length} job(s)`);
  console.log(`   🔍 2_Manual_Review:     ${manualReview.length} job(s)`);
  console.log(`   ⏰ 3_Expired_Deadlines: ${expired.length} job(s)`);
  console.log(`   📁 4_All_Jobs_Archive:  ${allFormatted.length} total job(s)`);

  closeDB();
  return exportPath;
}

main().catch(err => {
  console.error(`❌ Export error: ${err.message}`);
  process.exit(1);
});
