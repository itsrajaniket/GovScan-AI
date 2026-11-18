// src/cli/daily-run.js
// Daily Master Pipeline:
// Intended to be triggered daily via Windows Task Scheduler (e.g. at 8:30 AM).
//
// Pipeline Steps:
// 1. Logging setup (logs/daily_YYYY-MM-DD.log)
// 2. Mark expired jobs & run deadline reminders (7d/2d + Sunday weekly report)
// 3. Source health audit (alert if any watcher or feed silent >= 7 days)
// 4. Discovery runner (poll watchers & Google Alerts, verify, evaluate with Gemini, alert)
// 5. Catch any pipeline failure and send an urgent alert to Telegram

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getConfig } from '../core/config.js';
import { getDB, closeDB } from '../core/database.js';
import { sendMessage } from '../core/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// Helper to run a CLI script and capture output to log
function runScript(scriptRelativePath, args = []) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(ROOT, scriptRelativePath);
    const child = spawn(process.execPath, [fullPath, ...args], {
      cwd: ROOT,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Script ${scriptRelativePath} exited with code ${code}.\n${stderr || stdout}`));
      }
    });

    child.on('error', err => reject(err));
  });
}

/**
 * Check source health table and send a warning if a source has had no updates for 7+ days.
 */
async function checkSourcesHealth() {
  const db = await getDB();
  const rows = db.exec(`
    SELECT source_id, source_name, last_checked, last_found_items, consecutive_empty_checks
    FROM source_health
    WHERE is_healthy = 1
  `);

  if (!rows.length || !rows[0].values.length) return;

  const now = new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const silentSources = [];

  for (const [id, name, lastChecked, lastFound, emptyChecks] of rows[0].values) {
    if (lastFound) {
      const lastFoundDate = new Date(lastFound);
      if (now - lastFoundDate > sevenDaysMs) {
        silentSources.push({ id, name, daysSilent: Math.floor((now - lastFoundDate) / (24 * 60 * 60 * 1000)) });
      }
    } else if (emptyChecks >= 7) {
      silentSources.push({ id, name, daysSilent: emptyChecks });
    }
  }

  if (silentSources.length > 0) {
    console.log(`\n⚠️  Found ${silentSources.length} silent source(s) (>= 7 days without new items):`);
    let alertMsg = `⚠️ <b>Source Health Warning</b>\n━━━━━━━━━━━━━━━━━━\nThe following career sources have detected 0 items for 7+ days (possible site layout redesign or CSS selector change):\n\n`;
    for (const s of silentSources) {
      console.log(`   • ${s.name} (${s.id}): ${s.daysSilent} days`);
      alertMsg += `• <b>${s.name}</b> (${s.daysSilent} days silent)\n`;
    }
    alertMsg += `\n<i>Please check career pages in config/sources.json if vacancies are expected.</i>`;
    await sendMessage(alertMsg);
  }
}

async function main() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const logDir = path.join(ROOT, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFilePath = path.join(logDir, `daily_${todayStr}.log`);

  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);

  // Tee stdout and stderr into log file
  process.stdout.write = (chunk, encoding, callback) => {
    logStream.write(chunk, encoding);
    return originalStdout(chunk, encoding, callback);
  };
  process.stderr.write = (chunk, encoding, callback) => {
    logStream.write(chunk, encoding);
    return originalStderr(chunk, encoding, callback);
  };

  console.log('\n' + '='.repeat(65));
  console.log(`🚀 GovScan AI — Daily Automated Run Started [${new Date().toISOString()}]`);
  console.log('='.repeat(65) + '\n');

  try {
    // Step 1: Run Reminders & Missed Jobs Handler
    console.log('--- Step 1: Deadlines & Reports ---');
    await runScript('src/cli/reminders.js');

    // Step 2: Source Health Check
    console.log('\n--- Step 2: Source Health Audit ---');
    await checkSourcesHealth();

    // Step 3: Run Discovery Engine
    console.log('\n--- Step 3: Discovery Engine ---');
    await runScript('src/cli/discover.js');

    console.log('\n' + '='.repeat(65));
    console.log(`✅ GovScan AI — Daily Run Completed Successfully [${new Date().toISOString()}]`);
    console.log(`📄 Log saved to: ${logFilePath}`);
    console.log('='.repeat(65) + '\n');
  } catch (err) {
    console.error(`\n❌ CRITICAL: Daily Run Failed: ${err.message}`);
    // Send urgent Telegram alert on failure
    try {
      await sendMessage(`🚨 <b>Daily GovScan Run Failed!</b>\n━━━━━━━━━━━━━━━━━━\nError:\n<code>${err.message.slice(0, 500)}</code>\n\nCheck log: <i>${path.basename(logFilePath)}</i>`);
    } catch (telegramErr) {
      console.error(`Failed to send Telegram alert: ${telegramErr.message}`);
    }
    process.exit(1);
  } finally {
    closeDB();
    logStream.end();
  }
}

main();
