#!/usr/bin/env node
'use strict';

// Stable job identity for JobHuntBot.
//
// A job_id is derived from the job's real-world identity, not from its position
// in a CSV: skill → job_id → jobs.csv → dashboard → Feishu all use the same
// key, so re-sorting, inserting or re-running the pipeline can never duplicate
// or mis-target a job.
//
// Usage:
//   node scripts/job-id.js "Acme AI" "AI Product Manager" "https://..."
//   node scripts/job-id.js --reindex workspace/<slug>/jobs.csv

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Only genuine tracking parameters are stripped. Identity-bearing query
// parameters (id, positionId, jobId, postId …) MUST be preserved: careers
// sites like hr.163.com address a specific posting via ?id=NNNNN, and dropping
// it collapses distinct jobs into one id.
const TRACKING_PREFIXES = ['utm_', 'share_', 'track_', '_ga', 'wt_'];
const TRACKING_EXACT = new Set([
  'gclid', 'fbclid', 'msclkid', 'spm', 'ref', 'referrer', 'referer',
  'from_source', 'source_from', 'channel', 'share_token',
]);

function canonicalizeUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    // Not a parseable absolute URL — normalise whitespace/case only.
    return url.replace(/\s+/g, '');
  }
  parsed.hash = '';
  const stripped = [];
  parsed.searchParams.forEach((value, key) => {
    const lower = key.toLowerCase();
    const isTracking =
      TRACKING_EXACT.has(lower) || TRACKING_PREFIXES.some(p => lower.startsWith(p));
    if (!isTracking) stripped.push([key, parsed.searchParams.get(key)]);
  });
  parsed.search = '';
  stripped.forEach(([key, value]) => parsed.searchParams.append(key, value));
  // Keep the trailing-slash form stable and drop the default ports.
  parsed.host = parsed.host.replace(/:80$/, '').replace(/:443$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function makeJobId(company, jobTitle, jobUrl) {
  const canonical = canonicalizeUrl(jobUrl);
  const seed = [String(company || '').trim(), String(jobTitle || '').trim(), canonical].join('\u0001');
  return 'jh-' + crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function stringifyCSV(rows) {
  return rows.map(r => r.map(f => '"' + String(f == null ? '' : f).replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n';
}

function reindex(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  while (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('empty CSV');
  const header = rows[0];
  const dataRows = rows.slice(1);
  const idCol = header.indexOf('job_id');
  const cCol = header.indexOf('company');
  const tCol = header.indexOf('job_title');
  const uCol = header.indexOf('job_url');
  if (idCol === -1 || cCol === -1 || tCol === -1 || uCol === -1) {
    throw new Error('jobs.csv is missing job_id / company / job_title / job_url');
  }

  const backup = filePath.replace(/\.csv$/, '') + '.backup-' + Date.now() + '.csv';
  fs.writeFileSync(backup, '\uFEFF' + text, 'utf8');

  const used = new Map();
  let changed = 0;
  dataRows.forEach(r => {
    let id = makeJobId(r[cCol], r[tCol], r[uCol]);
    // Defensive: if two rows are genuinely identical, disambiguate instead of
    // silently writing a duplicate primary key.
    if (used.has(id)) {
      const n = used.get(id) + 1;
      used.set(id, n);
      id = id + '-' + n;
    } else {
      used.set(id, 1);
    }
    if (r[idCol] !== id) changed++;
    r[idCol] = id;
  });

  fs.writeFileSync(filePath, '\uFEFF' + stringifyCSV([header, ...dataRows]), 'utf8');
  const ids = dataRows.map(r => r[idCol]);
  const unique = new Set(ids).size;
  console.log(`backup   : ${backup}`);
  console.log(`rows     : ${dataRows.length}`);
  console.log(`changed  : ${changed}`);
  console.log(`unique id: ${unique}`);
  if (unique !== dataRows.length) {
    console.error('WARNING: duplicate job_id still present — inspect manually');
    process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
if (require.main === module) {
  if (args[0] === '--reindex') {
    if (!args[1]) {
      console.error('Usage: node scripts/job-id.js --reindex <jobs.csv>');
      process.exit(1);
    }
    reindex(path.resolve(args[1]));
  } else if (args.length >= 2) {
    console.log(makeJobId(args[0], args[1], args[2] || ''));
  } else {
    console.error('Usage: node scripts/job-id.js "<company>" "<job title>" "[job url]"');
    console.error('       node scripts/job-id.js --reindex <jobs.csv>');
    process.exit(1);
  }
}

module.exports = { canonicalizeUrl, makeJobId };
