# STATE.md — GovScan AI

**Current Phase:** 0 — Setup
**Last Updated:** 2026-11-17T17:03+05:30
**Last Session Summary:** Phase 0 COMPLETE. Created project structure, git repo, all config files, tracking files, package.json, installed deps. Applied all 9 user amendments to DECISIONS.md. Switched from better-sqlite3 to sql.js (no Visual Studio needed).

---

## Task Checklist

### PHASE 0 — Setup
- [x] T0.1 Create project, git, folder structure, STATE.md, NEEDS_FROM_USER.md, DECISIONS.md
- [x] T0.2 Check Node installed (v24.11.0 ✓); Git installed (2.51.2 ✓)
- [x] T0.3 .env.example, config files (profile.json, prompt.txt, sources.json)
- [x] T0.4 package.json + install dependencies (sql.js instead of better-sqlite3, see D002)

### PHASE 1 — Prove the Brain
- [ ] T1.1 CLI: `node check <pdf-or-url>` sends one notice to Gemini, prints validated JSON
- [ ] T1.2 User provides 5 real PDFs; run them; show results for judgment; tune prompt
- [ ] T1.3 Schema validation + retry logic + error handling

### PHASE 2 — Storage & Alerts
- [ ] T2.1 SQLite schema + dedupe logic
- [ ] T2.2 Telegram bot send + tier-based alert rules
- [ ] T2.3 CSV export command

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
**Phase 1 — Prove the Brain.** T1.1: Build the `node check <pdf-or-url>` CLI command. Blocked on Gemini API Key (NEEDS_FROM_USER #1).

## Known Bugs
None yet.

## Blocked
- T1.1 blocked on: **Gemini API Key** (NEEDS_FROM_USER #1)
- T2.2 blocked on: **Telegram Bot Token + Chat ID** (NEEDS_FROM_USER #2, #3)
- T1.2 blocked on: **5 Sample PDFs** (NEEDS_FROM_USER #4)

## Amendments Applied
All 9 amendments from user (2026-11-17) recorded in DECISIONS.md as D004–D012.
