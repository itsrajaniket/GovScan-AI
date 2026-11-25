// src/cli/dashboard.js
// Generates a self-contained interactive local HTML dashboard to filter, track, and inspect jobs.
// Upgraded with:
// 1. Real-Time Live Countdown & Deadline Action Center (Timeline view & Priority banner)
// 2. Candidate Match Visualizer (Why You Qualify: Degree, Age with OBC relaxation, Experience/Freshers)
// 3. Interactive Portal / Source Breakdown Bar (ISRO, Sarkari Result Indexer, CDAC, etc.)
// 4. 1-Click Action Hub (Direct Apply, Official Notice, Copy Summary)
//
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

/**
 * Determine candidate qualification match chips based on job data and profile.
 */
function analyzeCandidateMatch(job) {
  const text = `${job.post_name || ''} ${job.qualification_clause || ''} ${job.reasoning || ''}`.toLowerCase();
  
  // 1. Degree Match
  let degreeMatch = 'Graduate / Relevant Degree';
  let degreeConfidence = 'medium';
  if (text.includes('electronics') || text.includes('ece') || text.includes('communication')) {
    degreeMatch = '🎓 M.Sc Electronics & Comm (78.9%)';
    degreeConfidence = 'high';
  } else if (text.includes('physics')) {
    degreeMatch = '🎓 B.Sc (Hons) Physics (63.1%)';
    degreeConfidence = 'high';
  } else if (text.includes('computer') || text.includes('mca') || text.includes('it') || text.includes('software')) {
    degreeMatch = '🎓 PGDCA / MCA (Pursuing)';
    degreeConfidence = 'medium';
  } else if (job.tier === 3) {
    degreeMatch = '🎓 Any Graduate (B.Sc / M.Sc)';
    degreeConfidence = 'high';
  }

  // 2. Age Check (DOB 23-03-1999 -> Current Age: 27)
  const candidateAge = 27;
  let ageMatch = '🎂 Age 27 (OBC-NCL Relaxed)';
  let ageEligible = true;
  if (job.max_age_for_my_category) {
    const maxAge = Number(job.max_age_for_my_category);
    if (!isNaN(maxAge)) {
      if (candidateAge <= maxAge) {
        ageMatch = `🎂 Age 27 / Max ${maxAge} (OBC +3y Eligible)`;
        ageEligible = true;
      } else {
        ageMatch = `🎂 Age 27 > Max ${maxAge} (Exceeded)`;
        ageEligible = false;
      }
    }
  }

  // 3. Experience Check
  const flags = Array.isArray(job.flags) ? job.flags : (typeof job.flags === 'string' ? JSON.parse(job.flags || '[]') : []);
  const needsExp = flags.includes('experience_required') || text.includes('years experience') || text.includes('minimum experience');
  const expMatch = needsExp ? '⚠️ Experience Proof Needed' : '💼 Freshers OK (0 Yrs Exp)';

  // 4. Equivalence / Review Note
  let reviewNote = null;
  if (job.status === 'Manual Review') {
    if (text.includes('b.e') || text.includes('b.tech')) {
      reviewNote = '🔍 Check if M.Sc Electronics is accepted equivalent to B.Tech ECE';
    } else if (text.includes('mca')) {
      reviewNote = '🔍 Lateral Entry MCA status / Final year check';
    } else {
      reviewNote = '🔍 Review notification qualification clause carefully';
    }
  }

  return {
    degreeMatch,
    degreeConfidence,
    ageMatch,
    ageEligible,
    expMatch,
    needsExp,
    reviewNote,
  };
}

/**
 * Identify discovery portal and source name for a job.
 */
function getPortalSource(job) {
  if (job.source_type === 'aggregator_official_pdf') {
    const url = (job.official_notification_url || '').toLowerCase();
    const org = (job.organisation || '').toLowerCase();
    if (job.source_id === 'freejobalert' || url.includes('freejobalert')) {
      return { id: 'freejobalert', name: 'FreeJobAlert Indexer', icon: '🔔' };
    }
    if (job.source_id === 'indgovtjobs' || url.includes('indgovtjobs')) {
      return { id: 'indgovtjobs', name: 'IndGovtJobs M.Sc Feed', icon: '📑' };
    }
    return { id: 'sarkari_result', name: 'Sarkari Result Indexer', icon: '📰' };
  }

  const url = (job.official_notification_url || '').toLowerCase();
  const org = (job.organisation || '').toLowerCase();

  if (url.includes('rac.gov.in') || url.includes('drdo.gov.in') || org.includes('drdo') || org.includes('rac') || org.includes('ceptam')) {
    return { id: 'drdo', name: 'DRDO / RAC Recruitment', icon: '🛡️' };
  }
  if (url.includes('ecil.co.in') || org.includes('ecil') || org.includes('electronics corporation of india')) {
    return { id: 'ecil', name: 'ECIL Hyderabad', icon: '⚡' };
  }
  if (url.includes('bel-india.in') || org.includes('bharat electronics') || org.includes(' bel ')) {
    return { id: 'bel', name: 'Bharat Electronics (BEL)', icon: '📻' };
  }
  if (url.includes('aai.aero') || org.includes('airports authority') || org.includes(' aai ')) {
    return { id: 'aai', name: 'Airports Authority of India (AAI)', icon: '✈️' };
  }
  if (url.includes('sameer.gov.in') || org.includes('sameer')) {
    return { id: 'sameer', name: 'SAMEER Microwave Lab', icon: '🔬' };
  }
  if (url.includes('barc.gov.in') || org.includes('bhabha atomic') || org.includes('barc') || org.includes('dae')) {
    return { id: 'barc', name: 'BARC / Atomic Energy', icon: '⚛️' };
  }
  if (url.includes('ceeri.res.in') || org.includes('ceeri') || org.includes('csir')) {
    return { id: 'csir', name: 'CSIR Electronics Labs', icon: '🧪' };
  }
  if (url.includes('ncs.gov.in') || org.includes('national career service') || org.includes(' ncs ')) {
    return { id: 'ncs', name: 'NCS Central Portal', icon: '🏛️' };
  }
  if (url.includes('isro.gov.in') || org.includes('isro') || org.includes('shar') || org.includes('ursc') || org.includes('istrac') || org.includes('lpsc') || org.includes('sac') || org.includes('hsfc')) {
    return { id: 'isro', name: 'ISRO Careers Portal', icon: '🚀' };
  }
  if (url.includes('cdac.in') || org.includes('cdac')) {
    return { id: 'cdac', name: 'CDAC Careers', icon: '💻' };
  }
  if (url.includes('nielit') || org.includes('nielit')) {
    return { id: 'nielit', name: 'NIELIT Portal', icon: '⚡' };
  }
  if (url.includes('ssc.gov.in') || org.includes('staff selection')) {
    return { id: 'ssc', name: 'SSC Selection Posts', icon: '📝' };
  }

  return { id: 'other', name: 'Direct Official Notice', icon: '📄' };
}

async function generateDashboardHtml(jobs, stats) {
  // Augment jobs with display fields, countdowns, match analysis, and portal sources
  const enrichedJobs = jobs.map(j => {
    const daysLeft = computeDaysLeft(j.last_date);
    const match = analyzeCandidateMatch(j);
    const portal = getPortalSource(j);
    return {
      ...j,
      display_last_date: formatDateToDisplay(j.last_date),
      display_age_cutoff: formatDateToDisplay(j.age_cutoff_date),
      days_left: daysLeft,
      is_urgent: daysLeft !== null && daysLeft >= 0 && daysLeft <= 2,
      is_expiring_soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= 7,
      is_expired: daysLeft !== null && daysLeft < 0,
      candidate_match: match,
      portal_id: portal.id,
      portal_name: portal.name,
      portal_icon: portal.icon,
    };
  });

  const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GovScan AI — Personal Government Job Radar</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
      --chip-degree: rgba(16, 185, 129, 0.15);
      --chip-degree-text: #34d399;
      --chip-age: rgba(59, 130, 246, 0.15);
      --chip-age-text: #60a5fa;
      --chip-exp: rgba(168, 85, 247, 0.15);
      --chip-exp-text: #c084fc;
      --chip-review: rgba(245, 158, 11, 0.15);
      --chip-review-text: #fbbf24;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .container { max-width: 1440px; margin: 0 auto; }

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
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand h1 { font-size: 26px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
    .brand .subtitle { color: var(--text-muted); font-size: 13px; margin-top: 3px; }
    .profile-pill {
      background: #1e293b;
      border: 1px solid #334155;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      color: #94a3b8;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .profile-pill strong { color: #f1f5f9; }
    .timestamp { font-size: 12px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .stat-card:hover { transform: translateY(-2px); border-color: #374151; }
    .stat-label { font-size: 12px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-val { font-size: 26px; font-weight: 800; color: #fff; }
    .stat-val.t1 { color: var(--tier1); }
    .stat-val.review { color: var(--badge-review); }
    .stat-val.urgent { color: #f87171; }

    /* Priority Action Center (Expiring Soon Banner) */
    .action-center {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.1));
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
    }
    .action-center-left { display: flex; align-items: center; gap: 14px; }
    .action-icon { font-size: 26px; }
    .action-title { font-size: 15px; font-weight: 700; color: #fca5a5; }
    .action-desc { font-size: 13px; color: #e2e8f0; margin-top: 2px; }
    .action-btn-urgent {
      background: #ef4444;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .action-btn-urgent:hover { background: #dc2626; }

    /* 4-Category Switcher Tabs */
    .category-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .cat-tab {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
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
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.25);
    }
    .tab-count {
      background: rgba(0,0,0,0.4);
      padding: 2px 7px;
      border-radius: 10px;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Portal Breakdown Bar */
    .portal-breakdown {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 12px 18px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .portal-header-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      white-space: nowrap;
    }
    .portal-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .portal-pill {
      background: #0f172a;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .portal-pill:hover {
      background: #1e293b;
      color: #fff;
      border-color: #60a5fa;
    }
    .portal-pill.active {
      background: #1e3a8a;
      border-color: #3b82f6;
      color: #fff;
      box-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
    }
    .portal-count {
      background: rgba(0,0,0,0.4);
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Filter & View Switcher Bar */
    .controls {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .controls-top {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .search-box {
      flex: 1 1 320px;
      position: relative;
    }
    .search-box input {
      width: 100%;
      background: #0b0f19;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 10px 14px 10px 36px;
      color: #fff;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }
    .search-box input:focus { border-color: #3b82f6; }
    .search-box::before {
      content: '🔍';
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 13px;
      opacity: 0.6;
    }

    .view-toggle {
      display: flex;
      background: #0b0f19;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 3px;
      gap: 4px;
    }
    .view-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .view-btn.active {
      background: #1e293b;
      color: #fff;
    }

    .controls-bottom {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
    }
    .filter-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    select {
      background: #0b0f19;
      border: 1px solid #374151;
      border-radius: 8px;
      color: var(--text);
      padding: 8px 12px;
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }
    select:focus { border-color: #3b82f6; }

    .btn {
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-outline {
      background: #1e293b;
      border: 1px solid #334155;
      color: #93c5fd;
    }
    .btn-outline:hover { background: #334155; color: #fff; }

    .counter-tag {
      font-size: 12px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    /* Jobs Cards Grid */
    .jobs-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .job-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px 22px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
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
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .post-info { flex: 1 1 320px; }
    .org-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .org-title {
      font-size: 13px;
      text-transform: uppercase;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.5px;
    }
    .source-badge {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      background: #1e293b;
      border: 1px solid #334155;
      padding: 2px 8px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
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

    /* Candidate Match Visualizer Row */
    .match-chips-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin: 10px 0 12px 0;
      padding: 8px 12px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 8px;
    }
    .match-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #94a3b8;
      margin-right: 4px;
      letter-spacing: 0.5px;
    }
    .match-chip {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .chip-degree { background: var(--chip-degree); color: var(--chip-degree-text); border: 1px solid rgba(16, 185, 129, 0.3); }
    .chip-age { background: var(--chip-age); color: var(--chip-age-text); border: 1px solid rgba(59, 130, 246, 0.3); }
    .chip-exp { background: var(--chip-exp); color: var(--chip-exp-text); border: 1px solid rgba(168, 85, 247, 0.3); }
    .chip-review { background: var(--chip-review); color: var(--chip-review-text); border: 1px solid rgba(245, 158, 11, 0.3); }

    /* Metadata pills row */
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 13px;
      color: #cbd5e1;
      margin: 10px 0;
      padding: 10px 0;
      border-top: 1px solid #1e293b;
      border-bottom: 1px solid #1e293b;
    }
    .meta-item { display: flex; align-items: center; gap: 6px; }
    .meta-item strong { color: #fff; }

    /* Live Countdown Display */
    .countdown-urgent {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      color: #fca5a5;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      animation: pulse 2s infinite;
    }
    .countdown-active {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #6ee7b7;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .countdown-expired {
      color: #64748b;
      text-decoration: line-through;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .flags-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 8px 0;
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

    /* Accordion Details */
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
      background: rgba(59, 130, 246, 0.05);
      padding: 8px 12px;
      border-radius: 0 6px 6px 0;
    }
    .reasoning-box { color: #cbd5e1; line-height: 1.6; }

    /* Card Footer & Action Hub */
    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 14px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .action-links { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .btn-apply-primary {
      background: #2563eb;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      padding: 7px 14px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .btn-apply-primary:hover { background: #1d4ed8; color: #fff; }
    .btn-notice-secondary {
      background: #1e293b;
      border: 1px solid #334155;
      color: #93c5fd;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-notice-secondary:hover { background: #334155; color: #fff; }
    .btn-copy {
      background: none;
      border: 1px solid #374151;
      color: var(--text-muted);
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }
    .btn-copy:hover { color: #fff; border-color: #64748b; }

    /* Timeline Section Styles */
    .timeline-bucket {
      margin-bottom: 24px;
    }
    .timeline-bucket-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #1e293b;
    }
    .timeline-bucket-title {
      font-size: 15px;
      font-weight: 700;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .timeline-bucket-count {
      background: #1e293b;
      color: #94a3b8;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
    }

    .no-results {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
      background: var(--card-bg);
      border-radius: 12px;
      border: 1px dashed var(--card-border);
    }

    /* Toast Notification */
    #toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #10b981;
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      display: none;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div>
          <h1>🛰️ GovScan AI</h1>
          <div class="subtitle">Personal Government Job Radar & Eligibility Mission Control</div>
        </div>
      </div>
      <div class="profile-pill">
        <span>👤 <strong>Aniket Raj</strong></span>
        <span>•</span>
        <span>M.Sc Electronics (78.9%) | B.Sc Physics (63.1%)</span>
        <span>•</span>
        <span>OBC-NCL (Central)</span>
      </div>
      <div class="timestamp">Generated: ${generatedAt}</div>
    </header>

    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Total Jobs Discovered</span>
        <span class="stat-val" id="stat-total">${stats.total}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">🟢 Tier 1 High Relevant</span>
        <span class="stat-val t1" id="stat-t1">${stats.byTier[1] || 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">✅ Ready to Apply (Open)</span>
        <span class="stat-val" style="color:#10b981;" id="stat-eligible">0</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">🔍 Manual Review Pending</span>
        <span class="stat-val review" id="stat-review">0</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">🚨 Deadlines in 7 Days</span>
        <span class="stat-val urgent" id="stat-urgent">0</span>
      </div>
    </div>

    <!-- Priority Action Center Banner (shown if eligible/review jobs closing soon) -->
    <div class="action-center" id="actionCenter" style="display:none;">
      <div class="action-center-left">
        <div class="action-icon">🚨</div>
        <div>
          <div class="action-title" id="actionTitle">Urgent Deadlines Approaching!</div>
          <div class="action-desc" id="actionDesc">You have active job opportunities closing in the next few days. Review and apply before portals close.</div>
        </div>
      </div>
      <button class="action-btn-urgent" onclick="filterClosingSoon()">View Urgent Opportunities &rarr;</button>
    </div>

    <!-- Category Switcher Tabs -->
    <div class="category-tabs">
      <button class="cat-tab" id="tab-ready" onclick="selectCategoryTab('ready_to_apply', this)">
        🟢 Ready to Apply (Eligible) <span class="tab-count" id="count-ready">0</span>
      </button>
      <button class="cat-tab" id="tab-review" onclick="selectCategoryTab('manual_review', this)">
        🔍 Needs Manual Review <span class="tab-count" id="count-review">0</span>
      </button>
      <button class="cat-tab active" id="tab-actionable" onclick="selectCategoryTab('actionable', this)">
        🎯 All Actionable (Open) <span class="tab-count" id="count-actionable">0</span>
      </button>
      <button class="cat-tab" id="tab-not-eligible" onclick="selectCategoryTab('not_eligible', this)">
        ❌ Not Eligible Drawer <span class="tab-count" id="count-not-eligible">0</span>
      </button>
      <button class="cat-tab" id="tab-expired" onclick="selectCategoryTab('expired', this)">
        📦 Past Deadlines Archive <span class="tab-count" id="count-expired">0</span>
      </button>
    </div>

    <!-- Portal / Source Breakdown Bar (Interactive) -->
    <div class="portal-breakdown">
      <span class="portal-header-title">📡 Discovered by Portal:</span>
      <div class="portal-pills" id="portalPills">
        <button class="portal-pill active" id="portal-all" onclick="selectPortal('all', this)">
          🌐 All Sources <span class="portal-count" id="pcount-all">0</span>
        </button>
      </div>
    </div>

    <!-- Controls & View Mode Bar -->
    <div class="controls">
      <div class="controls-top">
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="Search post title, organisation, qualification clause, location...">
        </div>

        <div class="view-toggle">
          <button class="view-btn active" id="btnViewGrid" onclick="setViewMode('grid')">🗂️ Cards</button>
          <button class="view-btn" id="btnViewTimeline" onclick="setViewMode('timeline')">📅 Timeline</button>
        </div>
      </div>

      <div class="controls-bottom">
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
            <option value="urgent">🚨 Closing &le; 2 Days</option>
            <option value="soon">⏰ Closing &le; 7 Days</option>
            <option value="active">Active (Open)</option>
            <option value="expired">Expired</option>
          </select>

          <select id="sortOrder">
            <option value="deadline_asc">Sort: Deadline (Earliest First)</option>
            <option value="tier_asc">Sort: Tier (1 &rarr; 4)</option>
            <option value="newest">Sort: Newest First</option>
            <option value="org_asc">Sort: Organisation (A-Z)</option>
          </select>

          <button class="btn btn-outline" id="btnToggleNotEligible" onclick="toggleNotEligibleMode()">❌ Include Not Eligible</button>
          <button class="btn btn-outline" id="btnToggleArchive" onclick="toggleArchiveMode()">📦 Include Archive</button>
          <button class="btn btn-outline" id="exportBtn" onclick="exportExcel()">📥 Excel Workbook</button>
          <button class="btn btn-outline" id="btnResetFilters" onclick="resetAllFilters()" style="display:none; color:#f87171; border-color:rgba(239, 68, 68, 0.4);">🔄 Reset Filters</button>
        </div>

        <span class="counter-tag" id="visibleCounter">Showing ${enrichedJobs.length} jobs</span>
      </div>
    </div>

    <!-- Jobs Container (Cards / Timeline) -->
    <div id="jobsContainer"></div>
  </div>

  <div id="toast">Copied to clipboard!</div>

  <script>
    const allJobs = ${JSON.stringify(enrichedJobs)};
    let activeCategory = 'actionable'; // 'actionable' | 'ready_to_apply' | 'manual_review' | 'not_eligible' | 'expired'
    let activePortal = 'all';
    let includeArchive = false; // By default, expired historical notices are kept aside
    let includeNotEligible = false; // By default, Not Eligible jobs are kept aside
    let currentViewMode = 'grid'; // 'grid' | 'timeline'

    function updateLiveCounters() {
      const portalJobs = (activePortal === 'all')
        ? allJobs
        : allJobs.filter(j => j.portal_id === activePortal);

      const readyJobs = portalJobs.filter(j => j.status === 'Eligible' && !j.is_expired);
      const reviewJobs = portalJobs.filter(j => j.status === 'Manual Review' && !j.is_expired);
      const actionableJobs = portalJobs.filter(j => (j.status === 'Eligible' || j.status === 'Manual Review') && !j.is_expired);
      const notEligibleJobs = portalJobs.filter(j => j.status === 'Not Eligible' && !j.is_expired);
      const expiredJobs = portalJobs.filter(j => j.is_expired);

      document.getElementById('count-ready').innerText = readyJobs.length;
      document.getElementById('count-review').innerText = reviewJobs.length;
      const countAct = document.getElementById('count-actionable');
      if (countAct) countAct.innerText = actionableJobs.length;
      const countNE = document.getElementById('count-not-eligible');
      if (countNE) countNE.innerText = notEligibleJobs.length;
      document.getElementById('count-expired').innerText = expiredJobs.length;

      // Stats cards reflect database overview
      document.getElementById('stat-eligible').innerText = allJobs.filter(j => j.status === 'Eligible' && !j.is_expired).length;
      document.getElementById('stat-review').innerText = allJobs.filter(j => j.status === 'Manual Review' && !j.is_expired).length;

      // Update Not Eligible toggle button
      const totalLiveNE = allJobs.filter(j => j.status === 'Not Eligible' && !j.is_expired).length;
      const btnNE = document.getElementById('btnToggleNotEligible');
      if (btnNE) {
        if (includeNotEligible) {
          btnNE.innerHTML = '❌ Showing Not Eligible (' + totalLiveNE + ')';
          btnNE.style.color = '#ef4444';
          btnNE.style.borderColor = '#ef4444';
        } else {
          btnNE.innerHTML = '❌ Include Not Eligible (' + totalLiveNE + ')';
          btnNE.style.color = '';
          btnNE.style.borderColor = '';
        }
      }

      // Update Archive toggle button text
      const totalExpired = allJobs.filter(j => j.is_expired).length;
      const archiveBtn = document.getElementById('btnToggleArchive');
      if (archiveBtn) {
        if (includeArchive) {
          archiveBtn.innerHTML = '🟢 Archive Included (' + totalExpired + ')';
          archiveBtn.style.color = '#38bdf8';
          archiveBtn.style.borderColor = '#38bdf8';
        } else {
          archiveBtn.innerHTML = '📦 Include Archive (' + totalExpired + ')';
          archiveBtn.style.color = '';
          archiveBtn.style.borderColor = '';
        }
      }

      // Render dynamic interactive portal breakdown pills
      renderPortalPills();

      // Check urgent actionable opportunities
      const urgentActionable = allJobs.filter(j => (j.status === 'Eligible' || j.status === 'Manual Review') && j.is_expiring_soon);
      document.getElementById('stat-urgent').innerText = urgentActionable.length;

      if (urgentActionable.length > 0) {
        const banner = document.getElementById('actionCenter');
        banner.style.display = 'flex';
        document.getElementById('actionTitle').innerText = '🚨 ' + urgentActionable.length + ' Actionable Opportunity(ies) Closing in &le; 7 Days!';
        document.getElementById('actionDesc').innerText = 'Deadlines are approaching soon for positions matching your qualifications. Click below to inspect them.';
      }
    }

    function renderPortalPills() {
      const container = document.getElementById('portalPills');
      if (!container) return;

      const portalMap = {};
      allJobs.forEach(j => {
        // If user is in active/actionable mode, count only active actionable jobs
        if (!includeArchive && j.is_expired) return;
        if (!includeNotEligible && j.status === 'Not Eligible') return;
        const pid = j.portal_id || 'other';
        if (!portalMap[pid]) {
          portalMap[pid] = {
            id: pid,
            name: j.portal_name || pid,
            icon: j.portal_icon || '📄',
            count: 0
          };
        }
        portalMap[pid].count++;
      });

      let totalCount = 0;
      if (includeArchive && includeNotEligible) totalCount = allJobs.length;
      else if (includeArchive) totalCount = allJobs.filter(j => j.status !== 'Not Eligible').length;
      else if (includeNotEligible) totalCount = allJobs.filter(j => !j.is_expired).length;
      else totalCount = allJobs.filter(j => !j.is_expired && j.status !== 'Not Eligible').length;

      let html = '<button class="portal-pill ' + (activePortal === 'all' ? 'active' : '') + '" id="portal-all" onclick="selectPortal(\\'all\\', this)">' +
        '🌐 All Sources <span class="portal-count" id="pcount-all">' + totalCount + '</span>' +
        '</button>';

      const sortedPortals = Object.values(portalMap).sort((a, b) => b.count - a.count);
      for (const p of sortedPortals) {
        const isActive = (activePortal === p.id) ? 'active' : '';
        html += '<button class="portal-pill ' + isActive + '" id="portal-' + p.id + '" onclick="selectPortal(\\'' + p.id + '\\', this)">' +
          p.icon + ' ' + escapeHtml(p.name) + ' <span class="portal-count" id="pcount-' + p.id + '">' + p.count + '</span>' +
          '</button>';
      }

      container.innerHTML = html;
    }

    function setViewMode(mode) {
      currentViewMode = mode;
      document.getElementById('btnViewGrid').classList.toggle('active', mode === 'grid');
      document.getElementById('btnViewTimeline').classList.toggle('active', mode === 'timeline');
      filterJobs();
    }

    function toggleNotEligibleMode() {
      includeNotEligible = !includeNotEligible;
      updateLiveCounters();
      filterJobs();
    }

    function toggleArchiveMode() {
      includeArchive = !includeArchive;
      updateLiveCounters();
      filterJobs();
    }

    function selectCategoryTab(category, btn) {
      activeCategory = category;
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      const targetBtn = btn || document.getElementById('tab-' + (category === 'ready_to_apply' ? 'ready' : (category === 'manual_review' ? 'review' : (category === 'not_eligible' ? 'not-eligible' : (category === 'expired' ? 'expired' : 'actionable')))));
      if (targetBtn) targetBtn.classList.add('active');

      if (category === 'expired') {
        includeArchive = true;
      } else if (category === 'not_eligible') {
        includeNotEligible = true;
        includeArchive = false;
        document.getElementById('statusFilter').value = 'Not Eligible';
      } else {
        includeArchive = false;
        includeNotEligible = false;
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('deadlineFilter').value = 'all';
      }

      updateLiveCounters();
      filterJobs();
    }

    function selectPortal(portalKey, btn) {
      activePortal = portalKey;
      document.querySelectorAll('.portal-pill').forEach(p => p.classList.remove('active'));
      if (btn) btn.classList.add('active');

      const portalJobs = (portalKey === 'all') ? allJobs : allJobs.filter(j => j.portal_id === portalKey);
      let matchCount = portalJobs.length;
      if (activeCategory === 'ready_to_apply') {
        matchCount = portalJobs.filter(j => j.status === 'Eligible' && !j.is_expired).length;
      } else if (activeCategory === 'manual_review') {
        matchCount = portalJobs.filter(j => j.status === 'Manual Review' && !j.is_expired).length;
      } else if (activeCategory === 'actionable') {
        matchCount = portalJobs.filter(j => (j.status === 'Eligible' || j.status === 'Manual Review') && !j.is_expired).length;
      } else if (activeCategory === 'not_eligible') {
        matchCount = portalJobs.filter(j => j.status === 'Not Eligible' && !j.is_expired).length;
      } else if (activeCategory === 'expired') {
        matchCount = portalJobs.filter(j => j.is_expired).length;
      }

      if (matchCount === 0 && portalJobs.length > 0) {
        const hasActionable = portalJobs.some(j => (j.status === 'Eligible' || j.status === 'Manual Review') && !j.is_expired);
        if (hasActionable) {
          activeCategory = 'actionable';
          includeArchive = false;
          includeNotEligible = false;
          document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
          const actTab = document.getElementById('tab-actionable');
          if (actTab) actTab.classList.add('active');
        } else {
          // Check if it has Not Eligible or Expired
          const hasNotEligible = portalJobs.some(j => j.status === 'Not Eligible' && !j.is_expired);
          if (hasNotEligible) {
            activeCategory = 'not_eligible';
            includeNotEligible = true;
            document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
            const neTab = document.getElementById('tab-not-eligible');
            if (neTab) neTab.classList.add('active');
          } else {
            activeCategory = 'expired';
            includeArchive = true;
            document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
            const expTab = document.getElementById('tab-expired');
            if (expTab) expTab.classList.add('active');
          }
        }
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('deadlineFilter').value = 'all';
      }

      updateLiveCounters();
      filterJobs();
    }

    function resetAllFilters() {
      document.getElementById('searchInput').value = '';
      document.getElementById('tierFilter').value = 'all';
      document.getElementById('statusFilter').value = 'all';
      document.getElementById('deadlineFilter').value = 'all';
      document.getElementById('sortOrder').value = 'deadline_asc';
      activePortal = 'all';
      activeCategory = 'actionable';
      includeArchive = false;
      includeNotEligible = false;

      document.querySelectorAll('.portal-pill').forEach(p => p.classList.remove('active'));
      const allBtn = document.getElementById('portal-all');
      if (allBtn) allBtn.classList.add('active');

      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      const actTab = document.getElementById('tab-actionable');
      if (actTab) actTab.classList.add('active');

      updateLiveCounters();
      filterJobs();
    }

    function filterClosingSoon() {
      activePortal = 'all';
      document.querySelectorAll('.portal-pill').forEach(p => p.classList.remove('active'));
      const allBtn = document.getElementById('portal-all');
      if (allBtn) allBtn.classList.add('active');
      activeCategory = 'actionable';
      includeArchive = false;
      includeNotEligible = false;
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      const actTab = document.getElementById('tab-actionable');
      if (actTab) actTab.classList.add('active');
      document.getElementById('statusFilter').value = 'all';
      document.getElementById('deadlineFilter').value = 'soon';
      updateLiveCounters();
      filterJobs();
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2200);
    }

    function copyJobSummary(jobId) {
      const job = allJobs.find(j => j.id === jobId) || allJobs[jobId];
      if (!job) return;

      const lines = [
        '📋 Post: ' + job.post_name,
        '🏢 Organisation: ' + job.organisation,
      ];

      if (job.advertisement_no) {
        lines.push('📌 Advt / Notification No: ' + job.advertisement_no);
      }
      if (job.post_code) {
        lines.push('🔢 Post Code: ' + job.post_code);
      }

      lines.push('🎯 Eligibility: ' + job.status + ' (Tier ' + job.tier + ')');
      lines.push('📅 Last Date: ' + (job.display_last_date || 'Not Stated') + (job.days_left !== null ? (job.days_left < 0 ? ' (Expired)' : ' (' + job.days_left + ' days left)') : ''));

      if (job.pay) lines.push('💰 Pay / Salary: ' + job.pay + (job.employment_type ? ' (' + job.employment_type + ')' : ''));
      if (job.vacancies_count) lines.push('👥 Vacancies: ' + job.vacancies_count);
      if (job.location) lines.push('📍 Location: ' + job.location);
      if (job.candidate_match && job.candidate_match.degreeMatch) lines.push('🎓 Match: ' + job.candidate_match.degreeMatch);
      if (job.official_notification_url) lines.push('📄 Official Notification: ' + job.official_notification_url);
      if (job.official_apply_url) lines.push('🚀 Apply Online Portal: ' + job.official_apply_url);

      const textToCopy = lines.join('\\n');

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('Job details & Advt No copied!');
        }).catch(() => {
          fallbackCopy(textToCopy);
        });
      } else {
        fallbackCopy(textToCopy);
      }
    }

    function fallbackCopy(text) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showToast('Job details & Advt No copied!');
        } else {
          showToast('Failed to copy');
        }
      } catch (err) {
        showToast('Could not copy');
      }
      document.body.removeChild(textArea);
    }

    function renderJobCard(job) {
      const tierClass = 'tier-' + job.tier;
      const tierBadgeClass = 'badge-t' + job.tier;
      const statusBadgeClass = job.status === 'Eligible' ? 'badge-eligible' : (job.status === 'Manual Review' ? 'badge-review' : 'badge-not-eligible');

      let deadlineBadge = '';
      if (job.last_date) {
        if (job.days_left !== null && job.days_left >= -3 && job.days_left < 0) {
          deadlineBadge = '<span class="countdown-urgent" style="background:rgba(234,179,8,0.25); color:#facc15; border-color:#eab308;">⌛ Just Closed (3-Day Grace): ' + job.display_last_date + '</span>';
        } else if (job.is_expired) {
          deadlineBadge = '<span class="countdown-expired">Closed: ' + job.display_last_date + '</span>';
        } else if (job.days_left === 0) {
          deadlineBadge = '<span class="countdown-urgent">🚨 CLOSING TODAY!</span>';
        } else if (job.days_left === 1) {
          deadlineBadge = '<span class="countdown-urgent">🚨 CLOSING TOMORROW!</span>';
        } else if (job.days_left <= 7) {
          deadlineBadge = '<span class="countdown-urgent">⏰ ' + job.display_last_date + ' (' + job.days_left + ' days left)</span>';
        } else {
          deadlineBadge = '<span class="countdown-active">⏰ ' + job.display_last_date + ' (' + job.days_left + ' days left)</span>';
        }
      } else {
        deadlineBadge = '<span>No deadline specified</span>';
      }

      const match = job.candidate_match || {};
      const matchChips = [
        '<span class="match-chip chip-degree">' + escapeHtml(match.degreeMatch || 'Qualifications Verified') + '</span>',
        '<span class="match-chip chip-age">' + escapeHtml(match.ageMatch || 'Age Verified') + '</span>',
        '<span class="match-chip chip-exp">' + escapeHtml(match.expMatch || 'Experience Checked') + '</span>',
      ];
      if (match.reviewNote) {
        matchChips.push('<span class="match-chip chip-review">' + escapeHtml(match.reviewNote) + '</span>');
      }

      const flagsHtml = (job.flags && job.flags.length > 0)
        ? '<div class="flags-row">' + job.flags.map(f => '<span class="flag-tag">⚠️ ' + escapeHtml(f) + '</span>').join('') + '</div>'
        : '';

      return \`
        <div class="job-card \${tierClass}">
          <div class="card-header">
            <div class="post-info">
              <div class="org-title-row">
                <span class="org-title">\${escapeHtml(job.organisation)}</span>
                <span class="source-badge">\${job.portal_icon} \${escapeHtml(job.portal_name)}</span>
              </div>
              <div class="post-name">\${escapeHtml(job.post_name)}</div>
              \${job.advertisement_no ? \`<div class="advt-code">Advt No: \${escapeHtml(job.advertisement_no)} \${job.post_code ? ' | Post Code: ' + escapeHtml(job.post_code) : ''}</div>\` : ''}
            </div>
            <div class="badges">
              <span class="badge \${tierBadgeClass}">Tier \${job.tier}</span>
              <span class="badge \${statusBadgeClass}">\${job.status}</span>
            </div>
          </div>

          <!-- Candidate Match Visualizer -->
          <div class="match-chips-row">
            <span class="match-label">Your Match:</span>
            \${matchChips.join('')}
          </div>

          <!-- Metadata row -->
          <div class="meta-row">
            \${job.pay ? \`<div class="meta-item">💰 <strong>\${escapeHtml(job.pay)}</strong> (\${escapeHtml(job.employment_type || 'N/A')})</div>\` : ''}
            \${job.location ? \`<div class="meta-item">📍 <strong>\${escapeHtml(job.location)}</strong></div>\` : ''}
            \${job.vacancies_count ? \`<div class="meta-item">👥 Vacancies: <strong>\${job.vacancies_count}</strong></div>\` : ''}
            <div class="meta-item">📅 Last Date: \${deadlineBadge}</div>
            \${job.fee ? \`<div class="meta-item">💳 Fee: <strong>\${escapeHtml(job.fee)}</strong></div>\` : ''}
          </div>

          \${flagsHtml}

          <!-- Details Accordion -->
          <button class="accordion-btn" onclick="toggleDetails(this)">
            <span>▶ View Eligibility Reasoning &amp; Notification Clause</span>
          </button>
          <div class="accordion-content">
            \${job.qualification_clause ? \`<div class="clause-box"><strong>Official Notification Clause (Page \${job.page_number || 'N/A'}):</strong><br>"\${escapeHtml(job.qualification_clause)}"</div>\` : ''}
            \${job.reasoning ? \`<div class="reasoning-box"><strong>Gemini AI Evaluation:</strong><br>\${escapeHtml(job.reasoning)}</div>\` : ''}
          </div>

          <!-- Action Hub -->
          <div class="card-footer">
            <div class="action-links">
              \${job.official_apply_url ? \`<a href="\${job.official_apply_url}" target="_blank" class="btn-apply-primary">🚀 Apply Online Portal</a>\` : ''}
              \${job.official_notification_url ? \`<a href="\${job.official_notification_url}" target="_blank" class="btn-notice-secondary">📄 Official Notification PDF</a>\` : ''}
              <button class="btn-copy" onclick="copyJobSummary(\${job.id})">📋 Copy Details</button>
            </div>
            <div style="font-size:12px; color:var(--text-muted); font-family:'JetBrains Mono', monospace;">
              Detected: \${job.date_first_detected || 'N/A'}
            </div>
          </div>
        </div>
      \`;
    }

    function toggleDetails(btn) {
      const content = btn.nextElementSibling;
      const isOpen = content.classList.contains('show');
      content.classList.toggle('show');
      btn.querySelector('span').innerText = isOpen ? '▶ View Eligibility Reasoning & Notification Clause' : '▼ Hide Eligibility Details';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function renderTimelineView(jobs) {
      const container = document.getElementById('jobsContainer');
      if (jobs.length === 0) {
        container.innerHTML = \`
          <div class="no-results">
            <div style="font-size:36px; margin-bottom:12px;">🔍</div>
            <h3 style="color:#f1f5f9; font-size:18px;">No matching jobs found</h3>
            <p style="margin:8px 0 18px; color:var(--text-muted); font-size:14px;">The selected filter combination or search keywords matched 0 out of \${allJobs.length} jobs.</p>
            <button class="btn btn-apply-primary" onclick="resetAllFilters()" style="cursor:pointer; font-weight:700; padding:8px 18px; font-size:13px;">🔄 Reset All Filters</button>
          </div>
        \`;
        return;
      }

      // Group into timeline buckets
      const buckets = {
        urgent: { title: '🚨 Closing in &le; 48 Hours', jobs: [] },
        this_week: { title: '⏰ Closing This Week (3 to 7 Days)', jobs: [] },
        this_month: { title: '🗓️ Closing in 8 to 30 Days', jobs: [] },
        future: { title: '📆 Future Deadlines (> 30 Days)', jobs: [] },
        no_deadline: { title: '⏳ Ongoing / Date Not Stated', jobs: [] },
        expired: { title: '⌛ Past Deadlines (Closed)', jobs: [] }
      };

      for (const job of jobs) {
        if (job.is_expired) {
          buckets.expired.jobs.push(job);
        } else if (job.days_left !== null) {
          if (job.days_left <= 2) buckets.urgent.jobs.push(job);
          else if (job.days_left <= 7) buckets.this_week.jobs.push(job);
          else if (job.days_left <= 30) buckets.this_month.jobs.push(job);
          else buckets.future.jobs.push(job);
        } else {
          buckets.no_deadline.jobs.push(job);
        }
      }

      let html = '';
      for (const key of ['urgent', 'this_week', 'this_month', 'future', 'no_deadline', 'expired']) {
        const b = buckets[key];
        if (b.jobs.length > 0) {
          html += \`
            <div class="timeline-bucket">
              <div class="timeline-bucket-header">
                <div class="timeline-bucket-title">\${b.title}</div>
                <div class="timeline-bucket-count">\${b.jobs.length}</div>
              </div>
              <div class="jobs-list">
                \${b.jobs.map(j => renderJobCard(j)).join('')}
              </div>
            </div>
          \`;
        }
      }

      container.innerHTML = html;
    }

    function renderGridView(jobs) {
      const container = document.getElementById('jobsContainer');
      if (jobs.length === 0) {
        container.innerHTML = \`
          <div class="no-results">
            <div style="font-size:36px; margin-bottom:12px;">🔍</div>
            <h3 style="color:#f1f5f9; font-size:18px;">No matching jobs found</h3>
            <p style="margin:8px 0 18px; color:var(--text-muted); font-size:14px;">The selected filter combination or search keywords matched 0 out of \${allJobs.length} jobs.</p>
            <button class="btn btn-apply-primary" onclick="resetAllFilters()" style="cursor:pointer; font-weight:700; padding:8px 18px; font-size:13px;">🔄 Reset All Filters</button>
          </div>
        \`;
        return;
      }
      container.innerHTML = '<div class="jobs-list">' + jobs.map(j => renderJobCard(j)).join('') + '</div>';
    }

    function filterJobs() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const tier = document.getElementById('tierFilter').value;
      const status = document.getElementById('statusFilter').value;
      const deadline = document.getElementById('deadlineFilter').value;
      const sort = document.getElementById('sortOrder').value;

      // User specifically requested expired if archive toggle is on, or category/dropdown is expired
      const userWantsExpired = includeArchive || (activeCategory === 'expired') || (deadline === 'expired');

      // User specifically requested not eligible if not-eligible toggle is on, or category/dropdown is not-eligible
      const userWantsNotEligible = includeNotEligible || (activeCategory === 'not_eligible') || (status === 'Not Eligible');

      // Update reset button visibility
      const isFiltered = (q !== '') || (tier !== 'all') || (status !== 'all') || (deadline !== 'all') || (activePortal !== 'all') || (activeCategory !== 'actionable') || includeArchive || includeNotEligible;
      const resetBtn = document.getElementById('btnResetFilters');
      if (resetBtn) resetBtn.style.display = isFiltered ? 'inline-flex' : 'none';

      let filtered = allJobs.filter(j => {
        // Portal Source Filter
        if (activePortal !== 'all' && j.portal_id !== activePortal) return false;

        // Archive Separation: Hide expired jobs unless archive mode is on or specifically chosen
        if (!userWantsExpired && j.is_expired) return false;

        // Not Eligible Separation: Hide Not Eligible jobs unless drawer toggle is on or specifically chosen
        if (!userWantsNotEligible && j.status === 'Not Eligible') return false;

        // Category Tab Filter
        if (activeCategory === 'actionable') {
          if ((j.status !== 'Eligible' && j.status !== 'Manual Review') || j.is_expired) return false;
        } else if (activeCategory === 'ready_to_apply') {
          if (j.status !== 'Eligible' || j.is_expired) return false;
        } else if (activeCategory === 'manual_review') {
          if (j.status !== 'Manual Review' || j.is_expired) return false;
        } else if (activeCategory === 'not_eligible') {
          if (j.status !== 'Not Eligible' || j.is_expired) return false;
        } else if (activeCategory === 'expired') {
          if (!j.is_expired) return false;
        }

        // Search
        if (q) {
          const hay = (
            (j.post_name || '') + ' ' +
            (j.organisation || '') + ' ' +
            (j.portal_name || '') + ' ' +
            (j.advertisement_no || '') + ' ' +
            (j.post_code || '') + ' ' +
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
        if (deadline === 'urgent' && (!j.is_urgent || j.is_expired)) return false;
        if (deadline === 'soon' && (!j.is_expiring_soon || j.is_expired)) return false;
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

      const totalLiveActionable = allJobs.filter(j => !j.is_expired && (j.status === 'Eligible' || j.status === 'Manual Review')).length;
      const totalNotEligibleLive = allJobs.filter(j => !j.is_expired && j.status === 'Not Eligible').length;
      const totalExpired = allJobs.filter(j => j.is_expired).length;

      let counterHtml = 'Showing <strong>' + filtered.length + '</strong>';
      if (activeCategory === 'actionable') {
        counterHtml += ' of ' + totalLiveActionable + ' actionable live jobs';
      } else if (activeCategory === 'ready_to_apply') {
        counterHtml += ' ready to apply jobs';
      } else if (activeCategory === 'manual_review') {
        counterHtml += ' manual review jobs';
      } else if (activeCategory === 'not_eligible') {
        counterHtml += ' of ' + totalNotEligibleLive + ' not-eligible jobs';
      } else if (activeCategory === 'expired') {
        counterHtml += ' of ' + totalExpired + ' archived jobs';
      } else {
        counterHtml += ' matching jobs';
      }

      if (!userWantsNotEligible && totalNotEligibleLive > 0) {
        counterHtml += ' <span style="color:#ef4444; font-size:11px; margin-left:6px; cursor:pointer; text-decoration:underline;" onclick="toggleNotEligibleMode()">(' + totalNotEligibleLive + ' not eligible hidden)</span>';
      }
      if (!userWantsExpired && totalExpired > 0) {
        counterHtml += ' <span style="color:#94a3b8; font-size:11px; margin-left:6px; cursor:pointer; text-decoration:underline;" onclick="toggleArchiveMode()">(' + totalExpired + ' archived hidden)</span>';
      }
      document.getElementById('visibleCounter').innerHTML = counterHtml;

      if (currentViewMode === 'timeline') {
        renderTimelineView(filtered);
      } else {
        renderGridView(filtered);
      }
    }

    function exportExcel() {
      window.location.href = '../exports/GovScan_Job_Report_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    }

    document.getElementById('searchInput').addEventListener('input', filterJobs);
    document.getElementById('tierFilter').addEventListener('change', filterJobs);
    document.getElementById('statusFilter').addEventListener('change', () => {
      const val = document.getElementById('statusFilter').value;
      if (val === 'Not Eligible') {
        includeNotEligible = true;
        activeCategory = 'not_eligible';
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        const neTab = document.getElementById('tab-not-eligible');
        if (neTab) neTab.classList.add('active');
      } else if (val === 'Eligible') {
        activeCategory = 'ready_to_apply';
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        const rTab = document.getElementById('tab-ready');
        if (rTab) rTab.classList.add('active');
      } else if (val === 'Manual Review') {
        activeCategory = 'manual_review';
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        const mTab = document.getElementById('tab-review');
        if (mTab) mTab.classList.add('active');
      } else {
        activeCategory = 'actionable';
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        const actTab = document.getElementById('tab-actionable');
        if (actTab) actTab.classList.add('active');
      }
      updateLiveCounters();
      filterJobs();
    });
    document.getElementById('deadlineFilter').addEventListener('change', () => {
      const val = document.getElementById('deadlineFilter').value;
      if (val === 'expired') {
        includeArchive = true;
        activeCategory = 'expired';
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        const expTab = document.getElementById('tab-expired');
        if (expTab) expTab.classList.add('active');
      } else if (val !== 'all') {
        activeCategory = 'actionable';
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        const actTab = document.getElementById('tab-actionable');
        if (actTab) actTab.classList.add('active');
      }
      updateLiveCounters();
      filterJobs();
    });
    document.getElementById('sortOrder').addEventListener('change', filterJobs);

    // Initial render
    updateLiveCounters();
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
