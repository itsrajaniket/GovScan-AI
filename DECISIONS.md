# DECISIONS.md — GovScan AI

All architectural and design decisions, logged in order.

---

### D001 — Language: Plain JavaScript (not TypeScript)
**Date:** 2026-11-17
**Why:** The user knows JavaScript/Node.js well and is new to some tooling. Plain JS reduces setup friction (no tsc, no tsconfig, no type errors to debug). We can always add TypeScript later if the codebase grows. Speed of iteration matters more than type safety for a single-user tool.

### D002 — Database: SQLite via sql.js (changed from better-sqlite3)
**Date:** 2026-11-17 (updated)
**Why:** better-sqlite3 requires native C++ compilation (node-gyp + Visual Studio "Desktop development with C++" workload), which is not installed on the user's machine. Switched to **sql.js** — a pure-JavaScript/WebAssembly SQLite build. Same SQLite engine, no native build step, works out of the box. Trade-off: slightly slower for huge datasets, but irrelevant for a single-user job tracker with hundreds of rows at most. The API is slightly different (async init, manual save) but functionally identical.

### D003 — Gemini Model: gemini-2.0-flash (free tier)
**Date:** 2026-11-17
**Why:** As of Nov 2026, this is the recommended free-tier model on AI Studio. ~15 RPM, ~1500 RPD. We set GEMINI_DAILY_LIMIT=1400 as a safety margin. The model name is stored in .env, NOT hardcoded, so it can be updated if Google changes the lineup. Verified from https://ai.google.dev/pricing.

### D004 — PDF Handling Policy (Amendment 1)
**Date:** 2026-11-17
**Why:** Government PDFs vary wildly. Policy:
- **Scanned/image PDFs**: Detect (check if text extraction yields <100 chars). Send via Gemini vision (native PDF input supports images).
- **Password-protected PDFs**: Detect, flag as blocked, skip. Log reason.
- **CAPTCHA/login-blocked downloads**: Log block reason, do not attempt to bypass.
- **Non-PDF formats** (.doc/.docx/HTML): Extract text (use mammoth for .docx, cheerio for HTML), send text to Gemini.
- **PDFs over 50 pages**: Send in page ranges (1-50, 51-100, etc.) or flag "too_large_for_auto_check" if chunking is impractical.
- **Never fail silently** — every failure is logged with a reason and alerted if appropriate.

### D005 — Processing Status & Retry Logic (Amendment 2)
**Date:** 2026-11-17
**Why:** Pipeline can fail at multiple points. DB tracks processing_status: pending → processing → completed | failed | retry_scheduled. Failed items retry up to 3 times across runs, then flagged for manual review. Rate-limit stops are resumable.

### D006 — Verify Step: Keyword-First, Gemini-Second (Amendment 3)
**Date:** 2026-11-17
**Why:** Saves API calls. Keywords like "result", "admit card", "answer key", "tender" are reliable negative signals. Only ambiguous items go to Gemini for classification.

### D007 — Corrigendum Strategy (Amendment 4)
**Date:** 2026-11-17
**Why:** When a corrigendum is detected (same org + adv_no but content hash differs), re-process original + corrigendum, diff the results, and send a Telegram alert listing specific changes (deadline, age, qualifications, vacancies).

### D008 — Source Count: 5 in Phase 3, expand Phase 5 (Amendment 5)
**Date:** 2026-11-17
**Why:** 10 sources is too many to verify and stabilize at once. Start with 5 Tier-1-aligned orgs: CDAC, NIELIT, CSIR, ISRO, BEL. Add source health monitoring (alert if no items for 7+ days). Google Alerts is supplement only.

### D009 — "Missed" Definition (Amendment 6)
**Date:** 2026-11-17
**Why:** missed = (status is Eligible OR Manual Review) AND (application_status is still "new") AND (last_date has passed). Weekly report includes both missed items and unreviewed Manual Review items.

### D010 — Additional Schema Fields (Amendment 7)
**Date:** 2026-11-17
**Why:** Added vacancies_count, pdf_hash (SHA-256), gemini_model_used, tokens_used for tracking and auditing.

### D011 — Telegram Template (Amendment 8)
**Date:** 2026-11-17
**Why:** Standardised scannable format with tier/status line, org|post, advt no, pay/type, location, last date with days-left countdown, flags, official link.

### D012 — .env.example with Comments (Amendment 9)
**Date:** 2026-11-17
**Why:** Each variable has a comment explaining what it is and where to get it. GEMINI_DAILY_LIMIT defaults to 1400 (below 1500 RPD official limit).

### D013 — Model: gemini-3.5-flash (not 3.8)
**Date:** 2026-11-17
**Why:** gemini-2.0-flash returns 404 (retired). gemini-3.8-flash and gemini-flash-latest return 503 (high demand). gemini-2.5-flash returns 404 (not available to new users). gemini-3.5-flash works reliably, produces excellent structured JSON output on the eligibility task, and costs 4005 tokens per 3-post notification. Keeping the model name in .env so it can be changed anytime.

### D014 — SQLite Date Normalization (ISO YYYY-MM-DD)
**Date:** 2026-11-19
**Why:** SQLite's built-in date functions (`date('now')`, date comparisons `>=`, `<=`, and `ORDER BY`) rely on ISO format `YYYY-MM-DD`. If dates are stored as `DD-MM-YYYY`, lexicographical comparisons produce wrong results (e.g. `'15-02-2027' < '2026-11-19'` would evaluate to true because `'1' < '2'`). All dates (`last_date`, `age_cutoff_date`) are normalized to `YYYY-MM-DD` upon database storage, while user-facing alerts and displays are formatted as `DD-MM-YYYY`.

### D015 — Automation & Task Scheduler Architecture
**Date:** 2026-11-19
**Why:** Configured Windows Task Scheduler task (`GovScanAI_DailyRun`) running daily at 08:30 AM with battery allowances enabled (`-AllowStartIfOnBatteries`, `-DontStopIfGoingOnBatteries`, `-StartWhenAvailable`). Output is streamed and mirrored into `logs/daily_YYYY-MM-DD.log`. If unhandled exceptions occur during any step of the daily pipeline, an urgent Telegram alert is dispatched immediately to notify the user.
