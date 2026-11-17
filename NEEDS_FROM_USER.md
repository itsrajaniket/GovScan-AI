# NEEDS_FROM_USER.md — GovScan AI

Items the builder needs from the user. Never guess secrets or values that must come from the user.

---

| # | What | Why | Where to get it | Blocks task | Status |
|---|------|-----|-----------------|-------------|--------|
| 1 | **Gemini API Key** | Required to call the Gemini API for eligibility checking | Go to https://aistudio.google.com/apikey → sign in → "Create API key" → copy the key | T1.1 (CLI check command) | 🔴 OPEN |
| 2 | **Telegram Bot Token** | Required to send alerts and reports via Telegram | Open Telegram → search @BotFather → /newbot → follow prompts → copy the HTTP API token | T2.2 (Telegram alerts) | 🔴 OPEN |
| 3 | **Telegram Chat ID** | Required to know where to send messages | Open Telegram → search @userinfobot → start → it replies with your numeric ID | T2.2 (Telegram alerts) | 🔴 OPEN |
| 4 | **5 Sample Notice PDFs** | Needed to test and tune the eligibility prompt in Phase 1 | Pick 5 real past government job notification PDFs you've seen — a mix of eligible, not eligible, and borderline | T1.2 (prompt tuning) | 🔴 OPEN |
| 5 | **Google Alerts RSS Feed URLs** | Discovery source for new job notifications | Set up Google Alerts for queries like "government job notification electronics" → choose "RSS feed" delivery → copy feed URLs | T3.1 (RSS reader) | 🔴 OPEN — not needed until Phase 3 |
| 6 | **Confirm source career-page URLs** | Each watcher needs a verified career-page URL and CSS selector | Builder will propose URLs; user confirms they are correct and current | T3.2 (page watchers) | 🔴 OPEN — not needed until Phase 3 |

---

### 🔜 Immediate need (blocks Phase 1):
**Item 1 — Gemini API Key.** Please go to https://aistudio.google.com/apikey, create a key, and paste it. I will tell you where to put it (in the `.env` file).

Items 2-3 are needed for Phase 2. Items 4-6 are needed during Phase 1-3 respectively.
