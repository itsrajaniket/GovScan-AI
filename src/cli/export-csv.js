// src/cli/export-csv.js
// CLI command: node src/cli/export-csv.js [--tier 1,2] [--status Eligible] [--output file.csv]
// Exports the jobs database to CSV.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDB, queryJobs, getStats, closeDB } from '../core/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(args) {
  const opts = { tier: null, status: null, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tier' && args[i + 1]) {
      opts.tier = args[i + 1].split(',').map(Number);
      i++;
    } else if (args[i] === '--status' && args[i + 1]) {
      opts.status = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      opts.output = args[i + 1];
      i++;
    }
  }
  return opts;
}

function toCsvRow(values) {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(',');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('📊 GovScan AI — CSV Export\n');

  // Build filters
  const filters = {};
  if (opts.tier) filters.tiers = opts.tier;
  if (opts.status) filters.status = opts.status;

  const jobs = await queryJobs(filters);

  if (jobs.length === 0) {
    console.log('No jobs found matching the filters.');
    closeDB();
    return;
  }

  // Define CSV columns
  const columns = [
    'id', 'tier', 'status', 'organisation', 'post_name',
    'advertisement_no', 'post_code', 'employment_type',
    'vacancies_count', 'pay', 'location', 'fee',
    'last_date', 'age_cutoff_date', 'max_age_for_my_category',
    'qualification_clause', 'flags', 'reasoning',
    'application_status', 'notes',
    'official_notification_url', 'official_apply_url',
    'date_first_detected', 'last_verified',
    'pdf_hash', 'gemini_model_used', 'tokens_used',
  ];

  const header = toCsvRow(columns);
  const rows = jobs.map(job => toCsvRow(columns.map(col => {
    const val = job[col];
    if (Array.isArray(val)) return val.join('; ');
    return val;
  })));

  const csv = [header, ...rows].join('\n');

  // Output
  const defaultFile = path.join(
    __dirname, '..', '..', 'data', 'exports',
    `govscan_export_${new Date().toISOString().slice(0, 10)}.csv`
  );
  const outputPath = opts.output ? path.resolve(opts.output) : defaultFile;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`✅ Exported ${jobs.length} jobs to: ${outputPath}`);

  // Show summary
  const stats = await getStats();
  console.log(`\n📊 Database stats:`);
  console.log(`   Total jobs: ${stats.total}`);
  console.log(`   By tier: ${JSON.stringify(stats.byTier)}`);
  console.log(`   By status: ${JSON.stringify(stats.byStatus)}`);

  closeDB();
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
