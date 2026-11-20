# STATE.md — GovScan AI

**Current Phase:** 5 — Extras (Sarkari Result Aggregator, Categorized Multi-Tab Excel Workbook, and Interactive Local Dashboard Complete)
**Last Updated:** 2026-11-20T14:42+05:30
**Last Session Summary:** Integrated Sarkari Result aggregator (`src/core/sarkari-result.js`) into `discover.js` to extract official PDFs and application links. Built categorized multi-tab Excel generator (`src/cli/export-excel.js`, `npm run excel`) producing `GovScan_Job_Report_YYYY-MM-DD.xlsx` with 4 dedicated sheets: `1_Ready_To_Apply`, `2_Manual_Review`, `3_Expired_Deadlines`, and `4_All_Jobs_Archive`. Updated interactive local HTML dashboard (`data/dashboard.html`, `npm run dashboard`) with 1-click quick-filter category tabs. Silenced "Not Eligible" and expired alerts on Telegram so notifications remain 100% actionable. Discovered and populated 82 jobs in SQLite database. Both Excel and Dashboard refresh automatically on every daily run (`daily-run.js`).

---

## Task Checklist

### PHASE 0 — Setup
- [x] T0.1 Create project, git, folder structure, STATE.md, NEEDS_FROM_USER.md, DECISIONS.md
- [x] T0.2 Check Node installed (v24.11.0 ✓); Git installed (2.51.2 ✓)
- [x] T0.3 .env.example, config files (profile.json, prompt.txt, sources.json)
- [x] T0.4 package.json + install dependencies (sql.js instead of better-sqlite3, see D002)

### PHASE 1 — Prove the Brain
- [x] T1.1 CLI: `node check <pdf-or-url>` sends one notice to Gemini, prints validated JSON ✅ PROVEN
- [~] T1.2 User provides 5 real PDFs; run them; show results for judgment; tune prompt (waiting for PDFs)
- [x] T1.3 Schema validation + retry logic + error handling ✅ Built

### PHASE 2 — Storage & Alerts
- [x] T2.1 SQLite schema + dedupe logic ✅ Tested
- [x] T2.2 Telegram bot send + tier-based alert rules ✅ Tested live with user Telegram bot (actionable-only filter)
- [x] T2.3 CSV export command ✅ Tested

### PHASE 3 — Discovery
- [x] T3.1 Google Alerts RSS reader (`src/core/rss.js`) ✅ Tested
- [x] T3.2 Page watcher with CSS-selector hashing (`src/core/watcher.js`) ✅ Built
- [x] T3.3 Verification step (`src/core/verify.js`) ✅ Tested
- [x] T3.4 Manual "add URL/PDF" command (`src/cli/add.js`) ✅ Tested end-to-end
- [x] T3.5 Aggregator indexer for Sarkari Result (`src/core/sarkari-result.js`) ✅ Tested live (extracts official PDFs)

### PHASE 4 — Automation
- [x] T4.1 Daily run via Task Scheduler, logging, failure alerts to Telegram (`src/cli/daily-run.js`, `scripts/setup-task-scheduler.ps1`) ✅ Tested
- [x] T4.2 Deadline reminders (7d, 2d) + weekly missed-jobs report (`src/cli/reminders.js`) ✅ Tested live via Telegram

### PHASE 5 — Extras
- [x] T5.1 Categorized Multi-Tab Excel Workbook (`src/cli/export-excel.js`, `npm run excel`) ✅ Built and verified (4 tabs)
- [ ] T5.2 Grow sources to 25+
- [x] T5.3 Simple local interactive dashboard with 4 category switcher tabs (`src/cli/dashboard.js`, `npm run dashboard`) ✅ Built and verified

---

## What's Next
**Phase 5 — Extras (Optional enhancements):**
- T5.1 Google Sheet sync
- T5.2 Grow sources to 25+ (verify career URLs & CSS selectors for CDAC, NIELIT, ISRO, BEL, CSIR)
- T5.3 Simple local dashboard to filter by tier/status/deadline (optional)
- T1.2 5 Real past PDFs calibration run (user can drop them anytime in `data/notices/`)

## Known Bugs
None.

## Blocked
- None for core operation. All core features (Phases 0-4) are operational and scheduled.

## Amendments Applied
All 9 amendments from user (2026-11-17) recorded in DECISIONS.md as D004–D012.
