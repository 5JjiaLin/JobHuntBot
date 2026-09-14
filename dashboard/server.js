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
let TARGET_ROLE = '';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  if (cfg && typeof cfg.workspace_dir === 'string' && cfg.workspace_dir.trim()) {
    WORKSPACE_DIR = path.resolve(ROOT, cfg.workspace_dir.trim());
  }
  if (cfg && typeof cfg.target_role === 'string') TARGET_ROLE = cfg.target_role.trim();
} catch (e) {
  // missing / unreadable config.json → stay unconfigured
}

// Test / CI hook: redirect the workspace without editing the gitignored
// dashboard/config.json. Takes precedence over whatever config.json says.
if (process.env.JOBHUNTBOT_WORKSPACE_DIR) {
  WORKSPACE_DIR = path.resolve(process.env.JOBHUNTBOT_WORKSPACE_DIR);
}
if (process.env.JOBHUNTBOT_TARGET_ROLE) {
  TARGET_ROLE = process.env.JOBHUNTBOT_TARGET_ROLE;
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

// ---------------- helpers: time, snapshots, application log ----------------

function localTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function safeRead(filePath) {
  try { return fs.readFileSync(filePath); } catch (e) { return null; }
}

// Best-effort byte-level rollback so a half-applied write never leaves the two
// tables disagreeing with each other.
function restore(filePath, bytes) {
  if (!bytes) return;
  try { fs.writeFileSync(filePath, bytes); } catch (e) { /* nothing else to try */ }
}

// A blocker is "live" until it is explicitly resolved/closed.
function isActiveBlockerStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === '' || v === 'open' || v === 'active' || v === 'pending';
}

function jobSnapshot(header, row) {
  const get = name => {
    const i = header.indexOf(name);
    return i === -1 ? '' : String(row[i] || '');
  };
  return {
    job_id: get('job_id'),
    company: get('company'),
    job_title: get('job_title'),
    job_url: get('job_url'),
    source: get('source'),
  };
}

// Append one row to application_log.csv. Evidence fields are deliberately left
// blank: a confirmation email or screenshot can only come from the user, and
// inventing one would corrupt the audit trail.
//
// The schema is normalised to the canonical header (job_id-first) on every
// write, so a pre-existing log file that predates the job_id column is migrated
// in place without dropping its historical rows.
function appendApplicationLog(job, eventStatus) {
  const logPath = path.join(WORKSPACE_DIR, 'application_log.csv');
  const canonical = WORKSPACE_HEADERS['application_log.csv'];
  let header, dataRows;
  if (fs.existsSync(logPath)) {
    ({ header, dataRows } = readCSVRows(logPath));
  } else {
    header = [];
    dataRows = [];
  }
  if (!header.length) {
    header = canonical.slice();
  } else if (header[0] !== 'job_id' || canonical.some(c => header.indexOf(c) === -1)) {
    // Old schema (no job_id or missing a canonical column) → remap in place.
    const remapped = dataRows.map(row => {
      const nr = new Array(canonical.length).fill('');
      canonical.forEach((c, i) => {
        const oi = header.indexOf(c);
        if (oi !== -1) nr[i] = row[oi] !== undefined ? row[oi] : '';
      });
      return nr;
    });
    header = canonical.slice();
    dataRows = remapped;
  }
  const row = new Array(header.length).fill('');
  const set = (name, value) => {
    const i = header.indexOf(name);
    if (i !== -1) row[i] = value;
  };
  set('job_id', job.job_id || '');
  set('attempt_date', localTimestamp());
  set('company', job.company || '');
  set('job_title', job.job_title || '');
  set('job_url', job.job_url || '');
  set('platform', job.source || '');
  set('status', eventStatus);
  dataRows.push(row);
  writeCSVRows(logPath, header, dataRows);
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
  const previous = String(found.row[statusCol] || '').trim();
  if (previous === status) {
    // No real transition — avoid duplicate log rows and pointless rewrites.
    return sendJSON(res, 200, {
      ok: true,
      job_id: String(found.row[found.idCol] || '').trim(),
      status,
      unchanged: true,
    });
  }
  found.row[statusCol] = status;

  // Transactional by intent: keep the exact original bytes so a failed log
  // write can roll jobs.csv back. The status and the log must never diverge
  // silently.
  let originalBytes = null;
  try { originalBytes = fs.readFileSync(JOB_POOL_PATH); } catch (e) { originalBytes = null; }

  try { writeCSVRows(JOB_POOL_PATH, found.header, found.dataRows); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not write jobs.csv: ' + e.message }); }

  const snapshot = jobSnapshot(found.header, found.row);
  const logEvent =
    status === 'Submitted' && previous !== 'Submitted' ? 'Submitted' :
    status === 'Pending' && previous === 'Submitted' ? 'Reverted' : null;

  if (logEvent) {
    try {
      appendApplicationLog(snapshot, logEvent);
    } catch (e) {
      if (originalBytes) {
        try { fs.writeFileSync(JOB_POOL_PATH, originalBytes); } catch (rollbackError) { /* give up cleanly */ }
      }
      return sendJSON(res, 500, {
        ok: false,
        error: '状态未保存：application_log.csv 写入失败，jobs.csv 已回滚 — ' + e.message,
      });
    }
  }

  sendJSON(res, 200, {
    ok: true,
    job_id: snapshot.job_id,
    status,
    logged: logEvent,
  });
}

// Build the compat summary that stays in jobs.csv.blocker. blockers.csv is the
// lifecycle truth; this string is only so legacy readers still see *something*
// on the job row. Empty string means "no active blocker".
function blockerSummary(activeRows, header) {
  if (!activeRows.length) return '';
  const reasonCol = header.indexOf('reason');
  const first = activeRows
    .map(r => (reasonCol !== -1 ? String(r[reasonCol] || '') : ''))
    .find(s => s.trim()) || '阻塞待解决';
  return activeRows.length > 1
    ? `${activeRows.length}个阻塞待解决：${first.slice(0, 40)}`
    : first.slice(0, 60);
}

// Resolve a blocker. `blockers.csv` is the single source of truth:
//   - with `blocker_id`  → resolve that one blocker
//   - with only `job_id` → resolve every *active* blocker for that job
// The job row's `blocker` column is only a compat summary: it is cleared when no
// active blocker remains for the job, otherwise it reflects the remaining ones.
// Either write that fails rolls back the other so the two files never disagree.
async function handleBlockerResolve(req, res) {
  let payload;
  try { payload = await readJSONBody(req); }
  catch (e) { return sendJSON(res, e.httpStatus || 400, { ok: false, error: e.message }); }

  if (!WORKSPACE_CONFIGURED) {
    return sendJSON(res, 503, { ok: false, error: 'Workspace not initialised.' });
  }

  const jobId = String((payload && payload.job_id) || '').trim();
  const blockerId = String((payload && payload.blocker_id) || '').trim();
  if (!jobId && !blockerId) {
    return sendJSON(res, 400, { ok: false, error: 'job_id or blocker_id is required' });
  }

  // The job row is only needed for the compat summary. If the job is missing
  // (orphaned blocker) we still resolve the blocker — just skip the jobs.csv
  // touch rather than failing the whole request.
  let found = null;
  if (jobId) {
    try { found = findJobRow({ job_id: jobId }); }
    catch (e) { found = null; }
  }

  const blockersPath = path.join(WORKSPACE_DIR, 'blockers.csv');
  let bHeader, bData;
  try { ({ header: bHeader, dataRows: bData } = readCSVRows(blockersPath)); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not read blockers.csv: ' + e.message }); }
  if (!bHeader.length) bHeader = WORKSPACE_HEADERS['blockers.csv'].slice();

  const bIdCol = bHeader.indexOf('blocker_id');
  const bJobCol = bHeader.indexOf('job_id');
  const bStatusCol = bHeader.indexOf('status');
  const bResolvedCol = bHeader.indexOf('resolved_at');
  if ([bIdCol, bJobCol, bStatusCol].some(c => c === -1)) {
    return sendJSON(res, 500, { ok: false, error: 'blockers.csv is missing a required column' });
  }

  let targets;
  if (blockerId) {
    const ti = bData.findIndex(r => String(r[bIdCol] || '').trim() === blockerId);
    if (ti === -1) return sendJSON(res, 404, { ok: false, error: 'blocker not found' });
    targets = [ti];
  } else {
    targets = bData
      .map((r, i) => i)
      .filter(i => String(bData[i][bJobCol] || '').trim() === jobId && isActiveBlockerStatus(bData[i][bStatusCol]));
  }
  if (!targets.length) {
    return sendJSON(res, 200, { ok: true, resolved: 0, remaining_active: 0, job_id: jobId, blocker_id: blockerId });
  }

  const now = localTimestamp();
  targets.forEach(i => {
    bData[i][bStatusCol] = 'Resolved';
    if (bResolvedCol !== -1) bData[i][bResolvedCol] = now;
  });
  const remaining = bData.filter(
    r => String(r[bJobCol] || '').trim() === jobId && isActiveBlockerStatus(r[bStatusCol])
  );

  // Rollback-safe: keep blockers.csv original bytes before touching jobs.csv.
  let bOriginal = null;
  try { bOriginal = fs.readFileSync(blockersPath); } catch (e) { bOriginal = null; }
  try { writeCSVRows(blockersPath, bHeader, bData); }
  catch (e) { return sendJSON(res, 500, { ok: false, error: 'Could not write blockers.csv: ' + e.message }); }

  if (!found) {
    return sendJSON(res, 200, {
      ok: true, resolved: targets.length, remaining_active: remaining.length,
      job_id: jobId, blocker_id: blockerId,
    });
  }

  const bCol = found.header.indexOf('blocker');
  if (bCol !== -1) {
    const summary = blockerSummary(remaining, bHeader);
    if (found.row[bCol] !== summary) {
      found.row[bCol] = summary;
      const jOriginal = fs.readFileSync(JOB_POOL_PATH);
      try { writeCSVRows(JOB_POOL_PATH, found.header, found.dataRows); }
      catch (e) {
        if (bOriginal) { try { fs.writeFileSync(blockersPath, bOriginal); } catch (_) { /* give up */ } }
        return sendJSON(res, 500, {
          ok: false,
          error: 'jobs.csv 写入失败，blockers.csv 已回滚 — ' + e.message,
        });
      }
    }
  }

  sendJSON(res, 200, {
    ok: true, resolved: targets.length, remaining_active: remaining.length,
    job_id: jobId, blocker_id: blockerId,
  });
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

  // Lightweight config endpoint so the UI can show the configured target role
  // without reaching into dashboard/config.json (which is gitignored).
  if (urlPath === '/api/config') {
    return sendJSON(res, 200, { target_role: TARGET_ROLE, workspace_configured: WORKSPACE_CONFIGURED });
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
