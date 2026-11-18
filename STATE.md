# STATE.md — GovScan AI

**Current Phase:** 4 — Automation
**Last Updated:** 2026-11-19T04:22+05:30
**Last Session Summary:** Phase 3 COMPLETE. Built verification pipeline (heuristic + domain whitelist), Google Alerts RSS parser (with URL unwrapping), CSS-selector page watcher with health monitoring, full discovery engine (`discover.js`), and manual add CLI (`add.js`). Added universal transient-error exponential backoff to `gemini.js`.

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
- [ ] T4.1 Daily run via Task Scheduler, logging, failure alerts to Telegram
- [ ] T4.2 Deadline reminders (7d, 2d) + weekly missed-jobs report

### PHASE 5 — Extras
- [ ] T5.1 Google Sheet sync
- [ ] T5.2 Grow sources to 25+
- [ ] T5.3 Simple local dashboard (optional)

---

## What's Next
**Phase 4 — Automation:**
- T4.1 Daily run orchestrator (`src/cli/daily-run.js`), Task Scheduler setup script, logging, failure alerts to Telegram.
- T4.2 Deadline reminders (7d, 2d countdowns) + weekly missed-jobs report (`src/cli/reminders.js`).

## Known Bugs
None.

## Blocked
- T1.2 waiting on: **5 Sample PDFs** (NEEDS_FROM_USER #4) for prompt fine-tuning (can be done anytime).
- Source career URLs in `config/sources.json` can be verified and activated as user confirms them.

## Amendments Applied
All 9 amendments from user (2026-11-17) recorded in DECISIONS.md as D004–D012.
