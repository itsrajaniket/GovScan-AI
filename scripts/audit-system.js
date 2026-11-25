import { getDB, closeDB } from '../src/core/database.js';
import fs from 'fs';
import path from 'path';

async function audit() {
  console.log('====================================================');
  console.log('🔍 GOVSCAN AI — COMPREHENSIVE SYSTEM & DB AUDIT');
  console.log('====================================================\n');

  const db = await getDB();

  // 1. Database Integrity
  const integrity = db.exec('PRAGMA integrity_check;');
  console.log(`1. SQLite Integrity Check: ${integrity[0].values[0][0]}`);

  // 2. Total Records and Status Breakdown
  const total = db.exec('SELECT COUNT(*) FROM jobs;')[0].values[0][0];
  console.log(`2. Total Job Records: ${total}`);

  const statusRows = db.exec('SELECT status, COUNT(*) FROM jobs GROUP BY status;')[0].values;
  console.log('   Status Breakdown:');
  for (const [st, cnt] of statusRows) {
    console.log(`     • ${st.padEnd(16)}: ${cnt}`);
  }

  // 3. Tier Breakdown
  const tierRows = db.exec('SELECT tier, COUNT(*) FROM jobs GROUP BY tier ORDER BY tier ASC;')[0].values;
  console.log('\n3. Tier Breakdown:');
  for (const [tr, cnt] of tierRows) {
    console.log(`     • Tier ${tr}          : ${cnt}`);
  }

  // 4. Active vs Expired vs Archived
  const today = new Date().toISOString().slice(0, 10);
  const activeUnexpired = db.exec(`SELECT COUNT(*) FROM jobs WHERE (last_date >= '${today}' OR last_date IS NULL);`)[0].values[0][0];
  const expiredPast = db.exec(`SELECT COUNT(*) FROM jobs WHERE last_date < '${today}';`)[0].values[0][0];
  console.log(`\n4. Timeline Breakdown:`);
  console.log(`     • Live / Unexpired (or TBD) : ${activeUnexpired}`);
  console.log(`     • Past Deadline (Archive)   : ${expiredPast}`);

  // 5. Check if any Tier 4 jobs have status != 'Not Eligible'
  const malformedTier4 = db.exec("SELECT COUNT(*) FROM jobs WHERE tier = 4 AND status != 'Not Eligible';")[0].values[0][0];
  console.log(`\n5. Schema Invariant Check (Tier 4 must be Not Eligible):`);
  if (malformedTier4 === 0) {
    console.log(`     ✅ PASS: All Tier 4 jobs are strictly marked 'Not Eligible'.`);
  } else {
    console.log(`     ⚠️ WARN: ${malformedTier4} Tier 4 jobs do not have status 'Not Eligible'.`);
  }

  // 6. Check Active Eligible / Manual Review count (Actionable for Candidate)
  const actionable = db.exec(`SELECT COUNT(*) FROM jobs WHERE status IN ('Eligible', 'Manual Review') AND (last_date >= '${today}' OR last_date IS NULL);`)[0].values[0][0];
  console.log(`\n6. Actionable Live Opportunities for Candidate (Tier 1-3, Unexpired): ${actionable}`);

  // 7. Check Source Health Table
  const healthRows = db.exec('SELECT source_id, source_name, is_healthy, last_checked, last_found_items FROM source_health;');
  console.log(`\n7. Monitored Sources in Health Table: ${healthRows.length && healthRows[0].values.length ? healthRows[0].values.length : 0}`);
  if (healthRows.length && healthRows[0].values.length) {
    for (const [id, name, healthy, checked, found] of healthRows[0].values.slice(0, 8)) {
      console.log(`     • [${healthy ? 'HEALTHY' : 'UNHEALTHY'}] ${name} (${id}) - last found: ${found} items`);
    }
  }

  // 8. Verify Files and Exports
  console.log(`\n8. File System & Dashboard Assets:`);
  const docsIndex = path.resolve('docs/index.html');
  const dataDash = path.resolve('data/dashboard.html');
  console.log(`     • docs/index.html exists   : ${fs.existsSync(docsIndex)} (${fs.existsSync(docsIndex) ? fs.statSync(docsIndex).size + ' bytes' : 'N/A'})`);
  console.log(`     • data/dashboard.html exists: ${fs.existsSync(dataDash)} (${fs.existsSync(dataDash) ? fs.statSync(dataDash).size + ' bytes' : 'N/A'})`);

  closeDB();
  console.log('\n====================================================');
  console.log('✅ AUDIT COMPLETE');
  console.log('====================================================');
}

audit().catch(console.error);
