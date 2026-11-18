// src/core/telegram.js
// Telegram Bot API client — sends alerts and reports.
// Uses the Telegram Bot HTTP API directly (no extra dependency).

import { getConfig } from './config.js';
import { formatDateToDisplay } from './database.js';

const API_BASE = 'https://api.telegram.org/bot';

/**
 * Send a text message via Telegram.
 * @param {string} text - Message text (Markdown or HTML)
 * @param {Object} options
 * @param {string} options.parseMode - 'MarkdownV2' | 'HTML' (default: 'HTML')
 * @param {boolean} options.disablePreview - Disable link preview
 */
export async function sendMessage(text, options = {}) {
  const config = getConfig();
  const token = config.settings?.telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.settings?.telegram?.chat_id || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('⚠️  Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID). Skipping alert.');
    return null;
  }

  const fetch = (await import('node-fetch')).default;
  const url = `${API_BASE}${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: options.disablePreview !== false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram API error: ${result.description}`);
  }
  return result;
}

/**
 * Format a job post for Telegram alert (HTML mode).
 * Uses the template from Amendment 8.
 */
export function formatJobAlert(post) {
  const tierEmoji = { 1: '🟢', 2: '🔵', 3: '🟡', 4: '🔴' }[post.tier] || '⚪';
  const statusEmoji = {
    'Eligible': '✅ ELIGIBLE',
    'Not Eligible': '❌ NOT ELIGIBLE',
    'Manual Review': '🔍 MANUAL REVIEW',
  }[post.status] || post.status;

  const daysLeft = computeDaysLeft(post.last_date);
  const daysStr = daysLeft !== null
    ? (daysLeft > 0 ? `(${daysLeft} days left)` : daysLeft === 0 ? '(TODAY!)' : '(EXPIRED)')
    : '';

  const flags = Array.isArray(post.flags)
    ? post.flags
    : (typeof post.flags === 'string' ? JSON.parse(post.flags || '[]') : []);

  let msg = `${tierEmoji} <b>TIER ${post.tier}</b> — ${statusEmoji}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 <b>${escHtml(post.organisation)}</b> | ${escHtml(post.post_name)}\n`;

  if (post.advertisement_no) {
    msg += `📌 Advt: ${escHtml(post.advertisement_no)}`;
    if (post.post_code) msg += ` | Post: ${escHtml(post.post_code)}`;
    msg += '\n';
  }

  if (post.pay) msg += `💰 ${escHtml(post.pay)} (${escHtml(post.employment_type || 'N/A')})\n`;
  if (post.location) msg += `📍 ${escHtml(post.location)}\n`;
  if (post.vacancies_count) msg += `👥 Vacancies: ${post.vacancies_count}\n`;

  if (post.last_date) {
    const displayDate = formatDateToDisplay(post.last_date);
    msg += `⏰ Last Date: <b>${escHtml(displayDate)}</b> ${daysStr}\n`;
  }

  if (flags.length > 0) {
    msg += `⚠️ Flags: ${flags.map(f => escHtml(f)).join(', ')}\n`;
  }

  if (post.official_notification_url) {
    msg += `📄 <a href="${post.official_notification_url}">Official Notification</a>\n`;
  }

  msg += `\n⚠️ <i>Always verify on the official notice before applying.</i>`;

  return msg;
}

/**
 * Send a job alert for posts matching tier rules.
 * Alert tiers: 1, 2, and any Manual Review.
 */
export async function sendJobAlert(post) {
  const config = getConfig();
  const alertTiers = config.settings?.telegram?.alert_tiers || [1, 2];
  const alertManualReview = config.settings?.telegram?.alert_manual_review !== false;

  const shouldAlert =
    alertTiers.includes(post.tier) ||
    (alertManualReview && post.status === 'Manual Review');

  if (!shouldAlert) return null;

  const message = formatJobAlert(post);
  return sendMessage(message);
}

/**
 * Send a batch of job alerts.
 */
export async function sendJobAlerts(posts) {
  const results = [];
  for (const post of posts) {
    try {
      const r = await sendJobAlert(post);
      if (r) results.push({ post: post.post_name, sent: true });
      // Rate limit: 1 message per second
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      results.push({ post: post.post_name, sent: false, error: err.message });
    }
  }
  return results;
}

/**
 * Send a deadline reminder.
 */
export async function sendDeadlineReminder(jobs) {
  if (jobs.length === 0) return;

  let msg = `⏰ <b>DEADLINE REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

  for (const job of jobs) {
    const daysLeft = computeDaysLeft(job.last_date);
    const urgency = daysLeft <= 2 ? '🚨' : '📅';
    msg += `${urgency} <b>${escHtml(job.post_name)}</b> @ ${escHtml(job.organisation)}\n`;
    msg += `   Last date: ${job.last_date}`;
    if (daysLeft !== null) {
      msg += daysLeft === 0 ? ' — <b>TODAY!</b>' : daysLeft === 1 ? ' — <b>TOMORROW!</b>' : ` — ${daysLeft} days left`;
    }
    msg += `\n   Status: ${job.application_status}\n\n`;
  }

  msg += `Total: ${jobs.length} upcoming deadline(s)`;
  return sendMessage(msg);
}

/**
 * Send the weekly missed jobs report.
 */
export async function sendWeeklyReport(missed, unreviewedManualReview) {
  let msg = `📊 <b>WEEKLY REPORT</b>\n━━━━━━━━━━━━━━━━━━\n\n`;

  if (missed.length > 0) {
    msg += `❌ <b>MISSED (${missed.length})</b> — Eligible but not applied:\n`;
    for (const job of missed) {
      msg += `  • ${escHtml(job.post_name)} @ ${escHtml(job.organisation)} — expired ${job.last_date}\n`;
    }
    msg += '\n';
  }

  if (unreviewedManualReview.length > 0) {
    msg += `🔍 <b>UNREVIEWED (${unreviewedManualReview.length})</b> — Manual Review pending:\n`;
    for (const job of unreviewedManualReview) {
      msg += `  • ${escHtml(job.post_name)} @ ${escHtml(job.organisation)}`;
      if (job.last_date) msg += ` — deadline ${job.last_date}`;
      msg += '\n';
    }
    msg += '\n';
  }

  if (missed.length === 0 && unreviewedManualReview.length === 0) {
    msg += '✅ All clear! No missed jobs or unreviewed items this week.\n';
  }

  return sendMessage(msg);
}

// ── Helpers ──

function computeDaysLeft(dateStr) {
  if (!dateStr || dateStr === 'not stated') return null;
  try {
    let yyyy, mm, dd;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-').map(Number);
      if (parts[0] > 1000) {
        // YYYY-MM-DD
        [yyyy, mm, dd] = parts;
      } else {
        // DD-MM-YYYY
        [dd, mm, yyyy] = parts;
      }
    } else {
      return null;
    }
    const deadline = new Date(yyyy, mm - 1, dd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
