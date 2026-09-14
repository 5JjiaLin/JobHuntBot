#!/usr/bin/env node
'use strict';

// Regression test for JobHuntBot v1.0 consistency guarantees.
//
// Covers:
//   - application_log write + rollback on transition Submitted/Reverted
//   - blockers.csv as single source of truth (multi-blocker resolve)
//   - target_role read chain from /api/config
//   - job_id presence / uniqueness
//   - six dashboard views present in HTML
//   - security smoke checks (traversal, Host, Origin, payload limit)
//   - fresh-clone Quick Start simulation
//   - internal markdown link sanity
//   - gitignored real workspace excluded from Git
//
// This test never touches the user's real workspace: it always starts the server
// against a throw-away copy of examples/demo-workspace.

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { tmpdir } = require('os');

const PORT = 8420;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const DASHBOARD = path.join(ROOT, 'dashboard');
const DEMO_WS = path.join(ROOT, 'examples', 'demo-workspace');

let failures = 0;
let notTested = 0;

function check(name, condition, detail) {
  if (condition) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(name, reason) {
  notTested++;
  console.log(`  NOTE  ${name} — ${reason}`);
}

function request(method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function rawRequest(raw) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, '127.0.0.1', () => socket.write(raw));
    let data = '';
    socket.on('data', c => { data += c; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { await request('GET', '/dashboard.html'); return; } catch (e) {
      await new Promise(r => setTimeout(r, 250));
    }
  }
  throw new Error('server did not start on port ' + PORT);
}

function readCSV(p) {
  let text = fs.readFileSync(p, 'utf8');
  while (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
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
  return { header: rows[0] || [], data: rows.slice(1) };
}
function writeCSV(p, header, data) {
  const quote = f => '"' + String(f == null ? '' : f).replace(/"/g, '""') + '"';
  fs.writeFileSync(p, '\uFEFF' + [header, ...data].map(r => r.map(quote).join(',')).join('\r\n') + '\r\n');
}

function runCmd(cmd, opts = {}) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }); }
  catch (e) { return { error: e, stdout: e.stdout || '', stderr: e.stderr || '' }; }
}

function runSmokeTest() {
  console.log('\n=== 1. Security smoke test (npm run test:security) ===');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'security-smoke-test.js')], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', d => { out += d; process.stdout.write(d); });
    child.stderr.on('data', d => { out += d; process.stderr.write(d); });
    child.on('close', code => {
      check('security smoke test exits 0', code === 0, `exit ${code}`);
      resolve();
    });
  });
}

async function runFreshCloneTest() {
  console.log('\n=== 2. Fresh-clone simulation ===');
  const cloneDir = fs.mkdtempSync(path.join(tmpdir(), 'jhb-clone-'));
  try {
    fs.cpSync(ROOT, cloneDir, { recursive: true, force: true, filter: (src) => {
      const rel = path.relative(ROOT, src);
      // Do not copy real user workspace or git objects to keep the clone realistic.
      if (rel.startsWith('workspace' + path.sep) && rel !== 'workspace') return false;
      if (rel.startsWith('.git' + path.sep)) return false;
      if (rel === 'node_modules') return false;
      return true;
    }});
    const cloneDashboard = path.join(cloneDir, 'dashboard');
    // Fresh clone has no dashboard/config.json; remove if copy brought one.
    try { fs.unlinkSync(path.join(cloneDashboard, 'config.json')); } catch (e) { /* ok */ }

    const out = runCmd('npm run init:workspace -- "Regression PM"', { cwd: cloneDir });
    const ok = !out.error && fs.existsSync(path.join(cloneDir, 'workspace', 'regression-pm', 'jobs.csv'));
    check('fresh clone init:workspace creates workspace', ok, out.error ? String(out.error) : 'workspace missing');

    const cloneCode = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(cloneDir, 'scripts', 'security-smoke-test.js')], { cwd: cloneDir });
      child.stdout.on('data', d => process.stdout.write(d));
      child.stderr.on('data', d => process.stderr.write(d));
      child.on('close', c => resolve(c));
    });
    check('fresh clone security smoke test passes', cloneCode === 0, `exit ${cloneCode}`);
  } finally {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}

async function runApiTests() {
  console.log('\n=== 3. API consistency tests against demo workspace ===');
  const tempWs = fs.mkdtempSync(path.join(tmpdir(), 'jhb-regression-ws-'));
  fs.cpSync(DEMO_WS, tempWs, { recursive: true, force: true });

  const server = spawn(process.execPath, [path.join(DASHBOARD, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, JOBHUNTBOT_WORKSPACE_DIR: tempWs, JOBHUNTBOT_TARGET_ROLE: 'Regression 产品经理' },
    stdio: 'ignore',
  });

  try {
    await waitForServer();

    // 3.1 target_role
    let r = await request('GET', '/api/config');
    check('GET /api/config returns target_role', r.status === 200 && JSON.parse(r.body).target_role === 'Regression 产品经理', r.body);

    // 3.2 dashboard HTML + six views
    r = await request('GET', '/dashboard.html');
    const html = r.body;
    check('GET /dashboard.html → 200', r.status === 200);
    ['view-today', 'view-jobs', 'view-pipeline', 'view-calendar', 'view-blockers', 'view-settings']
      .forEach(id => check(`dashboard contains #${id}`, html.indexOf(`id="${id}"`) !== -1));

    // 3.3 job_id uniqueness / presence
    r = await request('GET', '/job_pool.csv');
    const jobs = readCSVString(r.body);
    const idCol = jobs.header.indexOf('job_id');
    const ids = jobs.data.map(row => idCol !== -1 ? String(row[idCol] || '').trim() : '').filter(Boolean);
    check('jobs.csv has job_id column', idCol !== -1);
    check('every job has a non-empty job_id', ids.length === jobs.data.length && jobs.data.length > 0);
    check('job_id values are unique', ids.length === new Set(ids).size);

    // Pick a Pending job for the transition tests
    const statusCol = jobs.header.indexOf('status');
    const pendingIdx = jobs.data.findIndex(row => (statusCol !== -1 ? String(row[statusCol] || '').trim() : '') === 'Pending');
    check('demo workspace has at least one Pending job', pendingIdx !== -1);
    if (pendingIdx === -1) return;
    const testJob = jobs.data[pendingIdx];
    const testJobId = String(testJob[idCol]).trim();

    // 3.4 application_log write on Pending → Submitted
    r = await request('POST', '/api/update-status', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8420' },
      body: JSON.stringify({ job_id: testJobId, status: 'Submitted' }),
    });
    check('POST update-status Submitted → 200', r.status === 200 && JSON.parse(r.body).ok);
    const log1 = readCSV(path.join(tempWs, 'application_log.csv'));
    const logStatusCol = log1.header.indexOf('status');
    const submittedRows = log1.data.filter(row => String(row[logStatusCol] || '').trim() === 'Submitted');
    check('application_log records Submitted row', submittedRows.length >= 1);
    const logJobIdCol = log1.header.indexOf('job_id');
    check('application_log row has job_id', logJobIdCol !== -1 && submittedRows.some(row => String(row[logJobIdCol] || '').trim() === testJobId));

    // 3.5 revert to Pending records Reverted
    r = await request('POST', '/api/update-status', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8420' },
      body: JSON.stringify({ job_id: testJobId, status: 'Pending' }),
    });
    check('POST update-status Pending (revert) → 200', r.status === 200 && JSON.parse(r.body).ok);
    const log2 = readCSV(path.join(tempWs, 'application_log.csv'));
    const logStatusCol2 = log2.header.indexOf('status');
    const revertedRows = log2.data.filter(row => String(row[logStatusCol2] || '').trim() === 'Reverted');
    check('application_log records Reverted row after revert', revertedRows.length >= 1);

    // 3.6 blockers.csv single-source + multi-blocker resolve
    const bPath = path.join(tempWs, 'blockers.csv');
    const b = readCSV(bPath);
    const bHeader = b.header.length ? b.header : ['blocker_id', 'job_id', 'type', 'reason', 'next_action', 'status', 'created_at', 'resolved_at'];
    const bIdCol = bHeader.indexOf('blocker_id');
    const bJobCol = bHeader.indexOf('job_id');
    const bStatusCol = bHeader.indexOf('status');

    // Append two active blockers for the same job
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const makeRow = (id, reason) => {
      const row = new Array(bHeader.length).fill('');
      row[bIdCol] = id;
      row[bJobCol] = testJobId;
      row[bHeader.indexOf('type')] = 'other';
      row[bHeader.indexOf('reason')] = reason;
      row[bHeader.indexOf('next_action')] = 'next action';
      row[bStatusCol] = 'open';
      row[bHeader.indexOf('created_at')] = now;
      return row;
    };
    b.data.push(makeRow('blk-test-1', 'First blocker'));
    b.data.push(makeRow('blk-test-2', 'Second blocker'));
    writeCSV(bPath, bHeader, b.data);

    // Resolve first blocker → should still be blocked
    r = await request('POST', '/api/blocker/resolve', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8420' },
      body: JSON.stringify({ job_id: testJobId, blocker_id: 'blk-test-1' }),
    });
    let body = JSON.parse(r.body || '{}');
    check('POST blocker/resolve first → 200', r.status === 200 && body.ok);
    check('after resolving one blocker, one active remains', body.remaining_active === 1, `remaining=${body.remaining_active}`);
    const bAfter1 = readCSV(bPath);
    const active1 = bAfter1.data.filter(row => String(row[bStatusCol] || '').trim().toLowerCase() === 'open');
    check('blockers.csv history retains resolved row', bAfter1.data.length >= 2);

    // Resolve second blocker → no active left
    r = await request('POST', '/api/blocker/resolve', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8420' },
      body: JSON.stringify({ job_id: testJobId, blocker_id: 'blk-test-2' }),
    });
    body = JSON.parse(r.body || '{}');
    check('POST blocker/resolve second → 200', r.status === 200 && body.ok);
    check('after resolving last blocker, zero active remain', body.remaining_active === 0, `remaining=${body.remaining_active}`);
    const jobsAfter = readCSV(path.join(tempWs, 'jobs.csv'));
    const blkCol = jobsAfter.header.indexOf('blocker');
    const jobRowAfter = jobsAfter.data.find(row => String(row[idCol] || '').trim() === testJobId);
    check('jobs.csv.blocker cleared when no active blocker remains', !jobRowAfter || !String(jobRowAfter[blkCol] || '').trim(), `blocker="${jobRowAfter ? jobRowAfter[blkCol] : ''}"`);

    // 3.7 security sanity (inline subset)
    console.log('\n  --- inline security checks ---');
    r = await request('GET', '/dashboard.html', { headers: { Host: 'evil.example.com' } });
    check('foreign Host → 403', r.status === 403);
    r = await request('POST', '/api/update-status', { headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example.com' }, body: JSON.stringify({ job_id: 'x', status: 'Pending' }) });
    check('foreign Origin POST → 403', r.status === 403);
    const raw = await rawRequest('GET /../package.json HTTP/1.1\r\nHost: 127.0.0.1:8420\r\nConnection: close\r\n\r\n');
    check('raw path traversal → 403', /^HTTP\/1\.[01] 403/.test(raw), raw.split('\r\n')[0]);
  } finally {
    server.kill();
    fs.rmSync(tempWs, { recursive: true, force: true });
  }
}

function readCSVString(text) {
  let t = text;
  while (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i], next = t[i + 1];
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
  return { header: rows[0] || [], data: rows.slice(1) };
}

function checkInternalLinks() {
  console.log('\n=== 4. Internal markdown links ===');
  const files = [
    path.join(ROOT, 'README.md'),
    path.join(ROOT, 'docs', 'README.zh-CN.md'),
    path.join(ROOT, 'CONTRIBUTING.md'),
    path.join(ROOT, 'SECURITY.md'),
    path.join(ROOT, 'SKILL.md'),
  ].filter(fs.existsSync);
  let checked = 0;
  files.forEach(f => {
    const text = fs.readFileSync(f, 'utf8');
    const re = /\[([^\]]*)\]\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(text))) {
      const url = m[2];
      if (url.startsWith('http://') || url.startsWith('https://')) continue; // skip external
      if (url.startsWith('#')) continue; // anchor
      const abs = path.resolve(path.dirname(f), url.split('#')[0].split('?')[0]);
      if (fs.existsSync(abs)) { checked++; }
      else { failures++; console.error(`  FAIL  broken link in ${path.basename(f)}: ${url}`); }
    }
  });
  check(`${checked} internal markdown links resolve`, checked > 0);
}

function checkGitignore() {
  console.log('\n=== 5. Real workspace excluded from Git ===');
  try {
    const out = execSync('git check-ignore workspace/ai-产品经理/jobs.csv', { cwd: ROOT, encoding: 'utf8' });
    check('git check-ignore workspace/ai-产品经理/jobs.csv', out.trim().length > 0);
  } catch (e) {
    failures++; console.error('  FAIL  real workspace jobs.csv is not gitignored');
  }
}

async function main() {
  console.log('JobHuntBot v1.0 regression test');
  await runSmokeTest();
  await runFreshCloneTest();
  await runApiTests();
  checkInternalLinks();
  checkGitignore();

  console.log('\n=== Summary ===');
  console.log(`FAIL: ${failures}   NOTE (manual/skipped): ${notTested}`);
  if (failures) {
    console.error('Regression test FAILED');
    process.exit(1);
  }
  console.log('Regression test PASSED');
}

main().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
