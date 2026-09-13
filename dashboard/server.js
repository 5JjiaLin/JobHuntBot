// Zero-dependency static file server for the local JobHuntBot dashboard.
//
// Serves this folder on http://127.0.0.1:8420 so dashboard.html can fetch()
// the workspace CSV files with fresh data on every reload, and exposes write
// endpoints so the dashboard can:
//   - mark a job as Submitted / Pending / Offer / Rejected  (POST /api/update-status)
//   - add / edit / delete interview & assessment events     (POST /api/calendar/*)
//   - resolve a blocker                                     (POST /api/blocker/resolve)
//
// Every write targets the single source of truth:
//   workspace/<target-role-slug>/jobs.csv
// and identifies a job by its stable `job_id` (never by row position).
//
// Security posture (local-first, no auth by design):
//   - binds to 127.0.0.1 only
//   - validates the Host header against loopback variants
//   - validates the Origin header on state-changing requests
//   - contains every file read inside ROOT or WORKSPACE_DIR
//   - rejects oversized request bodies with 413
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8420;
const ROOT = __dirname; // the dashboard/ folder
const MAX_BODY_BYTES = 1e6;

// Only loopback hosts / origins are accepted. The server can write files, so
// anything reachable from another device is out of scope by design.
const ALLOWED_HOSTS = new Set(['localhost:8420', '127.0.0.1:8420', '[::1]:8420']);
const ALLOWED_ORIGINS = new Set([
  'http://localhost:8420',
  'http://127.0.0.1:8420',
  'http://[::1]:8420',
]);

// Single source of truth: workspace/<target-role-slug>/jobs.csv.
//
// dashboard/config.json is a *local*, gitignored file produced by
// `npm run init:workspace`. A fresh clone only ships config.example.json, so
// the server must boot without it: it stays "unconfigured", serves empty
// tables and asks the user to initialise — it never crashes and never writes
// into the dashboard folder itself.
let WORKSPACE_DIR = null;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  if (cfg && typeof cfg.workspace_dir === 'string' && cfg.workspace_dir.trim()) {
    WORKSPACE_DIR = path.resolve(ROOT, cfg.workspace_dir.trim());
  }
} catch (e) {
  // missing / unreadable config.json → stay unconfigured
}
const WORKSPACE_CONFIGURED = WORKSPACE_DIR !== null;
const JOB_POOL_PATH = WORKSPACE_CONFIGURED ? path.join(WORKSPACE_DIR, 'jobs.csv') : null;
const FOLLOW_UP_PATH = WORKSPACE_CONFIGURED ? path.join(WORKSPACE_DIR, 'follow_up.csv') : null;

// The dashboard UI still requests these filenames; serve them from the
// workspace so the front-end stays unchanged while the data lives in one place.
const DATA_FILE_MAP = {
  'job_pool.csv': 'jobs.csv',
  'follow_up.csv': 'follow_up.csv',
  'application_log.csv': 'application_log.csv',
  'blocker_queue.csv': 'blockers.csv',
};

// Canonical table headers — shared with scripts/init-workspace.js so a freshly
// scaffolded workspace always matches what the dashboard reads and writes.
const { WORKSPACE_HEADERS } = require('./workspace-schema');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ---------------- security helpers ----------------

// Strict containment check. A plain `startsWith` can be fooled by sibling
// directories sharing a prefix (e.g. /app vs /app-secret), so compare with
// path.relative instead.
function isPathInside(base, target) {
  const relative = path.relative(base, target);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function reject(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

// ---------------- CSV (same quoted dialect the workspace files use) ----------------

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function stringifyField(f) {
  return '"' + String(f == null ? '' : f).replace(/"/g, '""') + '"';
}

function stringifyCSV(rows) {
  return rows.map(r => r.map(stringifyField).join(',')).join('\r\n') + '\r\n';
}

function readCSVRows(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  // Strip ALL leading UTF-8 BOMs. These CSVs can accumulate stacked BOM bytes
  // from repeated external writes; one stray BOM turns the first header cell
  // into "\ufeffdate" and breaks every indexOf-based lookup, so loop until
  // none remain (instead of removing a single one).
  while (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = parseCSV(text);
  return { header: rows[0] || [], dataRows: rows.slice(1) };
}

function writeCSVRows(filePath, header, dataRows) {
  fs.writeFileSync(filePath, '\uFEFF' + stringifyCSV([header, ...dataRows]));
}

function httpError(status, message) {
  const e = new Error(message);
  e.httpStatus = status;
  return e;
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        // Stop accumulating and let the caller answer with a proper 413 —
        // never just destroy the socket.
        aborted = true;
        reject(httpError(413, 'Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(httpError(400, 'Invalid JSON body')); }
    });
    req.on('error', () => { if (!aborted) reject(httpError(400, 'Request error')); });
  });
}

function sendJSON(res, statusCode, obj) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------------- job lookup ----------------

// Resolve a job row by stable `job_id`. Falls back to company + job_title only
// for legacy workspaces that predate job_id; row position is never used as an
// identity, so re-sorting or inserting rows can never update the wrong job.
function findJobRow(selector) {
  if (!WORKSPACE_CONFIGURED) {
    throw httpError(503, 'Workspace not initialised. Run: npm run init:workspace -- "<target role>"');
  }
  const { header, dataRows } = readCSVRows(JOB_POOL_PATH);
  const idCol = header.indexOf('job_id');
  const cCol = header.indexOf('company');
  const tCol = header.indexOf('job_title');
  if (cCol === -1 || tCol === -1) {
    throw httpError(500, 'jobs.csv is missing an expected column (company/job_title)');
  }

  const jobId = String((selector && selector.job_id) || '').trim();
  let idx = -1;
  if (jobId && idCol !== -1) {
    idx = dataRows.findIndex(r => String(r[idCol] || '').trim() === jobId);
  }
  if (idx === -1) {
    const company = String((selector && selector.company) || '');
    const jobTitle = String((selector && selector.job_title) || '');
    if (company && jobTitle) {
      idx = dataRows.findIndex(r => r[cCol] === company && r[tCol] === jobTitle);
    }
  }
  if (idx === -1) {
    throw httpError(404, 'Job not found — provide a valid job_id (or company + job_title)');
  }
  return { header, dataRows, idx, row: dataRows[idx], idCol, cCol, tCol };
}

function requireColumn(header, name) {
  const col = header.indexOf(name);
  if (col === -1) throw httpError(500, `jobs.csv is missing an expected column (${name})`);
  return col;
}

// ---------------- write endpoints ----------------

async function handleUpdateStatus(req, res) {
  let payload;
  try { payload = await readJSONBody(req); }
  catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  const status = payload && payload.status;
  if (!['Submitted', 'Offer', 'Rejected', 'Pending'].includes(status)) {
    return sendJSON(res, 400, { ok: false, error: 'status must be one of Submitted/Offer/Rejected/Pending' });
  }

  let found;
  try { found = findJobRow(payload); }
  catch (e) { return sendJSON(res, e.httpStatus || 500, { ok: false, error: e.message }); }

  const statusCol = requireColumn(found.header, 'status');
  found.row[statusCol] = status;

  try { writeCSVRows(JOB_POOL_PATH, found.header, found.dataRows); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not write jobs.csv: ' + e.message }); }

  sendJSON(res, 200, { ok: true, job_id: String(found.row[found.idCol] || '').trim(), status });
}

async function handleBlockerResolve(req, res) {
  let payload;
  try { payload = await readJSONBody(req); }
  catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  let found;
  try { found = findJobRow(payload); }
  catch (e) { return sendJSON(res, e.httpStatus || 500, { ok: false, error: e.message }); }

  const bCol = requireColumn(found.header, 'blocker');
  const nCol = requireColumn(found.header, 'next_action');
  // Only the two blocker columns are touched — status / priority / notes / tier
  // are left intact so resolving a blocker never loses application state.
  found.row[bCol] = '';
  found.row[nCol] = '待投递(阻塞已解决)';

  try { writeCSVRows(JOB_POOL_PATH, found.header, found.dataRows); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not write jobs.csv: ' + e.message }); }

  sendJSON(res, 200, { ok: true, job_id: String(found.row[found.idCol] || '').trim() });
}

// Calendar events belong to jobs the user has already applied to.
function locateAppliedJob(selector) {
  const found = findJobRow(selector);
  const statusCol = found.header.indexOf('status');
  if (statusCol === -1 || found.row[statusCol] !== 'Submitted') {
    throw httpError(409, 'This job is not in the Submitted/Applied bucket — calendar events are only for already-applied jobs');
  }
  return found;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function validateEvent(date, time, event_type) {
  if (!DATE_RE.test(date)) throw httpError(400, 'date must be YYYY-MM-DD');
  if (!TIME_RE.test(time)) throw httpError(400, 'time must be HH:MM');
  if (typeof event_type !== 'string' || !event_type.trim()) {
    throw httpError(400, 'event_type is required');
  }
}

async function handleCalendarAdd(req, res) {
  let payload;
  try { payload = await readJSONBody(req); }
  catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  const { date, time, event_type } = payload || {};
  let job;
  try {
    validateEvent(date, time, event_type);
    job = locateAppliedJob(payload);
  } catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  // current_stage is the event content verbatim — no auto-suffix. Every
  // company's process reads differently, so don't guess a shared phrasing
  // convention on top of what the user typed.
  const stage = event_type.trim();
  const stageCol = job.header.indexOf('current_stage');
  if (stageCol !== -1) job.row[stageCol] = stage;

  let fuHeader, fuDataRows;
  try { ({ header: fuHeader, dataRows: fuDataRows } = readCSVRows(FOLLOW_UP_PATH)); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not read follow_up.csv: ' + e.message }); }

  const cols = ['date', 'company', 'job_title', 'event_type', 'status', 'time'];
  if (cols.some(c => fuHeader.indexOf(c) === -1)) {
    return sendJSON(res, 500, { ok: false, error: 'follow_up.csv is missing an expected column' });
  }
  const newRow = new Array(fuHeader.length).fill('');
  newRow[fuHeader.indexOf('date')] = date;
  newRow[fuHeader.indexOf('company')] = job.row[job.cCol];
  newRow[fuHeader.indexOf('job_title')] = job.row[job.tCol];
  newRow[fuHeader.indexOf('event_type')] = stage;
  newRow[fuHeader.indexOf('status')] = 'Scheduled';
  newRow[fuHeader.indexOf('time')] = time;
  fuDataRows.push(newRow);

  try {
    writeCSVRows(JOB_POOL_PATH, job.header, job.dataRows);
    writeCSVRows(FOLLOW_UP_PATH, fuHeader, fuDataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write workspace files: ' + e.message });
  }

  sendJSON(res, 200, {
    ok: true,
    job_id: String(job.row[job.idCol] || '').trim(),
    followUpRowIndex: fuDataRows.length - 1,
    current_stage: stage,
  });
}

async function handleCalendarUpdate(req, res) {
  let payload;
  try { payload = await readJSONBody(req); }
  catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  const { followUpRowIndex, date, time, event_type } = payload || {};
  if (!Number.isInteger(followUpRowIndex) || followUpRowIndex < 0) {
    return sendJSON(res, 400, { ok: false, error: 'followUpRowIndex must be a non-negative integer' });
  }

  let job;
  try {
    validateEvent(date, time, event_type);
    job = locateAppliedJob(payload);
  } catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  let fuHeader, fuDataRows;
  try { ({ header: fuHeader, dataRows: fuDataRows } = readCSVRows(FOLLOW_UP_PATH)); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not read follow_up.csv: ' + e.message }); }

  if (followUpRowIndex >= fuDataRows.length) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer exists — the calendar may have changed, please refresh' });
  }
  const fuTarget = fuDataRows[followUpRowIndex];
  const fuCompanyCol = fuHeader.indexOf('company');
  const fuTitleCol = fuHeader.indexOf('job_title');
  if (fuTarget[fuCompanyCol] !== job.row[job.cCol] || fuTarget[fuTitleCol] !== job.row[job.tCol]) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer matches this job — the calendar may have changed, please refresh' });
  }

  const stage = event_type.trim();
  fuTarget[fuHeader.indexOf('date')] = date;
  fuTarget[fuHeader.indexOf('time')] = time;
  fuTarget[fuHeader.indexOf('event_type')] = stage;
  const stageCol = job.header.indexOf('current_stage');
  if (stageCol !== -1) job.row[stageCol] = stage;

  try {
    writeCSVRows(FOLLOW_UP_PATH, fuHeader, fuDataRows);
    writeCSVRows(JOB_POOL_PATH, job.header, job.dataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write workspace files: ' + e.message });
  }

  sendJSON(res, 200, { ok: true, job_id: String(job.row[job.idCol] || '').trim(), current_stage: stage });
}

async function handleCalendarDelete(req, res) {
  let payload;
  try { payload = await readJSONBody(req); }
  catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  const { followUpRowIndex } = payload || {};
  if (!Number.isInteger(followUpRowIndex) || followUpRowIndex < 0) {
    return sendJSON(res, 400, { ok: false, error: 'followUpRowIndex must be a non-negative integer' });
  }
  if (!WORKSPACE_CONFIGURED) {
    return sendJSON(res, 503, { ok: false, error: 'Workspace not initialised.' });
  }

  let fuHeader, fuDataRows;
  try { ({ header: fuHeader, dataRows: fuDataRows } = readCSVRows(FOLLOW_UP_PATH)); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not read follow_up.csv: ' + e.message }); }

  if (followUpRowIndex >= fuDataRows.length) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer exists — the calendar may have changed, please refresh' });
  }
  fuDataRows.splice(followUpRowIndex, 1);

  try { writeCSVRows(FOLLOW_UP_PATH, fuHeader, fuDataRows); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not write follow_up.csv: ' + e.message }); }

  // Deliberately does not revert jobs.csv current_stage — there's no reliable
  // "previous stage" to roll back to. Edit the stage manually if deleting this
  // event should also change what's shown on the job card.
  sendJSON(res, 200, { ok: true });
}

const ROUTES = {
  '/api/update-status': handleUpdateStatus,
  '/api/blocker/resolve': handleBlockerResolve,
  '/api/calendar/add': handleCalendarAdd,
  '/api/calendar/update': handleCalendarUpdate,
  '/api/calendar/delete': handleCalendarDelete,
};

// ---------------- workspace bootstrap ----------------

function ensureWorkspace() {
  if (!WORKSPACE_CONFIGURED) return;
  try {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    for (const [file, header] of Object.entries(WORKSPACE_HEADERS)) {
      const p = path.join(WORKSPACE_DIR, file);
      if (!fs.existsSync(p)) {
        writeCSVRows(p, header, []);
        console.log('Created empty workspace file: ' + p);
      }
    }
  } catch (e) {
    console.warn('Could not initialize workspace directory: ' + e.message);
  }
}

function serveFile(res, filePath, fallbackHeaders) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Workspace tables may legitimately not exist yet (fresh init). Serve a
      // header-only table so the UI renders an empty state instead of breaking.
      if (fallbackHeaders) {
        res.writeHead(200, { 'Content-Type': MIME['.csv'], 'Cache-Control': 'no-store' });
        res.end('\uFEFF' + stringifyCSV([fallbackHeaders]));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  // Host must be a loopback variant: this server can write to the workspace.
  const host = String(req.headers.host || '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return reject(res, 403, 'Forbidden: invalid Host');
  }

  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (req.method === 'POST') {
    // Browsers always send Origin on cross-origin POST. Local CLI/test tools
    // may omit it — allow that, but never accept a foreign Origin.
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) {
      return reject(res, 403, 'Forbidden: invalid Origin');
    }
    if (ROUTES[urlPath]) {
      ROUTES[urlPath](req, res);
      return;
    }
    return reject(res, 404, 'Not found');
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  const servedPath = urlPath === '/' ? '/dashboard.html' : urlPath;
  const baseName = path.basename(servedPath);
  const mappedName = DATA_FILE_MAP[baseName];

  if (mappedName) {
    // Data files come from the workspace and must stay inside it.
    if (!WORKSPACE_CONFIGURED) {
      res.writeHead(200, { 'Content-Type': MIME['.csv'], 'Cache-Control': 'no-store' });
      res.end('\uFEFF' + stringifyCSV([WORKSPACE_HEADERS[mappedName]]));
      return;
    }
    const target = path.resolve(WORKSPACE_DIR, mappedName);
    if (!isPathInside(WORKSPACE_DIR, target)) return reject(res, 403, 'Forbidden');
    return serveFile(res, target, WORKSPACE_HEADERS[mappedName]);
  }

  const target = path.resolve(ROOT, '.' + servedPath);
  if (!isPathInside(ROOT, target)) return reject(res, 403, 'Forbidden');
  return serveFile(res, target, null);
});

// Make sure the workspace data files exist before serving, so a fresh clone
// with a configured workspace boots cleanly. Never touches existing files.
ensureWorkspace();

// Bind to loopback only — this server can write to the workspace, so it should
// never be reachable from another device on the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log('JobHuntBot dashboard running: http://localhost:' + PORT + '/dashboard.html');
  if (!WORKSPACE_CONFIGURED) {
    console.log('');
    console.log('No workspace configured yet (dashboard/config.json is missing or empty).');
    console.log('Initialise one with:  npm run init:workspace -- "<target role>"');
    console.log('Until then the dashboard renders empty tables.');
  } else {
    console.log('Workspace: ' + WORKSPACE_DIR);
  }
  console.log('Keep this window open to keep serving; close it or press Ctrl+C to stop.');
});
