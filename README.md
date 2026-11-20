# 🛰️ GovScan AI

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-24.11.0-68a063?style=for-the-badge&logo=node.js&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-3.5_Flash_Lite-4285F4?style=for-the-badge&logo=google&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-sql.js_WASM_1.11.0-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram_Bot-Direct_HTTP_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows_11-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![Hosting](https://img.shields.io/badge/Hosting-GitHub_Pages-black?style=for-the-badge&logo=github)
![Cost](https://img.shields.io/badge/Cost-₹0_Free_Forever-10b981?style=for-the-badge)

<p align="center">
  Autonomous, local-first intelligence radar that discovers Indian government and PSU job notifications, evaluates eligibility clause-by-clause via Google Gemini, and delivers actionable alerts to Telegram, Excel, and an interactive dashboard
</p>

</div>

---

## Table of contents

- [1. Project overview](#1-project-overview)
- [2. Live demo and visuals](#2-live-demo-and-visuals)
- [3. Tech stack and choices](#3-tech-stack-and-choices)
- [4. Core features](#4-core-features)
- [5. Architecture and project structure](#5-architecture-and-project-structure)
- [6. State management and data flow](#6-state-management-and-data-flow)
- [7. API reference](#7-api-reference)
- [8. Browser APIs and technical highlights](#8-browser-apis-and-technical-highlights)
- [9. Getting started](#9-getting-started)
- [10. Scripts reference](#10-scripts-reference)
- [11. Configuration and customization](#11-configuration-and-customization)
- [12. Known limitations and troubleshooting](#12-known-limitations-and-troubleshooting)
- [13. Security and privacy](#13-security-and-privacy)
- [14. Roadmap](#14-roadmap)
- [15. Contributing](#15-contributing)
- [16. License](#16-license)

---

## 1. Project overview

GovScan AI is an automated, single-user job discovery and eligibility radar running locally on Windows. It autonomously monitors Indian central government career portals, research institutes (such as ISRO and CDAC), and third-party aggregator feeds, downloads the primary recruitment notifications (PDF/HTML/DOCX), and parses their textual content. The extracted text is evaluated against the candidate's exact academic profile, demographic category, and age cutoff dates using Google Gemini, storing structured vacancies into a local SQLite database and dispatching actionable alerts and reports.

Navigating government employment in India presents severe logistical challenges for candidates. Recruitment portals publish multi-page PDFs (typically 20 to 60 pages) with dense eligibility matrices, convoluted equivalence clauses, category-specific age relaxations, and strict closing deadlines. Aggregator websites list hundreds of daily advertisements, but over 95% do not match a candidate's specific background, creating notification fatigue. Missing an application window often delays a candidate's opportunity by one to two years.

The system is tailored for an individual aspirant holding an M.Sc in Electronics & Communication, B.Sc (Hons) in Physics, pursuing an online MCA, holding a central OBC-NCL certificate with Bihar domicile, and requiring freshers-eligible positions.

***GovScan AI replaces hours of daily manual notification scouring with an autonomous zero-cost radar that evaluates complex government recruitment PDFs against your exact qualifications and alerts you only when you are genuinely eligible.***

---

## 2. Live demo and visuals

- **Live web dashboard:** Hosted online at `https://itsrajaniket.github.io/GovScan-AI/` (served via GitHub Pages from `/docs`).
- **Local offline dashboard:** Generated at `data/dashboard.html` and viewable in any browser without an active web server (`npm run dashboard -- --open`).
- **Telegram channel delivery:** Direct dispatch of real-time alerts and daily `.xlsx` documents to `@Job2303_bot`.

<!-- Note: Replace the screenshot placeholders below with production captures from the client UI. -->
![Mission Control Dashboard](./screenshots/dashboard_overview.png)
*Figure 1: Standalone mission control dashboard displaying category switcher tabs and portal distribution pills.*

![Candidate Match Visualizer](./screenshots/candidate_match.png)
*Figure 2: Candidate match visualizer detailing degree verification, age cutoff evaluation, and official clause quotation.*

![Urgent Deadline Timeline](./screenshots/deadline_timeline.png)
*Figure 3: Deadline timeline grouping vacancies chronologically by urgency.*

![Telegram Actionable Alert](./screenshots/telegram_alert.png)
*Figure 4: Mobile Telegram notification showing post details, countdown urgency, and one-click apply links.*

![Categorized Excel Workbook](./screenshots/excel_multitab.png)
*Figure 5: Generated multi-tab Excel spreadsheet grouping jobs across 4 dedicated operational worksheets.*

---

## 3. Tech stack and choices

### Core runtime & environment

| Technology | Version | Purpose | Why chosen over alternatives |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>=20.0.0` (v24.11.0) | Primary runtime environment | Built-in ES module support, native `fetch` / `FormData` / `Blob` implementation, and robust asynchronous child process orchestration. |
| **JavaScript (ES Modules)** | ES2024 | Application language | Avoids TypeScript compilation overhead and build configuration steps on the client machine while maintaining fast execution and clean native module syntax. |

### Storage & database

| Technology | Version | Purpose | Why chosen over alternatives |
| :--- | :--- | :--- | :--- |
| **sql.js** | `^1.11.0` | Embedded SQLite database engine | Pure WebAssembly port of SQLite. Selected over `better-sqlite3` because it runs without requiring native C++ build tools (`node-gyp` / MSVC Build Tools) on Windows. |
| **xlsx** | `^0.18.5` | Multi-tab spreadsheet generation | Generates native binary `.xlsx` files with customized column formatting and sheet schemas without requiring external desktop software like Microsoft Excel. |

### AI & document parsing

| Technology | Version | Purpose | Why chosen over alternatives |
| :--- | :--- | :--- | :--- |
| **@google/generative-ai** | `^0.24.0` | AI eligibility evaluation client | Provides official client bindings for Google Gemini API models, featuring structured prompt inputs, system instruction configuration, and token telemetry. |
| **pdf-parse** | `^1.1.1` | Local PDF text extraction | Fast text extraction from clean digital government PDF notices; reduces Gemini API token usage by up to 90% compared to transmitting multi-megabyte base64 PDF buffers. |
| **mammoth** | `^1.8.0` | DOCX document text extraction | Extracts clean raw text from legacy Microsoft Word `.docx` notices commonly published by older university boards and regional PSUs. |
| **cheerio** | `^1.0.0` | HTML document & selector parser | Fast server-side jQuery implementation for extracting tables, CSS career content hashes, and links from portal markup. |

### Networking & transport

| Technology | Version | Purpose | Why chosen over alternatives |
| :--- | :--- | :--- | :--- |
| **node-fetch** | `^3.3.0` | HTTP client for site scraping | Supports explicit custom HTTPS agents (`rejectUnauthorized: false`) required to communicate with state government and NIC servers using custom/expired CA roots. |
| **dotenv** | `^16.4.0` | Secret & configuration loader | Loads local environment variables from `.env` into `process.env` during CLI and scheduler script invocations. |

### Architecture philosophy

The architecture follows a strict **zero-cost, local-first, decoupled** design. All raw documents, database records, and execution logs reside on the local filesystem. The pipeline leverages free-tier AI (1,500 requests per day on Google AI Studio) and free Telegram Bot API transports, eliminating all recurring operational expenses. Aggregator summaries are treated strictly as discovery hints, enforcing primary `.gov.in`/PSU documents as the single source of truth.

---

## 4. Core features

### Discovery & verification

- **Portal page watchers** (⭐)
  - *Technical operation:* Connects via `node-fetch`, extracts specified DOM containers using `cheerio`, and computes a SHA-256 hash of the sanitized text to detect recruitment updates. Maintains a consecutive-empty counter in SQLite table `source_health` and triggers silence alerts after 7 days of inactivity.
  - *User experience:* Detects recruitment updates from career portals without polling excessive bandwidth.
  - *Powering module:* `src/core/watcher.js`

- **Sarkari Result aggregator hint engine** (⭐ 🆕)
  - *Technical operation:* Scrapes `sarkariresult.com/latestjob/`, resolves the detail page, and searches table rows for anchor elements containing `.pdf` files or official external URLs. Evaluates links through `src/core/verify.js` to strip aggregator domains, prevents false negative matches on keyword `"result"`, and yields verified candidates.
  - *User experience:* Automatically pulls current government advertisements and resolves the direct official PDF link.
  - *Powering module:* `src/core/sarkari-result.js`

- **Heuristic candidate verification**
  - *Technical operation:* Checks URLs against approved institutional suffixes (`.gov.in`, `.nic.in`, `.ac.in`, `.res.in`, PSU domains). Applies word-boundary regular expressions (`\bresults?\b`, `\bmarks?\b`, `\btenders?\b`) against normalized URLs and headlines to filter out non-vacancy records prior to AI invocation.
  - *User experience:* Prevents unnecessary API calls and avoids processing tender notices or exam results.
  - *Powering module:* `src/core/verify.js`

- **Google Alerts RSS feed parser**
  - *Technical operation:* Fetches RSS XML feeds, unwraps Google redirect tracking links (`google.com/url?rct=j&url=...`), validates target domains, and extracts vacancy candidates.
  - *User experience:* Integrates customized Google Alerts search terms into the daily ingestion stream.
  - *Powering module:* `src/core/rss.js`

### Eligibility intelligence & parsing

- **Multi-model AI eligibility engine** (⭐)
  - *Technical operation:* Sends candidate profile JSON, tailored evaluation guidelines, and extracted document text to Gemini models with fallback ordering (`gemini-3.5-flash-lite` &rarr; `gemini-3.5-flash`). Tracks token consumption, manages daily request limits via `data/.api_counter.json`, and applies exponential backoff on HTTP 503 load spikes.
  - *User experience:* Evaluates multi-post vacancy advertisements in seconds, classifying roles into Tiers 1 through 4.
  - *Powering module:* `src/core/gemini.js`

- **Auto-salvaging JSON schema validator** (⭐)
  - *Technical operation:* Validates model output against strict field constraints. If Gemini output terminates prematurely due to token truncation on long notifications, `salvageTruncatedJsonArray()` reconstructs a closed JSON array up to the final valid post object.
  - *User experience:* Recovers usable job evaluations from large multi-post documents without crashing the pipeline.
  - *Powering module:* `src/core/schema.js`

- **Corrigendum & amendment detector** (🆕)
  - *Technical operation:* Compares document SHA-256 hashes against known records matching the same `(organisation, advertisement_no)`. If a hash change is detected, re-evaluates the notice and dispatches a dedicated corrigendum diff notification.
  - *User experience:* Flags deadline extensions, post revisions, and age adjustments without duplicate job cards.
  - *Powering module:* `src/core/database.js`

### User delivery & reporting

- **Actionable-only Telegram dispatcher** (🆕)
  - *Technical operation:* Formats job records using Telegram HTML parse mode. Silences all `Not Eligible` and expired jobs, transmitting alerts exclusively for unexpired `Eligible` and `Manual Review` positions. Includes direct links to both the official notification PDF and the application portal.
  - *User experience:* Eliminates alert noise on mobile devices while highlighting actionable opportunities.
  - *Powering module:* `src/core/telegram.js`

- **Daily Telegram document delivery** (🆕)
  - *Technical operation:* Bundles the generated `.xlsx` workbook using native Node.js `FormData` and `Blob` APIs and posts the binary document to Telegram Bot endpoint `/sendDocument`.
  - *User experience:* Delivers an updated multi-tab spreadsheet to the user's mobile device every morning at 08:30 AM.
  - *Powering module:* `src/core/telegram.js` & `src/cli/daily-run.js`

- **Multi-tab Excel workbook generator**
  - *Technical operation:* Queries the SQLite store, computes remaining days relative to current time, and uses `xlsx` to write 4 separate worksheets (`1_Ready_To_Apply`, `2_Manual_Review`, `3_Expired_Deadlines`, `4_All_Jobs_Archive`) with auto-adjusted column widths.
  - *User experience:* Exports a clean, spreadsheet file that can be opened locally in Excel or imported into Google Sheets.
  - *Powering module:* `src/cli/export-excel.js`

- **Interactive mission control dashboard** (⭐ 🆕)
  - *Technical operation:* Compiles all database records and candidate verification metadata into a single self-contained HTML file. Includes dynamic client-side filtering, live countdown computation, timeline grouping, portal breakdown pills, and an `execCommand('copy')` clipboard fallback for local `file:///` security contexts.
  - *User experience:* Provides a dark-mode radar interface for filtering, searching, and inspecting jobs on desktop or mobile.
  - *Powering module:* `src/cli/dashboard.js` & `docs/index.html`

---

## 5. Architecture and project structure

### 5a. High-level architecture

GovScan AI operates as an autonomous data pipeline executed via Windows Task Scheduler. The pipeline ingests unstructured HTML/PDF notices from web sources, normalizes and extracts plain text, applies an LLM-based eligibility evaluator against a static candidate profile, and writes deduplicated records to an embedded SQLite database. Downstream consumers generate static HTML dashboards, multi-tab Excel reports, and filtered Telegram notifications.

### 5b. Project tree

```text
GovScan AI/
├── .env.example                     # Template for API tokens and chat identifiers
├── .gitignore                       # Excludes node_modules, .env, SQLite DB, notices, exports, and logs
├── DECISIONS.md                     # Architecture decision record log (D001 - D019)
├── NEEDS_FROM_USER.md               # User onboarding requirements checklist
├── package.json                     # Project manifest, dependencies, and npm scripts
├── package-lock.json                # Deterministic dependency lockfile
├── README.md                        # Production system documentation
├── STATE.md                         # Milestone tracking and development progress
├── config/
│   ├── profile.json                 # Candidate educational, demographic, and reservation parameters
│   ├── prompt.txt                   # Production Gemini prompt with few-shot Indian gov recruitment examples
│   ├── settings.json                # Operational quotas, domain filters, and keyword heuristics
│   └── sources.json                 # Portal watcher targets, aggregator indexers, and RSS feeds
├── data/
│   ├── .api_counter.json            # Rolling daily Gemini API request quota tracker
│   ├── dashboard.html               # Compiled client-side mission control dashboard
│   ├── exports/                     # Directory for generated .xlsx and .csv files (gitignored)
│   ├── govscan.sqlite               # Primary SQLite binary database file (gitignored)
│   └── notices/                     # Local cache of downloaded recruitment PDFs and notices (gitignored)
├── docs/
│   └── index.html                   # Web-hosted GitHub Pages deployment mirror of the dashboard
├── logs/
│   └── daily_YYYY-MM-DD.log         # Timestamped stdout/stderr log files for daily scheduled runs (gitignored)
├── scripts/
│   ├── setup-task-scheduler.bat     # Windows Task Scheduler registration script (Batch wrapper)
│   └── setup-task-scheduler.ps1     # Windows Task Scheduler registration script (PowerShell)
└── src/
    ├── cli/
    │   ├── add.js                   # CLI tool to download, evaluate, and save an arbitrary PDF/URL
    │   ├── check.js                 # CLI diagnostic dry-run checking tool without database mutations
    │   ├── daily-run.js             # 🌟 Master scheduler runner executing the complete end-to-end pipeline
    │   ├── dashboard.js             # Compiles SQLite database records into standalone dashboard.html
    │   ├── discover.js              # Runs discovery across watchers, aggregators, and RSS feeds
    │   ├── export-csv.js            # CLI utility exporting raw job database records to CSV format
    │   ├── export-excel.js          # CLI utility generating categorized 4-tab Excel spreadsheets
    │   └── reminders.js             # CLI deadline monitor (7-day/2-day countdowns) and weekly report
    └── core/
        ├── config.js                # Centralized configuration loader and directory resolver
        ├── database.js              # sql.js WASM SQLite initialization, schema, dedup, and date formatting
        ├── gemini.js                # Google Gemini API connector with fallback, retries, and token telemetry
        ├── pdf-handler.js           # Multi-format document downloader (SSL bypass) and text extractor
        ├── rss.js                   # Google Alerts RSS XML fetcher and redirect URL resolver
        ├── sarkari-result.js        # Sarkari Result aggregator index scraper and official link resolver
        ├── schema.js                # Strict JSON response validator and truncated array recovery parser
        ├── telegram.js              # Telegram Bot API client for HTML alerts, reports, and file uploads
        ├── verify.js                # Domain validation, corrigendum detection, and keyword heuristic filter
        └── watcher.js               # Career portal DOM parser and content hash change detection engine
```

### 5c. Directory and file roles

- `📁 config/`: Contains user-modifiable configuration files governing candidate attributes (`profile.json`), system prompts (`prompt.txt`), pipeline heuristics (`settings.json`), and monitored portal URLs (`sources.json`).
- `📁 data/`: Local operational data store containing SQLite binary files, downloaded notices cache, daily API quota counters, and exports.
- `📁 docs/`: Web bundle directory containing `index.html` configured for GitHub Pages static hosting.
- `📁 logs/`: Execution logs generated by scheduled runs, providing auditability for failures.
- `📁 scripts/`: Automation scripts registering the daily pipeline in Windows Task Scheduler.
- `📁 src/cli/`: Executable CLI command endpoints triggered via npm scripts or automated jobs.
- `📁 src/core/`: Reusable system logic covering database transactions, API clients, parsing algorithms, and heuristic filters.

### 5d. Deep dive: 6 core modules

#### 1. `src/cli/daily-run.js` (Master Pipeline Orchestrator)
- **Problem solved:** Sequences pipeline tasks every morning without manual intervention and alerts the candidate upon failures.
- **Key functions:** `runScript()`, `checkSourcesHealth()`, `main()`.
- **Connections:** Executes `src/cli/reminders.js`, `src/cli/discover.js`, `src/cli/dashboard.js`, `src/cli/export-excel.js`, and uses `src/core/telegram.js` to dispatch urgent error alerts and daily Excel workbooks.

#### 2. `src/core/database.js` (SQLite WASM Storage & Deduplication)
- **Problem solved:** Provides ACID persistence on Windows machines lacking Visual Studio C++ compilers and normalizes irregular Indian date strings into ISO format.
- **Key functions:** `getDB()`, `closeDB()`, `normalizeDateToISO()`, `formatDateToDisplay()`, `upsertJob()`, `queryJobs()`, `getStats()`.
- **Connections:** Powers all CLI commands and dashboards; implements unique constraint on `(organisation, advertisement_no, post_code)` to prevent duplicate job insertions.

#### 3. `src/core/gemini.js` (Eligibility Intelligence Client)
- **Problem solved:** Maps complex recruitment eligibility matrices against applicant qualifications, handling transient API outages and quota limits.
- **Key functions:** `checkEligibility()`, `canCallAPI()`, `getCounterStats()`, `recordAPICall()`.
- **Connections:** Invoked by `add.js`, `check.js`, and `discover.js`; consumes prompt templates and schemas from `config/prompt.txt` and `src/core/schema.js`.

#### 4. `src/core/telegram.js` (Actionable Notification Client)
- **Problem solved:** Delivers immediate, high-priority notifications and binary spreadsheets directly to the candidate's mobile device.
- **Key functions:** `sendMessage()`, `formatJobAlert()`, `sendJobAlert()`, `sendJobAlerts()`, `sendDocument()`, `sendDeadlineReminder()`, `sendWeeklyReport()`.
- **Connections:** Formats database records for mobile presentation and receives jobs from `discover.js`, `reminders.js`, and `daily-run.js`.

#### 5. `src/core/sarkari-result.js` (Aggregator Discovery Indexer)
- **Problem solved:** Converts third-party aggregator feeds into reliable official PDF discovery leads without relying on third-party eligibility summaries.
- **Key functions:** `fetchHtml()`, `extractOfficialLinksFromSarkariPage()`, `fetchSarkariResultNotices()`.
- **Connections:** Feeds verified direct PDF links into `src/cli/discover.js`, validating all entries through `src/core/verify.js`.

#### 6. `src/cli/dashboard.js` (Mission Control Compiler)
- **Problem solved:** Provides an offline, interactive interface to search, filter, and track applications without requiring a database server or active backend process.
- **Key functions:** `computeDaysLeft()`, `analyzeCandidateMatch()`, `getPortalSource()`, `generateDashboardHtml()`, `main()`.
- **Connections:** Ingests jobs from `src/core/database.js` and outputs standalone HTML to `data/dashboard.html` and `docs/index.html`.

---

## 6. State management and data flow

### State stores

1. **SQLite Database (`data/govscan.sqlite`):** Authoritative state store containing processed vacancies, evaluation metrics, application progress (`new`, `applying`, `applied`, `skipped`, `missed`), and watcher health records.
2. **Quota Tracker (`data/.api_counter.json`):** Tracks daily Gemini API requests (`calls`, `date`), auto-resetting every UTC calendar day.
3. **Client-Side State (`localStorage` & HTML memory):** `data/dashboard.html` parses database records into an in-memory JavaScript array (`allJobs`), maintaining active tab selection, portal filter state, search queries, and view mode toggles.

### End-to-end data flow: Scheduled daily run

```text
1. Windows Task Scheduler executes: npm run daily (at 08:30 AM IST)
2. src/cli/daily-run.js initializes daily log file: logs/daily_YYYY-MM-DD.log
3. src/cli/reminders.js checks database:
   └── Identifies deadlines <= 7 days and <= 2 days
   └── Sends HTML countdown reminder to Telegram via src/core/telegram.js
4. src/core/watcher.js checks career portals:
   └── Downloads HTML from ISRO, CDAC, NIELIT
   └── Computes SHA-256 hash of recruitment table content
   └── If hash differs from database, collects new notice anchor links
5. src/core/sarkari-result.js scrapes aggregator index:
   └── Fetches latestjob page, inspects top candidate links
   └── Extracts official .gov.in/PSU notification PDF and application portal URLs
6. src/cli/discover.js deduplicates candidates against existing URLs in SQLite:
   └── Downloads new notice documents via src/core/pdf-handler.js
   └── Extracts clean text using pdf-parse or mammoth
7. src/core/gemini.js evaluates notice:
   └── Evaluates text + profile.json against prompt.txt using gemini-3.5-flash-lite
   └── src/core/schema.js validates and salvages response JSON
8. src/core/database.js upserts post records:
   └── Normalizes dates to ISO YYYY-MM-DD
   └── Inserts records into 'jobs' table
9. src/core/telegram.js dispatches alerts:
   └── Filters: status is 'Eligible' or 'Manual Review' AND date is unexpired
   └── Sends actionable alerts with direct Apply Online and PDF links
10. src/cli/dashboard.js & export-excel.js refresh exports:
    └── Writes data/dashboard.html and docs/index.html
    └── Writes data/exports/GovScan_Job_Report_YYYY-MM-DD.xlsx
11. src/core/telegram.js sends binary .xlsx document directly to user's Telegram chat
12. Process exits with code 0; database connection cleanly closed
```

---

## 7. API reference

GovScan AI runs as a local batch automation client and does not expose inbound HTTP endpoints. It interfaces with external REST and Bot APIs as an outbound client:

### Outbound external APIs

| Host / Endpoint | Method | Transport / Format | Purpose |
| :--- | :--- | :--- | :--- |
| `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `POST` | HTTPS / JSON payload | Evaluates recruitment notices against profile parameters using Gemini AI models. |
| `https://api.telegram.org/bot{token}/sendMessage` | `POST` | HTTPS / JSON payload | Dispatches urgent notices, job alerts, countdown reminders, and weekly audit summaries. |
| `https://api.telegram.org/bot{token}/sendDocument` | `POST` | HTTPS / `multipart/form-data` | Transmits daily binary multi-tab `.xlsx` workbooks directly to the candidate's chat. |
| Monitored Government Portals & Aggregators | `GET` | HTTPS / HTML, PDF, XML | Ingests live career pages, RSS feeds, and notification documents. |

---

## 8. Browser APIs and technical highlights

### 8a. Native browser APIs in dashboard

| API | Implementation location | How used here | Why chosen |
| :--- | :--- | :--- | :--- |
| **Clipboard API (`navigator.clipboard`)** | `data/dashboard.html` / `src/cli/dashboard.js` | Copies formatted job summaries (including Advt No and Post Code) to clipboard. | Modern asynchronous clipboard access with standard promise interface. |
| **Document ExecCommand Fallback (`document.execCommand('copy')`)** | `data/dashboard.html` / `src/cli/dashboard.js` | Fallback copy mechanism creating a temporary off-screen `<textarea>`. | Ensures copy functionality continues to operate on non-secure origins and local `file:///` protocols where `navigator.clipboard` is restricted by browser security policies. |
| **DOM Custom Event Handlers** | `data/dashboard.html` / `src/cli/dashboard.js` | Real-time reactive filtering across tabs, search input fields, and portal selector pills. | Provides instantaneous client-side searching across hundreds of records without page reloads. |

### 8b. External libraries & sample usage

#### 1. `sql.js` (Database WASM engine)
Initialized asynchronously from binary buffer; persists data by exporting the internal database array back to disk:
```javascript
import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const db = fs.existsSync(DB_PATH) 
  ? new SQL.Database(fs.readFileSync(DB_PATH)) 
  : new SQL.Database();

// Execute query and commit back to disk
db.run("INSERT INTO jobs (organisation, post_name) VALUES (?, ?)", [org, post]);
const data = db.export();
fs.writeFileSync(DB_PATH, Buffer.from(data));
```

#### 2. `pdf-parse` (Local text extraction)
Extracts raw text strings from binary PDF buffers:
```javascript
import pdfParse from 'pdf-parse';

const parsed = await pdfParse(pdfBuffer);
console.log(`Extracted ${parsed.text.length} characters across ${parsed.numpages} pages.`);
```

#### 3. `@google/generative-ai` (Gemini API client)
Configures system instructions and calls generation models:
```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
const result = await model.generateContent([promptText, noticeText]);
const responseText = result.response.text();
```

### 8c. Performance optimizations

- **Text-First Extraction Pipeline:** PDFs are processed locally with `pdf-parse`. Sending extracted text to Gemini instead of raw base64 page images reduces request payload size from ~15 MB down to ~40 KB, cutting network transfer times by 95% and eliminating API 503 timeout errors.
- **Word-Boundary Heuristic Filtering:** Pre-filters titles using regular expressions (`\bresults?\b`) before issuing HTTP requests or AI checks, preventing API consumption on tender notices, exam results, and admit cards.
- **Selective Telegram Transmission:** Alerts are pre-filtered to send only `Eligible` or `Manual Review` posts that are unexpired, minimizing Telegram API round-trips and keeping messaging queues clean.

---

## 9. Getting started

### Prerequisites

- **Node.js:** `v20.0.0` or higher (`node -v`)
- **npm:** `v9.0.0` or higher (`npm -v`)
- **Git:** Installed on local machine (`git --version`)
- **Google Gemini API Key:** Free tier key obtained from [Google AI Studio](https://aistudio.google.com/)
- **Telegram Bot Token & Chat ID:** Bot created via [@BotFather](https://t.me/BotFather); numeric chat ID retrieved via [@userinfobot](https://t.me/userinfobot)

### Installation steps

1. **Clone the repository:**
   ```powershell
   git clone https://github.com/itsrajaniket/GovScan-AI.git
   cd "GovScan AI"
   ```

2. **Install project dependencies:**
   ```powershell
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```
   Open `.env` and provide your real API keys and identifiers.

### Environment variables reference

| Variable | Required | Description | Example (Placeholder) |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Yes | Google AI Studio API key used for eligibility checks. | `AIzaSyD-placeholder-key-example` |
| `GEMINI_MODEL` | Yes | Primary model name for text evaluation. | `gemini-3.5-flash-lite` |
| `GEMINI_DAILY_LIMIT` | Yes | Maximum allowed API calls per UTC calendar day. | `1400` |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API token generated by @BotFather. | `1234567890:ABCdefGhIJKlmNoPQRstuvwx` |
| `TELEGRAM_CHAT_ID` | Yes | Target Telegram user or channel numeric chat ID. | `987654321` |

### Running the application

- **Execute complete daily pipeline:**
  ```powershell
  npm run daily
  ```
- **Execute discovery only:**
  ```powershell
  npm run discover
  ```
- **Generate and open local dashboard:**
  ```powershell
  npm run dashboard -- --open
  ```
- **Export multi-tab Excel spreadsheet:**
  ```powershell
  npm run excel
  ```

### Verifying correct operation

1. Run the test check against a sample notice:
   ```powershell
   npm run check -- https://www.isro.gov.in/Careers.html
   ```
2. Terminal should print `📊 API calls today: X/1400`, identify vacancy items, output validated post evaluation JSON, and report zero uncaught errors.
3. Check `data/dashboard.html` to confirm it opens in your default browser with populated job cards.

---

## 10. Scripts reference

| Script | Command | What it does |
| :--- | :--- | :--- |
| `daily` | `node src/cli/daily-run.js` | Runs master automated routine: reminders, health checks, discovery, evaluation, alerts, dashboard refresh, and Excel export. |
| `discover` | `node src/cli/discover.js` | Runs discovery across enabled watchers, aggregators, and RSS feeds, downloading and processing new notices. |
| `dashboard` | `node src/cli/dashboard.js` | Compiles current SQLite records into `data/dashboard.html`. Pass `-- --open` to launch in browser. |
| `excel` | `node src/cli/export-excel.js` | Generates categorized 4-tab Excel workbook at `data/exports/GovScan_Job_Report_YYYY-MM-DD.xlsx`. |
| `check` | `node src/cli/check.js` | Diagnostic dry-run tool evaluating a PDF path or URL against profile without saving to database. |
| `add` | `node src/cli/add.js` | Manually ingests, evaluates, stores, and alerts on a specific PDF path or URL. |
| `reminders` | `node src/cli/reminders.js` | Audits upcoming deadlines (7-day/2-day alerts) and sends weekly Sunday summary reports. |
| `export` | `node src/cli/export-csv.js` | Exports current SQLite database table records into CSV format inside `data/exports/`. |

---

## 11. Configuration and customization

### 1. Update candidate educational profile
**File:** `config/profile.json`

To change or add degrees, edit the `degrees` array:
```json
// Before
{
  "name": "Candidate",
  "degrees": [
    { "title": "B.Sc Physics", "year": 2019, "percentage": 63.13 }
  ]
}

// After
{
  "name": "Candidate",
  "degrees": [
    { "title": "B.Sc (Hons) Physics", "year": 2019, "percentage": 63.13 },
    { "title": "M.Sc Electronics & Communication", "year": 2021, "percentage": 78.88 },
    { "title": "MCA", "year": 2027, "status": "pursuing" }
  ]
}
```

### 2. Configure monitored career portals
**File:** `config/sources.json`

To activate or adjust a portal watcher, toggle the `enabled` boolean and verify the CSS selector:
```json
// Before
{
  "id": "cdac",
  "name": "CDAC",
  "career_url": "TO_BE_VERIFIED",
  "enabled": false
}

// After
{
  "id": "cdac",
  "name": "CDAC Careers Direct",
  "career_url": "https://careers.cdac.in/",
  "css_selector": "table, .career-content, main",
  "enabled": true
}
```

### 3. Adjust daily API limits and alert thresholds
**File:** `config/settings.json`

Modify operational safety thresholds and Telegram alert behaviors:
```json
// Before
{
  "gemini": {
    "daily_limit": 1000
  }
}

// After
{
  "gemini": {
    "daily_limit": 1400,
    "request_delay_ms": 4000
  },
  "telegram": {
    "alert_tiers": [1, 2, 3],
    "alert_manual_review": true
  }
}
```

---

## 12. Known limitations and troubleshooting

### Known limitations

- **Client PC Uptime:** Scheduled daily runs require the Windows host machine to be powered on or in sleep mode with wake timers enabled at the designated runtime (08:30 AM). If powered down, the task executes upon subsequent system startup.
- **Scanned Image PDFs:** Image-only scanned PDFs requiring OCR consume higher API processing allowances than clean digital text documents.
- **Complex Equivalence Clauses:** Equivalence of specialized postgraduate qualifications (e.g. M.Sc Electronics vs. B.Tech ECE) is marked as `Manual Review` for user confirmation when notices do not explicitly state equivalence policies.

### Troubleshooting guide

| Error / Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| `FetchError: certificate has expired / unable to verify` | Indian government portal uses custom, self-signed, or outdated SSL certificate authorities. | Ensure `rejectUnauthorized: false` is enabled on the HTTPS agent in `src/core/pdf-handler.js` and `src/core/sarkari-result.js`. |
| `GoogleGenerativeAI Error: 503 Service Unavailable` | Google Gemini model experiencing transient load spikes. | The system automatically applies exponential backoff and cascades from `gemini-3.5-flash-lite` to `gemini-3.5-flash`. If repeated, wait 5 minutes and re-run. |
| `Telegram API error: 400 Bad Request: can't parse entities` | HTML alert text contains unescaped characters (`<`, `>`, `&`). | Ensure strings pass through `escHtml()` in `src/core/telegram.js` prior to message assembly. |
| `Daily Gemini API call limit reached (1400)` | Counter in `data/.api_counter.json` reached the configured safety ceiling. | The counter resets automatically at 00:00 UTC. To increase safety headroom, adjust `GEMINI_DAILY_LIMIT` in `.env`. |
| `Windows Task Scheduler task did not execute` | Machine was asleep on battery power without battery run policies enabled. | Re-register task using `scripts/setup-task-scheduler.ps1` to ensure `-AllowStartIfOnBatteries` and `-DontStopIfGoingOnBatteries` flags are set. |

---

## 13. Security and privacy

- **Identity & Sensitive Information:** GovScan AI **never** collects, processes, or stores government identification numbers (such as Aadhaar, PAN, Passport, or Voter ID numbers), personal residential addresses, financial data, or portal login credentials.
- **Local Secret Isolation:** Application tokens (`GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), SQLite database files (`*.sqlite`), downloaded notices (`data/notices/`), and execution logs are explicitly registered in `.gitignore` and **never transmitted to GitHub**.
- **Respectful Ingestion Policy:** Web scrapers enforce polite request headers (`Mozilla/5.0 User-Agent`), minimum inter-request delays (1,000 ms to 3,000 ms), and local SHA-256 caching to prevent redundant bandwidth consumption on public infrastructure servers.

---

## 14. Roadmap

- [x] Phase 0: Project setup, directory architecture, and configuration schemas
- [x] Phase 1: Gemini eligibility checking engine with few-shot Indian recruitment prompt
- [x] Phase 2: Embedded SQLite persistence via sql.js WASM, schema design, and CSV export
- [x] Phase 3: DOM watcher hashing, Google Alerts RSS parser, and Sarkari Result indexer
- [x] Phase 4: Windows Task Scheduler automation, deadline countdown alerts, and health monitors
- [x] Phase 5.1: Categorized multi-tab Excel workbook generation (`xlsx`)
- [x] Phase 5.2: Real-time interactive mission control dashboard with countdowns and portal filters
- [x] Phase 5.3: Automated Telegram binary document delivery and GitHub Pages web deployment
- [ ] Phase 6.1: Direct Google Sheets API bidirectional synchronization
- [ ] Phase 6.2: Expansion of verified portal watchers to 25+ central agencies (DRDO, BEL, CSIR, BIS)
- [ ] Phase 6.3: Webhook notifications support for Discord and Slack channels

---

## 15. Contributing

Contributions to enhance portal coverage, keyword heuristics, or parser resilience are welcome:

1. **Fork** the repository on GitHub.
2. Create a dedicated feature or bugfix branch:
   ```powershell
   git checkout -b feature/portal-drdo-watcher
   ```
3. Commit your changes with descriptive commit messages:
   ```powershell
   git commit -m "feat: add DRDO CEPTAM career page watcher and parser"
   ```
4. Push your branch to your remote fork:
   ```powershell
   git push origin feature/portal-drdo-watcher
   ```
5. Submit a **Pull Request** explaining the portal updates, selectors, and test results.

---

## 16. License

This project is released under the **MIT License** (2026). You are free to inspect, modify, fork, and adapt this software for personal and private recruitment automation.
