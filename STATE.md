# STATE.md — GovScan AI

**Current Phase:** 5 — Extras (Phases 0-4 Core Pipeline Fully Built & Operational)
**Last Updated:** 2026-11-19T04:28+05:30
**Last Session Summary:** Phase 4 COMPLETE. Built master daily runner (`src/cli/daily-run.js`), deadline reminders (7d/2d + Sunday weekly report in `src/cli/reminders.js`), source health checker, daily file logger, and Windows Task Scheduler automated task (`GovScanAI_DailyRun` scheduled daily at 08:30 AM). All core pipeline phases (0 to 4) are now 100% complete and working!

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
- [x] T2.2 Telegram bot send + tier-based alert rules ✅ Tested live with user Telegram bot
- [x] T2.3 CSV export command ✅ Tested

### PHASE 3 — Discovery
- [x] T3.1 Google Alerts RSS reader (`src/core/rss.js`) ✅ Tested
- [x] T3.2 Page watcher with CSS-selector hashing (`src/core/watcher.js`) ✅ Built
- [x] T3.3 Verification step (`src/core/verify.js`) ✅ Tested
- [x] T3.4 Manual "add URL/PDF" command (`src/cli/add.js`) ✅ Tested end-to-end

### PHASE 4 — Automation
- [x] T4.1 Daily run via Task Scheduler, logging, failure alerts to Telegram (`src/cli/daily-run.js`, `scripts/setup-task-scheduler.ps1`) ✅ Tested
- [x] T4.2 Deadline reminders (7d, 2d) + weekly missed-jobs report (`src/cli/reminders.js`) ✅ Tested live via Telegram

### PHASE 5 — Extras
- [ ] T5.1 Google Sheet sync
- [ ] T5.2 Grow sources to 25+
- [x] T5.3 Simple local dashboard to filter by tier/status/deadline (`src/cli/dashboard.js`, `npm run dashboard`) ✅ Built and tested

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
