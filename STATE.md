# STATE.md — GovScan AI

**Current Phase:** 3 — Discovery
**Last Updated:** 2026-11-19T04:08+05:30
**Last Session Summary:** Phase 2 COMPLETE. Telegram bot linked (Chat ID 955347757). Live alerts verified. Fixed SQLite date normalization issue (D014). Ready to build Phase 3 Discovery (RSS reader, page watcher, verification step, manual add).

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
- [ ] T3.1 Google Alerts RSS reader
- [ ] T3.2 Page watcher with CSS-selector hashing (5 sources)
- [ ] T3.3 Verification step (keyword heuristic first, Gemini for ambiguous)
- [ ] T3.4 Manual "add URL/PDF" command

### PHASE 4 — Automation
- [ ] T4.1 Daily run via Task Scheduler, logging, failure alerts to Telegram
- [ ] T4.2 Deadline reminders (7d, 2d) + weekly missed-jobs report

### PHASE 5 — Extras
- [ ] T5.1 Google Sheet sync
- [ ] T5.2 Grow sources to 25+
- [ ] T5.3 Simple local dashboard (optional)

---

## What's Next
**Phase 3 — Discovery:**
- T3.1 Google Alerts RSS reader
- T3.2 Page watcher with CSS-selector hashing (5 sources)
- T3.3 Verification step (keyword heuristic first, Gemini for ambiguous)
- T3.4 Manual "add URL/PDF" command (`node src/cli/add.js`)

## Known Bugs
None.

## Blocked
- T1.2 waiting on: **5 Sample PDFs** (NEEDS_FROM_USER #4) for real-world prompt calibration (can run concurrently).

## Amendments Applied
All 9 amendments from user (2026-11-17) recorded in DECISIONS.md as D004–D012.
