// src/core/database.js
// SQLite database using sql.js (pure JS/WASM, no native build).
// Handles: schema creation, insert/upsert, dedup, queries, processing status.

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'govscan.sqlite');

/**
 * Normalize DD-MM-YYYY or YYYY-MM-DD into ISO YYYY-MM-DD for reliable SQLite date operations.
 */
export function normalizeDateToISO(dateStr) {
  if (!dateStr || dateStr === 'not stated') return null;
  const str = String(dateStr).trim();
  const ddmmyyyy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
  const match = str.match(ddmmyyyy);
  if (match) {
    const dd = match[1].padStart(2, '0');
    const mm = match[2].padStart(2, '0');
    const yyyy = match[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const yyyymmdd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const matchIso = str.match(yyyymmdd);
  if (matchIso) {
    const yyyy = matchIso[1];
    const mm = matchIso[2].padStart(2, '0');
    const dd = matchIso[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return str;
}

/**
 * Format ISO YYYY-MM-DD into DD-MM-YYYY for user display.
 */
export function formatDateToDisplay(isoStr) {
  if (!isoStr || isoStr === 'not stated') return isoStr || '';
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = String(isoStr).match(yyyymmdd);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return isoStr;
}

let _db = null;

/**
 * Initialize and return the database instance.
 * Creates the schema if it doesn't exist.
 */
export async function getDB() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buffer);
  } else {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new SQL.Database();
  }

  // Create tables
  _db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Core identification (dedup key)
      organisation TEXT NOT NULL,
      advertisement_no TEXT,
      post_code TEXT,
      
      -- Post details
      post_name TEXT NOT NULL,
      employment_type TEXT CHECK(employment_type IN ('permanent','contract','project','apprentice','other')),
      tier INTEGER CHECK(tier BETWEEN 1 AND 4),
      status TEXT CHECK(status IN ('Eligible','Not Eligible','Manual Review')),
      
      -- Age
      age_cutoff_date TEXT,
      max_age_for_my_category INTEGER,
      
      -- Qualification
      qualification_clause TEXT,
      page_number TEXT,
      flags TEXT, -- JSON array
      
      -- Details
      vacancies_count INTEGER,
      pay TEXT,
      location TEXT,
      fee TEXT,
      last_date TEXT,
      official_notification_url TEXT,
      official_apply_url TEXT,
      reasoning TEXT,
      
      -- Tracking (added by the system)
      date_first_detected TEXT NOT NULL DEFAULT (date('now')),
      last_verified TEXT NOT NULL DEFAULT (datetime('now')),
      application_status TEXT NOT NULL DEFAULT 'new' 
        CHECK(application_status IN ('new','applying','applied','skipped','missed')),
      notes TEXT,
      source_type TEXT, -- 'watcher', 'rss', 'manual'
      local_pdf_path TEXT,
      
      -- Amendment fields (D007, D010)
      pdf_hash TEXT,
      gemini_model_used TEXT,
      tokens_used INTEGER,
      
      -- Processing pipeline (D005)
      processing_status TEXT NOT NULL DEFAULT 'completed'
        CHECK(processing_status IN ('pending','processing','completed','failed','retry_scheduled')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      processing_error TEXT,
      
      -- Dedup: unique on org + advt_no + post_code
      UNIQUE(organisation, advertisement_no, post_code)
    )
  `);

  // Index for common queries
  _db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_tier ON jobs(tier)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_last_date ON jobs(last_date)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_app_status ON jobs(application_status)`);
  _db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_processing ON jobs(processing_status)`);

  // Corrigendum tracking table
  _db.run(`
    CREATE TABLE IF NOT EXISTS corrigenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      changes_summary TEXT,
      old_values TEXT, -- JSON snapshot of changed fields
      new_values TEXT, -- JSON snapshot of new values
      pdf_hash TEXT
    )
  `);

  // Source health tracking
  _db.run(`
    CREATE TABLE IF NOT EXISTS source_health (
      source_id TEXT PRIMARY KEY,
      source_name TEXT,
      last_checked TEXT,
      last_found_items TEXT,
      consecutive_empty_checks INTEGER DEFAULT 0,
      is_healthy INTEGER DEFAULT 1
    )
  `);

  save();
  return _db;
}

/**
 * Save the database to disk.
 */
export function save() {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Insert or update a job. Handles dedup by org + advt_no + post_code.
 * Returns: { action: 'inserted' | 'updated' | 'unchanged', id: number }
 */
export async function upsertJob(post) {
  const db = await getDB();

  const flagsJson = JSON.stringify(post.flags || []);
  const normalizedLastDate = normalizeDateToISO(post.last_date);
  const normalizedAgeCutoff = normalizeDateToISO(post.age_cutoff_date);

  // Check for existing record (dedup)
  const existing = db.exec(`
    SELECT id, pdf_hash, last_date, status, tier 
    FROM jobs 
    WHERE organisation = ? AND advertisement_no = ? AND post_code = ?
  `, [post.organisation, post.advertisement_no || null, post.post_code || null]);

  if (existing.length > 0 && existing[0].values.length > 0) {
    const row = existing[0].values[0];
    const existingId = row[0];
    const existingHash = row[1];

    // Check if content has changed (corrigendum)
    if (post.pdf_hash && existingHash && post.pdf_hash !== existingHash) {
      // Content changed — corrigendum detected!
      // Save old values
      const oldData = db.exec(`SELECT * FROM jobs WHERE id = ?`, [existingId]);
      
      // Update the job
      db.run(`
        UPDATE jobs SET
          post_name = ?, employment_type = ?, tier = ?, status = ?,
          age_cutoff_date = ?, max_age_for_my_category = ?,
          qualification_clause = ?, page_number = ?, flags = ?,
          vacancies_count = ?, pay = ?, location = ?, fee = ?,
          last_date = ?, official_notification_url = ?, official_apply_url = ?,
          reasoning = ?, last_verified = datetime('now'),
          pdf_hash = ?, gemini_model_used = ?, tokens_used = ?,
          local_pdf_path = COALESCE(?, local_pdf_path),
          processing_status = 'completed', processing_error = NULL
        WHERE id = ?
      `, [
        post.post_name, post.employment_type, post.tier, post.status,
        normalizedAgeCutoff, post.max_age_for_my_category,
        post.qualification_clause, post.page_number, flagsJson,
        post.vacancies_count, post.pay, post.location, post.fee,
        normalizedLastDate, post.official_notification_url, post.official_apply_url,
        post.reasoning,
        post.pdf_hash, post.gemini_model_used, post.tokens_used,
        post.local_pdf_path || null,
        existingId,
      ]);

      // Log the corrigendum
      db.run(`
        INSERT INTO corrigenda (job_id, changes_summary, pdf_hash)
        VALUES (?, ?, ?)
      `, [existingId, 'Content hash changed — possible corrigendum', post.pdf_hash]);

      save();
      return { action: 'updated', id: existingId, corrigendum: true };
    }

    // Same hash or no hash — just update verified timestamp
    db.run(`UPDATE jobs SET last_verified = datetime('now') WHERE id = ?`, [existingId]);
    save();
    return { action: 'unchanged', id: existingId };
  }

  // Insert new record
  db.run(`
    INSERT INTO jobs (
      organisation, advertisement_no, post_code,
      post_name, employment_type, tier, status,
      age_cutoff_date, max_age_for_my_category,
      qualification_clause, page_number, flags,
      vacancies_count, pay, location, fee,
      last_date, official_notification_url, official_apply_url,
      reasoning, source_type, local_pdf_path,
      pdf_hash, gemini_model_used, tokens_used,
      processing_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
  `, [
    post.organisation, post.advertisement_no || null, post.post_code || null,
    post.post_name, post.employment_type, post.tier, post.status,
    normalizedAgeCutoff, post.max_age_for_my_category,
    post.qualification_clause, post.page_number, flagsJson,
    post.vacancies_count, post.pay, post.location, post.fee,
    normalizedLastDate, post.official_notification_url, post.official_apply_url,
    post.reasoning, post.source_type || 'manual', post.local_pdf_path || null,
    post.pdf_hash, post.gemini_model_used, post.tokens_used,
  ]);

  const insertedId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
  save();
  return { action: 'inserted', id: insertedId };
}

/**
 * Query jobs by various filters.
 */
export async function queryJobs(filters = {}) {
  const db = await getDB();

  let where = [];
  let params = [];

  if (filters.tier) {
    where.push('tier = ?');
    params.push(filters.tier);
  }
  if (filters.tiers) {
    where.push(`tier IN (${filters.tiers.map(() => '?').join(',')})`);
    params.push(...filters.tiers);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.application_status) {
    where.push('application_status = ?');
    params.push(filters.application_status);
  }
  if (filters.not_expired) {
    where.push("(last_date IS NULL OR last_date >= date('now'))");
  }
  if (filters.processing_status) {
    where.push('processing_status = ?');
    params.push(filters.processing_status);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = filters.orderBy || 'tier ASC, last_date ASC';

  const result = db.exec(`
    SELECT * FROM jobs ${whereClause} ORDER BY ${orderBy}
  `, params);

  if (result.length === 0) return [];

  // Convert to objects
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    // Parse flags back to array
    if (obj.flags) {
      try { obj.flags = JSON.parse(obj.flags); } catch { obj.flags = []; }
    }
    return obj;
  });
}

/**
 * Get jobs that are "missed" (Eligible or Manual Review, still new, past deadline).
 */
export async function getMissedJobs() {
  const db = await getDB();
  const result = db.exec(`
    SELECT * FROM jobs
    WHERE (status = 'Eligible' OR status = 'Manual Review')
      AND application_status = 'new'
      AND last_date IS NOT NULL
      AND last_date < date('now')
    ORDER BY last_date DESC
  `);

  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    if (obj.flags) {
      try { obj.flags = JSON.parse(obj.flags); } catch { obj.flags = []; }
    }
    return obj;
  });
}

/**
 * Get upcoming deadlines (within N days).
 */
export async function getUpcomingDeadlines(withinDays = 7) {
  const db = await getDB();
  const result = db.exec(`
    SELECT * FROM jobs
    WHERE (status = 'Eligible' OR status = 'Manual Review')
      AND application_status IN ('new', 'applying')
      AND last_date IS NOT NULL
      AND last_date >= date('now')
      AND last_date <= date('now', '+' || ? || ' days')
    ORDER BY last_date ASC
  `, [withinDays]);

  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    if (obj.flags) {
      try { obj.flags = JSON.parse(obj.flags); } catch { obj.flags = []; }
    }
    return obj;
  });
}

/**
 * Update application status for a job.
 */
export async function updateApplicationStatus(id, newStatus, notes = null) {
  const db = await getDB();
  db.run(`
    UPDATE jobs SET application_status = ?, notes = COALESCE(?, notes) WHERE id = ?
  `, [newStatus, notes, id]);
  save();
}

/**
 * Mark expired eligible/manual-review jobs as missed.
 */
export async function markMissedJobs() {
  const db = await getDB();
  const result = db.exec(`
    UPDATE jobs SET application_status = 'missed'
    WHERE (status = 'Eligible' OR status = 'Manual Review')
      AND application_status = 'new'
      AND last_date IS NOT NULL
      AND last_date < date('now')
  `);
  save();
  // Return count
  const changed = db.getRowsModified();
  return changed;
}

/**
 * Get DB stats summary.
 */
export async function getStats() {
  const db = await getDB();

  const total = db.exec(`SELECT COUNT(*) FROM jobs`)[0].values[0][0];
  const byTier = db.exec(`SELECT tier, COUNT(*) FROM jobs GROUP BY tier`);
  const byStatus = db.exec(`SELECT status, COUNT(*) FROM jobs GROUP BY status`);
  const byAppStatus = db.exec(`SELECT application_status, COUNT(*) FROM jobs GROUP BY application_status`);

  return {
    total,
    byTier: byTier.length ? Object.fromEntries(byTier[0].values) : {},
    byStatus: byStatus.length ? Object.fromEntries(byStatus[0].values) : {},
    byAppStatus: byAppStatus.length ? Object.fromEntries(byAppStatus[0].values) : {},
  };
}

/**
 * Close the database connection.
 */
export function closeDB() {
  if (_db) {
    save();
    _db.close();
    _db = null;
  }
}
