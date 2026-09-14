#!/usr/bin/env node
'use strict';

// One-off migration: make blockers.csv the single source of truth.
//
// For any job in jobs.csv that still carries free-text in its `blocker` column
// but has no corresponding *active* row in blockers.csv, create a structured
// blocker record. Idempotent: re-running never duplicates an already-migrated
// blocker (matched by a stable blocker_id derived from job_id + reason).
//
// Usage:
//   npm run migrate:blockers                 # uses dashboard/config.json workspace
//   node scripts/migrate-blockers.js <dir>   # explicit workspace dir
//
// Requires the dashboard server's CSV helpers, so it shares the exact dialect.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WORKSPACE_HEADERS } = require('../dashboard/workspace-schema');

const ROOT = path.join(__dirname, '..', 'dashboard');

function resolveWorkspaceDir(explicit) {
  if (explicit) return path.resolve(explicit);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    if (cfg && typeof cfg.workspace_dir === 'string' && cfg.workspace_dir.trim()) {
      return path.resolve(ROOT, cfg.workspace_dir.trim());
    }
  } catch (e) { /* ignore */ }
  return null;
}

// Re-implement the minimal CSV dialect (kept in sync with dashboard/server.js).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}
function stringifyField(f) { return '"' + String(f == null ? '' : f).replace(/"/g, '""') + '"'; }
function stringifyCSV(rows) { return rows.map(r => r.map(stringifyField).join(',')).join('\r\n') + '\r\n'; }
function readCSVRows(p) {
  let text = fs.readFileSync(p, 'utf8');
  while (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = parseCSV(text);
  return { header: rows[0] || [], dataRows: rows.slice(1) };
}
function writeCSVRows(p, header, dataRows) {
  fs.writeFileSync(p, '\uFEFF' + stringifyCSV([header, ...dataRows]));
}
function stableBlockerId(jobId, reason) {
  const h = crypto.createHash('sha1').update(jobId + '|' + reason).digest('hex');
  return 'jh-' + h.slice(0, 12) + '-blk';
}
function isActive(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '' || s === 'open' || s === 'active' || s === 'pending';
}

function main() {
  const wsDir = resolveWorkspaceDir(process.argv[2]);
  if (!wsDir) {
    console.error('No workspace configured. Run `npm run init:workspace -- "<role>"` first, or pass a dir.');
    process.exit(1);
  }
  const jobsPath = path.join(wsDir, 'jobs.csv');
  const blockersPath = path.join(wsDir, 'blockers.csv');
  if (!fs.existsSync(jobsPath)) {
    console.error('jobs.csv not found at ' + jobsPath);
    process.exit(1);
  }

  const { header: jh, dataRows: jd } = readCSVRows(jobsPath);
  const jIdCol = jh.indexOf('job_id'), jBlkCol = jh.indexOf('blocker'), jStatusCol = jh.indexOf('status'), jNaCol = jh.indexOf('next_action');

  let bHeader, bData;
  if (fs.existsSync(blockersPath)) {
    ({ header: bHeader, dataRows: bData } = readCSVRows(blockersPath));
  } else {
    bHeader = WORKSPACE_HEADERS['blockers.csv'].slice();
    bData = [];
  }
  if (!bHeader.length) bHeader = WORKSPACE_HEADERS['blockers.csv'].slice();
  const bIdCol = bHeader.indexOf('blocker_id'), bJobCol = bHeader.indexOf('job_id'), bStatusCol = bHeader.indexOf('status');

  const existingIds = new Set(bData.map(r => String(r[bIdCol] || '').trim()));
  const created = [];
  const TERMINAL = new Set(['Offer', 'Rejected', '排除-内容创作岗', '已过期']);

  for (const r of jd) {
    const jobId = String(r[jIdCol] || '').trim();
    const blockerText = String(r[jBlkCol] || '').trim();
    const status = String(r[jStatusCol] || '').trim();
    if (!jobId || !blockerText) continue;
    if (TERMINAL.has(status)) continue;
    const id = stableBlockerId(jobId, blockerText);
    if (existingIds.has(id)) continue; // already migrated
    // Also skip if an active blocker for this job already exists (avoid noise).
    if (bData.some(x => String(x[bJobCol] || '').trim() === jobId && isActive(x[bStatusCol]))) continue;
    const row = new Array(bHeader.length).fill('');
    const set = (name, val) => { const i = bHeader.indexOf(name); if (i !== -1) row[i] = val; };
    set('blocker_id', id);
    set('job_id', jobId);
    set('type', 'other');
    set('reason', blockerText);
    set('next_action', jNaCol !== -1 ? String(r[jNaCol] || '') : '');
    set('status', 'open');
    bData.push(row);
    existingIds.add(id);
    created.push(jobId);
  }

  if (created.length) {
    writeCSVRows(blockersPath, bHeader, bData);
    console.log('Migrated ' + created.length + ' blocker(s) into blockers.csv:');
    created.forEach(id => console.log('  - ' + id));
  } else {
    console.log('Nothing to migrate — blockers.csv is already the single source.');
  }
}

main();
