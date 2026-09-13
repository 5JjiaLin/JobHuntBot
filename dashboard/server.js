// Zero-dependency static file server for the local job-search dashboard.
// Serves this folder on http://localhost:8420 so dashboard.html can fetch()
// the CSV files with fresh data on every reload. Also exposes write
// endpoints so the dashboard can:
//   - mark a job as Offer/Rejected (POST /api/update-status)
//   - add/edit/delete an upcoming calendar event, which also stamps the
//     job's current_stage in job_pool.csv (POST /api/calendar/*)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8420;
const ROOT = __dirname; // the dashboard/ folder

// Single source of truth: workspace/<target-role-slug>/jobs.csv.
// dashboard/config.json may set `workspace_dir` (relative to this folder) and
// `target_role`. If absent, fall back to this folder so the server still boots,
// but the canonical data lives in the workspace, never in a second copy.
let WORKSPACE_DIR = ROOT;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  if (cfg && typeof cfg.workspace_dir === 'string' && cfg.workspace_dir) {
    WORKSPACE_DIR = path.resolve(ROOT, cfg.workspace_dir);
  }
} catch (e) {
  // no config.json — fall back to reading job_pool.csv from this folder
}

const JOB_POOL_PATH = path.join(WORKSPACE_DIR, 'jobs.csv');
const FOLLOW_UP_PATH = path.join(WORKSPACE_DIR, 'follow_up.csv');

// The dashboard UI fetches these filenames; serve them from the workspace so
// the front-end code stays unchanged while the real data lives in workspace/.
const DATA_FILE_MAP = {
  'job_pool.csv': 'jobs.csv',
  'follow_up.csv': 'follow_up.csv',
  'application_log.csv': 'application_log.csv',
  'blocker_queue.csv': 'blockers.csv',
};

// Canonical headers for the workspace data files. On a fresh clone the
// workspace may not exist yet; create the directory and header-only CSVs so
// the dashboard boots and the UI can write without a prior init run. Existing
// files (real data) are never overwritten.
const WORKSPACE_HEADERS = {
  'jobs.csv': ['job_id','date_found','company','job_title','role_family','level','convert_track','location','remote_policy','source','job_url','posted_date','priority','status','resume_variant','skip_reason','blocker','next_action','notes','cohort_match_status','current_stage','验证置信度','submission_tier','company_tier','job_type','deadline','match_score','hard_gate','verification_status','applied_date'],
  'follow_up.csv': ['date','company','job_title','contact','channel','event_type','deadline','next_action','status','notes','time'],
  'blockers.csv': ['blocker_id','job_id','type','reason','next_action','status','created_at','resolved_at'],
  'application_log.csv': ['attempt_date','company','job_title','job_url','platform','status','submission_evidence','resume_used','answers_used','confirmation_url','confirmation_text','notes'],
};

function ensureWorkspace() {
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// Same quoted-field CSV dialect job_pool.csv already uses (every field
// quoted, "" for an embedded quote, CRLF line endings).
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
  // Strip ALL leading UTF-8 BOMs. job_pool.csv can accumulate stacked BOM
  // bytes from repeated external writes; one stray BOM turns the first
  // header cell into "\ufeffdate" and breaks every indexOf-based lookup,
  // so we loop until none remain (instead of removing a single one).
  while (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = parseCSV(text);
  return { header: rows[0], dataRows: rows.slice(1) };
}

function writeCSVRows(filePath, header, dataRows) {
  fs.writeFileSync(filePath, '\uFEFF' + stringifyCSV([header, ...dataRows]));
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy(); // guard against runaway payloads
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, obj) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

async function handleUpdateStatus(req, res) {
  let payload;
  try {
    payload = await readJSONBody(req);
  } catch (e) {
    return sendJSON(res, 400, { ok: false, error: e.message });
  }

  const { rowIndex, company, job_title, status } = payload || {};
  if (!['Submitted', 'Offer', 'Rejected', 'Pending'].includes(status)) {
    return sendJSON(res, 400, { ok: false, error: 'status must be one of Submitted/Offer/Rejected/Pending' });
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return sendJSON(res, 400, { ok: false, error: 'rowIndex must be a non-negative integer' });
  }

  let header, dataRows;
  try {
    ({ header, dataRows } = readCSVRows(JOB_POOL_PATH));
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not read job_pool.csv: ' + e.message });
  }

  const companyCol = header.indexOf('company');
  const titleCol = header.indexOf('job_title');
  const statusCol = header.indexOf('status');

  if (statusCol === -1 || companyCol === -1 || titleCol === -1) {
    return sendJSON(res, 500, { ok: false, error: 'job_pool.csv is missing an expected column' });
  }
  if (rowIndex >= dataRows.length) {
    return sendJSON(res, 409, { ok: false, error: 'rowIndex out of range — the file may have changed, please refresh' });
  }

  const target = dataRows[rowIndex];
  // job_pool.csv may have been rewritten (e.g. by the agent) between page
  // load and this click, which would shift row positions — confirm the row
  // at this index is still the same job before overwriting its status.
  if (target[companyCol] !== company || target[titleCol] !== job_title) {
    return sendJSON(res, 409, { ok: false, error: 'This row no longer matches — the dashboard data changed, please refresh and try again' });
  }

  target[statusCol] = status;

  try {
    writeCSVRows(JOB_POOL_PATH, header, dataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write job_pool.csv: ' + e.message });
  }

  sendJSON(res, 200, { ok: true });
}

// Locate + verify a job_pool.csv row by index, checking it still matches the
// company/job_title the client last saw (same staleness guard as above).
// Returns { header, dataRows, companyCol, titleCol, stageCol, target } or
// throws an Error with an httpStatus property for the caller to relay.
function locateJobRow(jobRowIndex, company, job_title) {
  if (!Number.isInteger(jobRowIndex) || jobRowIndex < 0) {
    const e = new Error('jobRowIndex must be a non-negative integer'); e.httpStatus = 400; throw e;
  }
  let header, dataRows;
  try {
    ({ header, dataRows } = readCSVRows(JOB_POOL_PATH));
  } catch (err) {
    const e = new Error('Could not read job_pool.csv: ' + err.message); e.httpStatus = 500; throw e;
  }
  const companyCol = header.indexOf('company');
  const titleCol = header.indexOf('job_title');
  const statusCol = header.indexOf('status');
  const stageCol = header.indexOf('current_stage');
  if ([companyCol, titleCol, statusCol, stageCol].includes(-1)) {
    const e = new Error('job_pool.csv is missing an expected column (company/job_title/status/current_stage)'); e.httpStatus = 500; throw e;
  }
  if (jobRowIndex >= dataRows.length) {
    const e = new Error('jobRowIndex out of range — the file may have changed, please refresh'); e.httpStatus = 409; throw e;
  }
  const target = dataRows[jobRowIndex];
  if (target[companyCol] !== company || target[titleCol] !== job_title) {
    const e = new Error('This job row no longer matches — the dashboard data changed, please refresh and try again'); e.httpStatus = 409; throw e;
  }
  if (target[statusCol] !== 'Submitted') {
    const e = new Error('This job is not in the Submitted/Applied bucket — calendar events are only for already-applied jobs'); e.httpStatus = 409; throw e;
  }
  return { header, dataRows, statusCol, stageCol, target };
}

async function handleCalendarAdd(req, res) {
  let payload;
  try {
    payload = await readJSONBody(req);
  } catch (e) {
    return sendJSON(res, 400, { ok: false, error: e.message });
  }

  const { jobRowIndex, company, job_title, date, time, event_type } = payload || {};
  if (!DATE_RE.test(date)) return sendJSON(res, 400, { ok: false, error: 'date must be YYYY-MM-DD' });
  if (!TIME_RE.test(time)) return sendJSON(res, 400, { ok: false, error: 'time must be HH:MM' });
  if (typeof event_type !== 'string' || !event_type.trim()) {
    return sendJSON(res, 400, { ok: false, error: 'event_type is required' });
  }

  let jobRow;
  try {
    jobRow = locateJobRow(jobRowIndex, company, job_title);
  } catch (e) {
    return sendJSON(res, e.httpStatus || 500, { ok: false, error: e.message });
  }

  // current_stage is the event content verbatim — no auto-suffix. Every
  // company's process reads differently, so don't guess a shared phrasing
  // convention on top of what the user typed.
  const stage = event_type.trim();
  jobRow.target[jobRow.stageCol] = stage;

  let fuHeader, fuDataRows;
  try {
    ({ header: fuHeader, dataRows: fuDataRows } = readCSVRows(FOLLOW_UP_PATH));
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not read follow_up.csv: ' + e.message });
  }
  const cols = ['date', 'company', 'job_title', 'contact', 'channel', 'event_type', 'deadline', 'next_action', 'status', 'notes', 'time'];
  if (cols.some(c => fuHeader.indexOf(c) === -1)) {
    return sendJSON(res, 500, { ok: false, error: 'follow_up.csv is missing an expected column' });
  }
  const newRow = new Array(fuHeader.length).fill('');
  newRow[fuHeader.indexOf('date')] = date;
  newRow[fuHeader.indexOf('company')] = company;
  newRow[fuHeader.indexOf('job_title')] = job_title;
  newRow[fuHeader.indexOf('event_type')] = event_type.trim();
  newRow[fuHeader.indexOf('status')] = 'Scheduled';
  newRow[fuHeader.indexOf('time')] = time;
  fuDataRows.push(newRow);
  const followUpRowIndex = fuDataRows.length - 1;

  try {
    writeCSVRows(JOB_POOL_PATH, jobRow.header, jobRow.dataRows);
    writeCSVRows(FOLLOW_UP_PATH, fuHeader, fuDataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write dashboard files: ' + e.message });
  }

  sendJSON(res, 200, { ok: true, followUpRowIndex, current_stage: stage });
}

async function handleCalendarUpdate(req, res) {
  let payload;
  try {
    payload = await readJSONBody(req);
  } catch (e) {
    return sendJSON(res, 400, { ok: false, error: e.message });
  }

  const { followUpRowIndex, jobRowIndex, company, job_title, date, time, event_type } = payload || {};
  if (!Number.isInteger(followUpRowIndex) || followUpRowIndex < 0) {
    return sendJSON(res, 400, { ok: false, error: 'followUpRowIndex must be a non-negative integer' });
  }
  if (!DATE_RE.test(date)) return sendJSON(res, 400, { ok: false, error: 'date must be YYYY-MM-DD' });
  if (!TIME_RE.test(time)) return sendJSON(res, 400, { ok: false, error: 'time must be HH:MM' });
  if (typeof event_type !== 'string' || !event_type.trim()) {
    return sendJSON(res, 400, { ok: false, error: 'event_type is required' });
  }

  let fuHeader, fuDataRows;
  try {
    ({ header: fuHeader, dataRows: fuDataRows } = readCSVRows(FOLLOW_UP_PATH));
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not read follow_up.csv: ' + e.message });
  }
  const fuCompanyCol = fuHeader.indexOf('company');
  const fuTitleCol = fuHeader.indexOf('job_title');
  if (followUpRowIndex >= fuDataRows.length) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer exists — the calendar may have changed, please refresh' });
  }
  const fuTarget = fuDataRows[followUpRowIndex];
  if (fuTarget[fuCompanyCol] !== company || fuTarget[fuTitleCol] !== job_title) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer matches — the calendar may have changed, please refresh' });
  }

  let jobRow;
  try {
    jobRow = locateJobRow(jobRowIndex, company, job_title);
  } catch (e) {
    return sendJSON(res, e.httpStatus || 500, { ok: false, error: e.message });
  }

  fuTarget[fuHeader.indexOf('date')] = date;
  fuTarget[fuHeader.indexOf('time')] = time;
  fuTarget[fuHeader.indexOf('event_type')] = event_type.trim();

  // Same rule as add: current_stage is the event content verbatim.
  const stage = event_type.trim();
  jobRow.target[jobRow.stageCol] = stage;

  try {
    writeCSVRows(FOLLOW_UP_PATH, fuHeader, fuDataRows);
    writeCSVRows(JOB_POOL_PATH, jobRow.header, jobRow.dataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write dashboard files: ' + e.message });
  }

  sendJSON(res, 200, { ok: true, current_stage: stage });
}

async function handleCalendarDelete(req, res) {
  let payload;
  try {
    payload = await readJSONBody(req);
  } catch (e) {
    return sendJSON(res, 400, { ok: false, error: e.message });
  }

  const { followUpRowIndex, company, job_title, event_type, date, time } = payload || {};
  if (!Number.isInteger(followUpRowIndex) || followUpRowIndex < 0) {
    return sendJSON(res, 400, { ok: false, error: 'followUpRowIndex must be a non-negative integer' });
  }

  let fuHeader, fuDataRows;
  try {
    ({ header: fuHeader, dataRows: fuDataRows } = readCSVRows(FOLLOW_UP_PATH));
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not read follow_up.csv: ' + e.message });
  }
  if (followUpRowIndex >= fuDataRows.length) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer exists — the calendar may have changed, please refresh' });
  }
  const fuTarget = fuDataRows[followUpRowIndex];
  const matches = (col, val) => fuTarget[fuHeader.indexOf(col)] === val;
  if (!matches('company', company) || !matches('job_title', job_title) || !matches('event_type', event_type) || !matches('date', date) || !matches('time', time)) {
    return sendJSON(res, 409, { ok: false, error: 'This event no longer matches — the calendar may have changed, please refresh' });
  }

  fuDataRows.splice(followUpRowIndex, 1);

  try {
    writeCSVRows(FOLLOW_UP_PATH, fuHeader, fuDataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write follow_up.csv: ' + e.message });
  }

  // Deliberately does not revert job_pool.csv's current_stage — there's no
  // reliable "previous stage" to roll back to. Edit the stage manually if
  // deleting this event should also change what's shown on the job card.
  sendJSON(res, 200, { ok: true });
}

// Resolve a blocker: clear the job_pool.csv `blocker` column and reset
// next_action so the job leaves the "阻塞项" page. Only the two columns are
// touched — status / priority / tier / notes are left intact.
async function handleBlockerResolve(req, res) {
  let payload;
  try {
    payload = await readJSONBody(req);
  } catch (e) {
    return sendJSON(res, 400, { ok: false, error: e.message });
  }

  const { rowIndex, company, job_title } = payload || {};
  if (!Number.isInteger(rowIndex) || rowIndex < 0) {
    return sendJSON(res, 400, { ok: false, error: 'rowIndex must be a non-negative integer' });
  }

  let header, dataRows;
  try {
    ({ header, dataRows } = readCSVRows(JOB_POOL_PATH));
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not read job_pool.csv: ' + e.message });
  }
  const cCol = header.indexOf('company');
  const tCol = header.indexOf('job_title');
  const bCol = header.indexOf('blocker');
  const nCol = header.indexOf('next_action');
  if ([cCol, tCol, bCol, nCol].includes(-1)) {
    return sendJSON(res, 500, { ok: false, error: 'job_pool.csv is missing an expected column' });
  }
  if (rowIndex >= dataRows.length) {
    return sendJSON(res, 409, { ok: false, error: 'rowIndex out of range — the file may have changed, please refresh' });
  }
  const target = dataRows[rowIndex];
  if (target[cCol] !== company || target[tCol] !== job_title) {
    return sendJSON(res, 409, { ok: false, error: 'This row no longer matches — the dashboard data changed, please refresh and try again' });
  }

  target[bCol] = '';
  target[nCol] = '待投递(阻塞已解决)';

  try {
    writeCSVRows(JOB_POOL_PATH, header, dataRows);
  } catch (e) {
    return sendJSON(res, 500, { ok: false, error: 'Could not write job_pool.csv: ' + e.message });
  }
  sendJSON(res, 200, { ok: true });
}

const ROUTES = {
  '/api/update-status': handleUpdateStatus,
  '/api/blocker/resolve': handleBlockerResolve,
  '/api/calendar/add': handleCalendarAdd,
  '/api/calendar/update': handleCalendarUpdate,
  '/api/calendar/delete': handleCalendarDelete,
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (req.method === 'POST' && ROUTES[urlPath]) {
    ROUTES[urlPath](req, res);
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  const servedPath = urlPath === '/' ? '/dashboard.html' : urlPath;
  const baseName = path.basename(servedPath);

  // Data files are served from the workspace so the workspace stays the only
  // writable source; everything else is served from the dashboard folder.
  const filePath = DATA_FILE_MAP[baseName]
    ? path.join(WORKSPACE_DIR, DATA_FILE_MAP[baseName])
    : path.join(ROOT, servedPath);

  // Prevent escaping the allowed roots (dashboard folder or workspace folder).
  if (!filePath.startsWith(ROOT) && !filePath.startsWith(WORKSPACE_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
});

// Make sure the workspace data files exist before serving, so a fresh clone
// with no real data still boots cleanly. This never touches existing files.
ensureWorkspace();

// Bind to localhost only — this server can now write to job_pool.csv, so it
// shouldn't be reachable from other devices on the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log('Dashboard running / 仪表盘已启动: http://localhost:' + PORT + '/dashboard.html');
  console.log('Keep this window open to keep serving; close it or press Ctrl+C to stop.');
  console.log('保持这个窗口开着；关掉窗口或按 Ctrl+C 即可停止服务。');
});
