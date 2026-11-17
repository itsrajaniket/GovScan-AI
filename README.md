# GovScan AI

Personal Government Job Radar — a free, local-first tool that finds Indian government / PSU / autonomous-body / university / research job notifications, checks eligibility against your profile using Google Gemini, and alerts you on Telegram.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your API keys
2. `npm install`
3. `npm run check -- <path-to-pdf-or-url>` — check a single notification
4. `npm run add -- <path-or-url>` — add a notification to the database
5. `npm run daily` — run the full daily pipeline
6. `npm run export` — export database to CSV

## Project Structure

```
├── config/
│   ├── profile.json      # Your candidate profile
│   ├── prompt.txt         # Gemini eligibility prompt template
│   ├── sources.json       # Watched career pages & RSS feeds
│   └── settings.json      # App settings (limits, keywords, etc.)
├── data/
│   ├── notices/           # Downloaded PDF/doc files
│   └── exports/           # CSV exports
├── src/
│   ├── cli/               # CLI entry points
│   ├── core/              # Core logic (gemini, db, telegram, pipeline)
│   └── utils/             # Shared utilities
├── logs/                  # Daily run logs
├── scripts/               # Setup/maintenance scripts
├── .env.example           # Environment variables template
├── STATE.md               # Build progress tracker
├── NEEDS_FROM_USER.md     # Items needed from user
└── DECISIONS.md           # Design decision log
```

## Tech Stack

- **Runtime:** Node.js (LTS) + plain JavaScript (ES modules)
- **Database:** SQLite via better-sqlite3
- **AI:** Google Gemini API (free tier via AI Studio)
- **Alerts:** Telegram Bot API
- **Discovery:** Page watchers (fetch + cheerio), Google Alerts RSS, manual add

## Cost

Rs 0. All components use free tiers.
