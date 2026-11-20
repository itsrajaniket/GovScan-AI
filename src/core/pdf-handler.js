// src/core/pdf-handler.js
// Handles reading and classifying documents: PDF, DOCX, HTML, URL.
// Detects scanned/image PDFs, password-protected PDFs, oversized PDFs.

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Classify and read a document file.
 * Returns:
 * {
 *   type: 'pdf' | 'docx' | 'html' | 'text',
 *   buffer: Buffer (for PDFs to send to Gemini vision),
 *   text: string (extracted text, for non-PDF or fallback),
 *   hash: string (SHA-256 of the file),
 *   pageCount: number | null,
 *   isScanned: boolean,
 *   isPasswordProtected: boolean,
 *   isTooLarge: boolean,
 *   mimeType: string,
 *   warnings: string[],
 * }
 */
export async function readDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  const hash = createHash('sha256').update(buffer).digest('hex');

  const result = {
    type: 'unknown',
    buffer: null,
    text: null,
    hash,
    pageCount: null,
    isScanned: false,
    isPasswordProtected: false,
    isTooLarge: false,
    mimeType: 'application/octet-stream',
    warnings: [],
  };

  if (ext === '.pdf') {
    return await handlePDF(buffer, hash, result);
  } else if (ext === '.docx' || ext === '.doc') {
    return await handleDocx(buffer, hash, result);
  } else if (ext === '.html' || ext === '.htm') {
    return handleHTML(buffer, hash, result);
  } else if (ext === '.txt') {
    return handleText(buffer, hash, result);
  } else {
    result.warnings.push(`Unknown file extension: ${ext}. Attempting to read as text.`);
    return handleText(buffer, hash, result);
  }
}

async function handlePDF(buffer, hash, result) {
  result.type = 'pdf';
  result.mimeType = 'application/pdf';
  result.buffer = buffer;

  // Check for password protection (look for /Encrypt in PDF header)
  const headerStr = buffer.slice(0, Math.min(buffer.length, 4096)).toString('latin1');
  if (!headerStr.startsWith('%PDF')) {
    result.warnings.push('File does not start with %PDF header — may not be a valid PDF.');
  }

  // Check full file for encryption
  const fullStr = buffer.toString('latin1');
  if (fullStr.includes('/Encrypt')) {
    result.isPasswordProtected = true;
    result.warnings.push('PDF appears to be password-protected. Flagging for manual review.');
    return result;
  }

  // Try to extract text to detect if it's scanned
  try {
    // Dynamic import since pdf-parse is CJS
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(buffer);
    result.text = pdfData.text;
    result.pageCount = pdfData.numpages;

    // If extracted text is very short relative to page count, likely scanned
    const textLength = (pdfData.text || '').replace(/\s+/g, '').length;
    if (pdfData.numpages > 0 && textLength < pdfData.numpages * 50) {
      result.isScanned = true;
      result.warnings.push(
        `PDF appears to be scanned/image-based (${textLength} chars from ${pdfData.numpages} pages). ` +
        `Will send as image to Gemini vision.`
      );
    }

    // Check for oversized PDFs
    if (pdfData.numpages > 50) {
      result.isTooLarge = true;
      result.warnings.push(
        `PDF has ${pdfData.numpages} pages (>50). Will be flagged as "too_large_for_auto_check" ` +
        `or sent in page ranges.`
      );
    }
  } catch (err) {
    result.warnings.push(`Could not parse PDF text: ${err.message}. Will send raw PDF to Gemini.`);
    result.isScanned = true; // Assume scanned if we can't parse
  }

  return result;
}

async function handleDocx(buffer, hash, result) {
  result.type = 'docx';
  result.mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  result.hash = hash;

  try {
    const mammoth = await import('mammoth');
    const docResult = await mammoth.default.extractRawText({ buffer });
    result.text = docResult.value;
    if (!result.text || result.text.trim().length < 20) {
      result.warnings.push('DOCX extracted text is very short. May be an image-heavy document.');
    }
  } catch (err) {
    result.warnings.push(`Failed to extract text from DOCX: ${err.message}`);
  }

  return result;
}

function handleHTML(buffer, hash, result) {
  result.type = 'html';
  result.mimeType = 'text/html';
  result.hash = hash;

  try {
    // We'll import cheerio at call time
    const htmlStr = buffer.toString('utf-8');
    // Strip tags for plain text — basic approach
    result.text = htmlStr
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (err) {
    result.warnings.push(`Failed to extract text from HTML: ${err.message}`);
  }

  return result;
}

function handleText(buffer, hash, result) {
  result.type = 'text';
  result.mimeType = 'text/plain';
  result.hash = hash;
  result.text = buffer.toString('utf-8');
  return result;
}

import https from 'https';

const sslAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Fetch a URL and save to data/notices/.
 * Returns the local file path, or throws if the download fails.
 */
export async function downloadNotice(url, noticesDir) {
  const fetch = (await import('node-fetch')).default;

  const response = await fetch(url, {
    agent: sslAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/pdf,application/xhtml+xml,*/*',
    },
    timeout: 30000,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());

  // Determine filename and extension
  let ext = '.pdf';
  if (contentType.includes('html')) ext = '.html';
  else if (contentType.includes('msword') || contentType.includes('wordprocessing')) ext = '.docx';
  else if (contentType.includes('text/plain')) ext = '.txt';

  // Generate a filename from the URL
  const urlSlug = url
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 80);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${timestamp}_${urlSlug}${ext}`;
  const filePath = path.join(noticesDir, filename);

  fs.mkdirSync(noticesDir, { recursive: true });
  fs.writeFileSync(filePath, buffer);

  return { filePath, contentType, size: buffer.length };
}
