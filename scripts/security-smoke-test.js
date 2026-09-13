#!/usr/bin/env node
'use strict';

// Minimal security smoke test for the local dashboard server. Uses only Node
// built-ins (no test framework) and starts its own server instance.
//
// Usage: npm run test:security

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const PORT = 8420;
const BASE = `http://127.0.0.1:${PORT}`;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

let server;
let failures = 0;

function request(method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Node's http client normalises "/../" out of the request path before sending,
// which would make a traversal test meaningless. Send one raw request instead.
function rawRequest(raw) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, '127.0.0.1', () => socket.write(raw));
    let data = '';
    socket.on('data', c => { data += c; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { await request('GET', '/dashboard.html'); return; } catch (error) {
      await new Promise(r => setTimeout(r, 250));
    }
  }
  throw new Error('server did not start on port ' + PORT);
}

async function main() {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'dashboard', 'server.js')], { stdio: 'ignore' });

  try {
    await waitForServer();

    console.log('\n1. normal access');
    let r = await request('GET', '/dashboard.html');
    check('GET /dashboard.html → 200', r.status === 200, `got ${r.status}`);
    r = await request('GET', '/job_pool.csv');
    check('GET workspace table → 200 (or empty table)', r.status === 200, `got ${r.status}`);

    console.log('\n2. path traversal');
    const raw = await rawRequest('GET /../package.json HTTP/1.1\r\nHost: 127.0.0.1:8420\r\nConnection: close\r\n\r\n');
    check('GET /../package.json (raw) → 403', /^HTTP\/1\.[01] 403/.test(raw), raw.split('\r\n')[0]);
    r = await request('GET', '/' + encodeURIComponent('../../../../etc/passwd'));
    check('GET URL-encoded traversal → 403', r.status === 403, `got ${r.status}`);

    console.log('\n3. Host validation');
    r = await request('GET', '/dashboard.html', { headers: { Host: 'evil.example.com' } });
    check('GET with foreign Host → 403', r.status === 403, `got ${r.status}`);
    r = await request('GET', '/dashboard.html', { headers: { Host: 'localhost:8420' } });
    check('GET with loopback Host → 200', r.status === 200, `got ${r.status}`);

    console.log('\n4. Origin validation (POST)');
    r = await request('POST', '/api/update-status', {
      headers: { ...JSON_HEADERS, Origin: 'http://evil.example.com' },
      body: JSON.stringify({ job_id: 'x', status: 'Pending' }),
    });
    check('POST with foreign Origin → 403', r.status === 403, `got ${r.status}`);

    console.log('\n5. loopback POST reaches business logic');
    r = await request('POST', '/api/update-status', {
      headers: { ...JSON_HEADERS, Origin: 'http://localhost:8420' },
      body: JSON.stringify({ job_id: 'does-not-exist', status: 'Pending' }),
    });
    check('unknown job_id → 404 (handler ran, not blocked by security)', r.status === 404, `got ${r.status}`);

    console.log('\n6. payload limit');
    const oversized = JSON.stringify({ job_id: 'x', status: 'Pending', pad: 'a'.repeat(2 * 1e6) });
    r = await request('POST', '/api/update-status', {
      headers: { ...JSON_HEADERS, Origin: 'http://localhost:8420' },
      body: oversized,
    });
    check('oversized body → 413', r.status === 413, `got ${r.status}`);

  } finally {
    if (server) server.kill();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll security smoke checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch(error => {
  console.error('smoke test error:', error.message);
  if (server) server.kill();
  process.exit(1);
});
