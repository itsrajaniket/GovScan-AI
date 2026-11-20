// src/cli/dashboard.js
// Generates a self-contained interactive local HTML dashboard to filter and inspect jobs.
// Usage: node src/cli/dashboard.js [--open]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { queryJobs, getStats, closeDB, formatDateToDisplay } from '../core/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

function computeDaysLeft(isoDate) {
  if (!isoDate || isoDate === 'not stated') return null;
  try {
    const [yyyy, mm, dd] = isoDate.split('-').map(Number);
    const deadline = new Date(yyyy, mm - 1, dd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

async function generateDashboardHtml(jobs, stats) {
  // Augment jobs with display fields and days left
  const enrichedJobs = jobs.map(j => {
    const daysLeft = computeDaysLeft(j.last_date);
    return {
      ...j,
      display_last_date: formatDateToDisplay(j.last_date),
      display_age_cutoff: formatDateToDisplay(j.age_cutoff_date),
      days_left: daysLeft,
      is_urgent: daysLeft !== null && daysLeft >= 0 && daysLeft <= 2,
      is_expiring_soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 7,
      is_expired: daysLeft !== null && daysLeft < 0,
    };
  });

  const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GovScan AI — Personal Job Radar</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --card-hover: #162032;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --tier1: #10b981;
      --tier2: #3b82f6;
      --tier3: #f59e0b;
      --tier4: #ef4444;
      --badge-eligible: #059669;
      --badge-review: #d97706;
      --badge-not-eligible: #dc2626;
      --tag-bg: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .brand .subtitle { color: var(--text-muted); font-size: 13px; margin-top: 2px; }
    .timestamp { font-size: 12px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .stat-card:hover { transform: translateY(-2px); border-color: #374151; }
    .stat-label { font-size: 13px; color: var(--text-muted); font-weight: 500; }
    .stat-val { font-size: 28px; font-weight: 700; color: #fff; }
    .stat-val.t1 { color: var(--tier1); }
    .stat-val.review { color: var(--badge-review); }
    .stat-val.urgent { color: #f87171; }

    /* Category Tabs */
    .category-tabs {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .cat-tab {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .cat-tab:hover { background: var(--card-hover); color: #fff; border-color: #3b82f6; }
    .cat-tab.active {
      background: #1e3a8a;
      border-color: #3b82f6;
      color: #fff;
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
    }
    .tab-count {
      background: rgba(0,0,0,0.4);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Filter Controls */
    .controls {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .search-box {
      flex: 1 1 260px;
      position: relative;
    }
    .search-box input {
      width: 100%;
      background: #0f172a;
      border: 1px solid #334155;
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
    }
    .search-box input:focus { border-color: var(--primary); }
    .filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    select {
      background: #0f172a;
      border: 1px solid #334155;
      color: #fff;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }
    select:focus { border-color: var(--primary); }
    .btn {
      background: var(--primary);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-outline {
      background: transparent;
      border: 1px solid #334155;
      color: var(--text);
    }
    .btn-outline:hover { background: #1e293b; }

    /* Job Cards List */
    .jobs-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .job-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      position: relative;
    }
    .job-card:hover { border-color: #38bdf8; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .job-card.tier-1 { border-left: 4px solid var(--tier1); }
    .job-card.tier-2 { border-left: 4px solid var(--tier2); }
    .job-card.tier-3 { border-left: 4px solid var(--tier3); }
    .job-card.tier-4 { border-left: 4px solid var(--tier4); }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .post-info { flex: 1 1 300px; }
    .org-title {
      font-size: 13px;
      text-transform: uppercase;
      font-weight: 600;
      color: #38bdf8;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .post-name {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .advt-code {
      font-size: 12px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      margin-top: 4px;
    }

    .badges {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-t1 { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-t2 { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge-t3 { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-t4 { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }

    .badge-eligible { background: rgba(5, 150, 105, 0.25); color: #10b981; border: 1px solid #10b981; }
    .badge-review { background: rgba(217, 119, 6, 0.25); color: #f59e0b; border: 1px solid #f59e0b; }
    .badge-not-eligible { background: rgba(220, 38, 38, 0.25); color: #ef4444; border: 1px solid #ef4444; }

    /* Metadata pills row */
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 13px;
      color: #cbd5e1;
      margin: 12px 0;
      padding: 10px 0;
      border-top: 1px solid #1e293b;
      border-bottom: 1px solid #1e293b;
    }
    .meta-item { display: flex; align-items: center; gap: 6px; }
    .meta-item strong { color: #fff; }
    .deadline-urgent { color: #f87171; font-weight: 700; }
    .deadline-active { color: #34d399; font-weight: 600; }
    .deadline-expired { color: #64748b; text-decoration: line-through; }

    .flags-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    .flag-tag {
      background: #1e1b4b;
      border: 1px solid #4338ca;
      color: #a5b4fc;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
    }

    .accordion-btn {
      background: none;
      border: none;
      color: #38bdf8;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 6px;
      padding: 0;
    }
    .accordion-btn:hover { text-decoration: underline; }
    .accordion-content {
      display: none;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 14px;
      margin-top: 10px;
      font-size: 13px;
    }
    .accordion-content.show { display: block; }
    .clause-box {
      font-style: italic;
      color: #93c5fd;
      border-left: 3px solid var(--primary);
      padding-left: 12px;
      margin-bottom: 10px;
    }
    .reasoning-box { color: #cbd5e1; line-height: 1.6; }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 14px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .links-group { display: flex; gap: 10px; }
    .link-btn {
      font-size: 12px;
      font-weight: 600;
      color: #60a5fa;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: #1e293b;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .link-btn:hover { background: #334155; color: #fff; }

    .no-results {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
      background: var(--card-bg);
      border-radius: 12px;
      border: 1px dashed var(--card-border);
    }
    .counter-tag {
      font-size: 13px;
      color: var(--text-muted);
      margin-left: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div>
          <h1>🛰️ GovScan AI</h1>
          <div class="subtitle">Personal Government Job Radar & Eligibility Dashboard</div>
        </div>
      </div>
      <div class="timestamp">Generated: ${generatedAt}</div>
    </header>

    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Total Jobs Detected</span>
        <span class="stat-val" id="stat-total">${stats.total}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">🟢 Tier 1 Relevant</span>
        <span class="stat-val t1" id="stat-t1">${stats.byTier[1] || 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">✅ Eligible Posts</span>
        <span class="stat-val" style="color:#10b981;" id="stat-eligible">${stats.byStatus['Eligible'] || 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">🔍 Manual Review Pending</span>
        <span class="stat-val review" id="stat-review">${stats.byStatus['Manual Review'] || 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">⏰ Deadlines in 7 Days</span>
        <span class="stat-val urgent" id="stat-urgent">0</span>
      </div>
    </div>

    <!-- 1-Click Quick Category Switcher Tabs -->
    <div class="category-tabs">
      <button class="cat-tab active" id="tab-ready" onclick="selectCategoryTab('ready_to_apply', this)">
        🟢 Where I Can Apply (Open & Eligible) <span class="tab-count" id="count-ready">0</span>
      </button>
      <button class="cat-tab" id="tab-review" onclick="selectCategoryTab('manual_review', this)">
        🔍 Needs Manual Review <span class="tab-count" id="count-review">0</span>
      </button>
      <button class="cat-tab" id="tab-expired" onclick="selectCategoryTab('expired', this)">
        ⏰ Expired / Closed Deadlines <span class="tab-count" id="count-expired">0</span>
      </button>
      <button class="cat-tab" id="tab-all" onclick="selectCategoryTab('all', this)">
        📁 Full Archive (All Posts) <span class="tab-count" id="count-all">0</span>
      </button>
    </div>

    <!-- Filter & Search Controls -->
    <div class="controls">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search post, org, advt, skill, location...">
      </div>

      <div class="filter-group">
        <select id="tierFilter">
          <option value="all">All Tiers</option>
          <option value="1">🟢 Tier 1 (Exact Match)</option>
          <option value="2">🔵 Tier 2 (Technical/Equivalent)</option>
          <option value="3">🟡 Tier 3 (Any Graduate)</option>
          <option value="4">🔴 Tier 4 (Unrelated)</option>
        </select>

        <select id="statusFilter">
          <option value="all">All Eligibility</option>
          <option value="Eligible">✅ Eligible</option>
          <option value="Manual Review">🔍 Manual Review</option>
          <option value="Not Eligible">❌ Not Eligible</option>
        </select>

        <select id="deadlineFilter">
          <option value="all">All Deadlines</option>
          <option value="soon">⏰ Expiring Soon (&le; 7 days)</option>
          <option value="active">Active (Not Expired)</option>
          <option value="expired">Expired</option>
        </select>

        <select id="sortOrder">
          <option value="tier_asc">Sort: Tier (1 &rarr; 4)</option>
          <option value="deadline_asc">Sort: Deadline (Earliest)</option>
          <option value="newest">Sort: Newest First</option>
          <option value="org_asc">Sort: Organization (A-Z)</option>
        </select>

        <button class="btn btn-outline" id="exportBtn" onclick="exportExcel()">📥 Export Multi-Tab Excel</button>
        <button class="btn btn-outline" id="exportCsvBtn" onclick="exportFilteredCsv()">📄 CSV</button>
      </div>

      <span class="counter-tag" id="visibleCounter">Showing ${enrichedJobs.length} jobs</span>
    </div>

    <!-- Jobs Cards Container -->
    <div class="jobs-list" id="jobsList"></div>
  </div>

  <script>
    const allJobs = ${JSON.stringify(enrichedJobs)};
    let activeCategory = 'ready_to_apply';

    // Calculate category counts
    const readyJobs = allJobs.filter(j => j.status === 'Eligible' && !j.is_expired);
    const reviewJobs = allJobs.filter(j => j.status === 'Manual Review' && !j.is_expired);
    const expiredJobs = allJobs.filter(j => j.is_expired);

    document.getElementById('count-ready').innerText = readyJobs.length;
    document.getElementById('count-review').innerText = reviewJobs.length;
    document.getElementById('count-expired').innerText = expiredJobs.length;
    document.getElementById('count-all').innerText = allJobs.length;

    // Calculate urgent count
    const urgentCount = allJobs.filter(j => j.is_expiring_soon).length;
    document.getElementById('stat-urgent').innerText = urgentCount;

    function selectCategoryTab(category, btn) {
      activeCategory = category;
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      filterJobs();
    }

    function renderJobs(jobs) {
      const list = document.getElementById('jobsList');
      const counter = document.getElementById('visibleCounter');
      counter.innerText = 'Showing ' + jobs.length + ' of ' + allJobs.length + ' jobs';

      if (jobs.length === 0) {
        list.innerHTML = '<div class="no-results"><h3>No matching jobs found</h3><p style="margin-top:6px;">Try clearing filters or search terms.</p></div>';
        return;
      }

      list.innerHTML = jobs.map(job => {
        const tierClass = 'tier-' + job.tier;
        const tierBadgeClass = 'badge-t' + job.tier;
        const statusBadgeClass = job.status === 'Eligible' ? 'badge-eligible' : (job.status === 'Manual Review' ? 'badge-review' : 'badge-not-eligible');

        let deadlineBadge = '';
        if (job.last_date) {
          if (job.is_expired) {
            deadlineBadge = '<span class="deadline-expired">Expired: ' + job.display_last_date + '</span>';
          } else if (job.is_urgent) {
            deadlineBadge = '<span class="deadline-urgent">🚨 ' + job.display_last_date + ' (' + (job.days_left === 0 ? 'TODAY!' : job.days_left + ' days left') + ')</span>';
          } else {
            deadlineBadge = '<span class="deadline-active">⏰ ' + job.display_last_date + ' (' + job.days_left + ' days left)</span>';
          }
        } else {
          deadlineBadge = '<span>No deadline specified</span>';
        }

        const flagsHtml = (job.flags && job.flags.length > 0)
          ? '<div class="flags-row">' + job.flags.map(f => '<span class="flag-tag">⚠️ ' + f + '</span>').join('') + '</div>'
          : '';

        return \`
          <div class="job-card \${tierClass}">
            <div class="card-header">
              <div class="post-info">
                <div class="org-title">\${escapeHtml(job.organisation)}</div>
                <div class="post-name">\${escapeHtml(job.post_name)}</div>
                \${job.advertisement_no ? \`<div class="advt-code">Advt: \${escapeHtml(job.advertisement_no)} \${job.post_code ? ' | Post Code: ' + escapeHtml(job.post_code) : ''}</div>\` : ''}
              </div>
              <div class="badges">
                <span class="badge \${tierBadgeClass}">Tier \${job.tier}</span>
                <span class="badge \${statusBadgeClass}">\${job.status}</span>
              </div>
            </div>

            <div class="meta-row">
              \${job.pay ? \`<div class="meta-item">💰 <strong>\${escapeHtml(job.pay)}</strong> (\${escapeHtml(job.employment_type || 'N/A')})</div>\` : ''}
              \${job.location ? \`<div class="meta-item">📍 <strong>\${escapeHtml(job.location)}</strong></div>\` : ''}
              \${job.vacancies_count ? \`<div class="meta-item">👥 Vacancies: <strong>\${job.vacancies_count}</strong></div>\` : ''}
              <div class="meta-item">📅 Last Date: \${deadlineBadge}</div>
              \${job.max_age_for_my_category ? \`<div class="meta-item">🎂 Max Age (OBC): <strong>\${job.max_age_for_my_category} yrs</strong></div>\` : ''}
            </div>

            \${flagsHtml}

            <button class="accordion-btn" onclick="toggleDetails(this)">
              <span>▶ Details & Reasoning</span>
            </button>
            <div class="accordion-content">
              \${job.qualification_clause ? \`<div class="clause-box"><strong>Qualification Clause (Page \${job.page_number || 'N/A'}):</strong><br>"\${escapeHtml(job.qualification_clause)}"</div>\` : ''}
              \${job.reasoning ? \`<div class="reasoning-box"><strong>Gemini Assessment:</strong><br>\${escapeHtml(job.reasoning)}</div>\` : ''}
            </div>

            <div class="card-footer">
              <div class="links-group">
                \${job.official_notification_url ? \`<a href="\${job.official_notification_url}" target="_blank" class="link-btn">📄 Official Notice</a>\` : ''}
                \${job.official_apply_url ? \`<a href="\${job.official_apply_url}" target="_blank" class="link-btn">🔗 Apply Portal</a>\` : ''}
              </div>
              <div style="font-size:12px; color:var(--text-muted);">
                First Detected: \${job.date_first_detected || 'N/A'}
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function toggleDetails(btn) {
      const content = btn.nextElementSibling;
      const isOpen = content.classList.contains('show');
      content.classList.toggle('show');
      btn.querySelector('span').innerText = isOpen ? '▶ Details & Reasoning' : '▼ Hide Details';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function filterJobs() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      const tier = document.getElementById('tierFilter').value;
      const status = document.getElementById('statusFilter').value;
      const deadline = document.getElementById('deadlineFilter').value;
      const sort = document.getElementById('sortOrder').value;

      let filtered = allJobs.filter(j => {
        // Category Tab Filter
        if (activeCategory === 'ready_to_apply') {
          if (j.status !== 'Eligible' || j.is_expired) return false;
        } else if (activeCategory === 'manual_review') {
          if (j.status !== 'Manual Review' || j.is_expired) return false;
        } else if (activeCategory === 'expired') {
          if (!j.is_expired) return false;
        }

        // Search
        if (q) {
          const hay = (
            (j.post_name || '') + ' ' +
            (j.organisation || '') + ' ' +
            (j.advertisement_no || '') + ' ' +
            (j.location || '') + ' ' +
            (j.qualification_clause || '') + ' ' +
            (j.reasoning || '')
          ).toLowerCase();
          if (!hay.includes(q)) return false;
        }

        // Tier
        if (tier !== 'all' && String(j.tier) !== tier) return false;

        // Status
        if (status !== 'all' && j.status !== status) return false;

        // Deadline
        if (deadline === 'soon' && !j.is_expiring_soon) return false;
        if (deadline === 'active' && j.is_expired) return false;
        if (deadline === 'expired' && !j.is_expired) return false;

        return true;
      });

      // Sort
      filtered.sort((a, b) => {
        if (sort === 'tier_asc') return (a.tier || 9) - (b.tier || 9);
        if (sort === 'deadline_asc') {
          const dA = a.days_left !== null ? a.days_left : 99999;
          const dB = b.days_left !== null ? b.days_left : 99999;
          return dA - dB;
        }
        if (sort === 'newest') return (b.id || 0) - (a.id || 0);
        if (sort === 'org_asc') return (a.organisation || '').localeCompare(b.organisation || '');
        return 0;
      });

      renderJobs(filtered);
    }

    function exportExcel() {
      window.location.href = '../exports/GovScan_Job_Report_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    }

    function exportFilteredCsv() {
      window.location.href = '../exports/govscan_export_' + new Date().toISOString().slice(0, 10) + '.csv';
    }

    document.getElementById('searchInput').addEventListener('input', filterJobs);
    document.getElementById('tierFilter').addEventListener('change', filterJobs);
    document.getElementById('statusFilter').addEventListener('change', filterJobs);
    document.getElementById('deadlineFilter').addEventListener('change', filterJobs);
    document.getElementById('sortOrder').addEventListener('change', filterJobs);

    // Initial render
    filterJobs();
  </script>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldOpen = args.includes('--open');

  console.log('🖥️  GovScan AI — Dashboard Generator\n');

  const jobs = await queryJobs();
  const stats = await getStats();

  const html = await generateDashboardHtml(jobs, stats);
  const outputPath = path.join(ROOT, 'data', 'dashboard.html');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');

  console.log(`✅ Dashboard generated successfully!`);
  console.log(`📂 Location: ${outputPath}`);
  console.log(`📊 Included: ${jobs.length} jobs`);

  if (shouldOpen) {
    console.log(`🌐 Opening dashboard in browser...`);
    if (process.platform === 'win32') {
      exec(`start "" "${outputPath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${outputPath}"`);
    } else {
      exec(`xdg-open "${outputPath}"`);
    }
  }

  closeDB();
}

main().catch(err => {
  console.error(`❌ Dashboard error: ${err.message}`);
  process.exit(1);
});
