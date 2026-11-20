// src/core/verify.js
// Verification step: determines if a link/item is a valid vacancy notice.
// Rules:
// 1. Official domain check (.gov.in, .nic.in, .ac.in, .res.in, PSU domains)
// 2. Keyword heuristic first (skip results, admit cards, tenders, etc.)
// 3. Corrigendum detection (routes to corrigendum flow)
// 4. Ambiguity handling (uses Gemini classification only if strictly needed)

import { getConfig } from './config.js';

/**
 * Check if a URL belongs to a recognized official/PSU domain.
 */
export function isOfficialDomain(urlStr) {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    const config = getConfig();
    const allowedSuffixes = config.settings?.pipeline?.official_domains || [
      '.gov.in', '.nic.in', '.ac.in', '.res.in',
      '.cdac.in', '.isro.gov.in', '.drdo.gov.in',
      '.bel-india.in', '.bhel.in', '.ecil.co.in'
    ];

    for (const suffix of allowedSuffixes) {
      if (host.endsWith(suffix) || host === suffix.replace(/^\./, '')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Verify a title or notice headline using keyword heuristics.
 *
 * @param {string} text - Title or anchor text
 * @param {string} url - Link URL
 * @returns {Object} {
 *   isVacancy: boolean,
 *   isCorrigendum: boolean,
 *   skipReason: string | null,
 *   confidence: 'high' | 'medium' | 'low'
 * }
 */
export function verifyNoticeCandidate(text = '', url = '') {
  // Extract path from url so domain names (e.g. sarkariresult.com) don't falsely trigger skip keywords
  let pathOnly = url;
  try {
    const parsed = new URL(url);
    pathOnly = parsed.pathname;
  } catch {}

  const textNormalized = text.toLowerCase();
  const fullNormalized = `${textNormalized} ${pathOnly.toLowerCase()}`;
  const config = getConfig();

  const skipKeywords = config.settings?.pipeline?.verify_keywords_skip || [
    'admit card', 'call letter', 'hall ticket',
    'answer key', 'result', 'marks', 'score card', 'merit list',
    'tender', 'quotation', 'expression of interest', 'eoi',
    'minutes of meeting', 'annual report', 'rejected list', 'cancellation'
  ];

  const corrigendumKeywords = config.settings?.pipeline?.verify_keywords_corrigendum || [
    'corrigendum', 'addendum', 'amendment', 'erratum', 'extension of last date', 'date extension'
  ];

  // 1. Check for skip keywords with word boundary support for single words
  for (const kw of skipKeywords) {
    if (!kw.includes(' ')) {
      const regex = new RegExp(`\\b${kw}s?\\b`, 'i');
      if (regex.test(fullNormalized)) {
        return {
          isVacancy: false,
          isCorrigendum: false,
          skipReason: `Matched skip keyword: "${kw}"`,
          confidence: 'high',
        };
      }
    } else {
      if (fullNormalized.includes(kw)) {
        return {
          isVacancy: false,
          isCorrigendum: false,
          skipReason: `Matched skip keyword: "${kw}"`,
          confidence: 'high',
        };
      }
    }
  }

  // 2. Check for corrigendum keywords
  for (const kw of corrigendumKeywords) {
    if (fullNormalized.includes(kw)) {
      return {
        isVacancy: true,
        isCorrigendum: true,
        skipReason: null,
        confidence: 'high',
      };
    }
  }

  // 3. Positive signals for recruitment/vacancy
  const vacancyKeywords = [
    'recruitment', 'engagement', 'vacancy', 'vacancies', 'advertisement',
    'advt', 'notification', 'project engineer', 'scientist', 'technical assistant',
    'apprentice', 'officer', 'assistant', 'walk-in', 'contract basis', 'applications are invited',
    'online form', 'post', 'trainee', 'faculty', 'executive', 'engineer'
  ];

  const matchedPositive = vacancyKeywords.some(kw => fullNormalized.includes(kw));

  // If link is directly to a PDF and doesn't match skip keywords, likely a notification
  const isPdf = url.toLowerCase().endsWith('.pdf');

  if (matchedPositive || isPdf) {
    return {
      isVacancy: true,
      isCorrigendum: false,
      skipReason: null,
      confidence: matchedPositive ? 'high' : 'medium',
    };
  }

  // Ambiguous case: not explicitly ruled out, but no clear positive indicator
  return {
    isVacancy: false,
    isCorrigendum: false,
    skipReason: 'No clear recruitment or vacancy indicator found',
    confidence: 'medium',
  };
}
