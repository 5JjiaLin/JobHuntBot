#!/usr/bin/env node
'use strict';

// Scaffold a per-role workspace:
//   workspace/<target-role-slug>/
//
// Idempotent by design: existing files (real user data) are never overwritten.
// Also points dashboard/config.json at the workspace, creating that local,
// gitignored file from the shipped config.example.json when necessary.

const fs = require('fs');
const path = require('path');
const { WORKSPACE_HEADERS } = require('../dashboard/workspace-schema');

const targetRole = process.argv.slice(2).join(' ').trim();
if (!targetRole) {
  console.error('Usage: npm run init:workspace -- "<target role>"');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const slug = targetRole
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
  .replace(/^-+|-+$/g, '') || 'target-role';

const workspaceDir = path.join(root, 'workspace', slug);
fs.mkdirSync(workspaceDir, { recursive: true });

function writeIfMissing(file, content) {
  const p = path.join(workspaceDir, file);
  if (!fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8');
}

function header(columns) {
  return columns.join(',') + '\n';
}

writeIfMissing('01_role_market.md', `# ${targetRole} 市场与能力模型\n\n`);
writeIfMissing('02_evidence_matrix.md', '# 岗位能力 × 经历证据矩阵\n\n');
writeIfMissing('03_resume.md', `# ${targetRole} 定制简历\n\n`);
writeIfMissing('04_resume_audit.md', '# 简历审计\n\n');
writeIfMissing('06_application_priority.md', '# 投递优先级\n\n');
writeIfMissing('jobs.csv', header(WORKSPACE_HEADERS['jobs.csv']));
writeIfMissing('application_log.csv', header(WORKSPACE_HEADERS['application_log.csv']));
writeIfMissing('follow_up.csv', header(WORKSPACE_HEADERS['follow_up.csv']));
writeIfMissing('blockers.csv', header(WORKSPACE_HEADERS['blockers.csv']));
writeIfMissing(
  'config.json',
  JSON.stringify(
    { target_role: targetRole, created_at: new Date().toISOString(), feishu: { enabled: false } },
    null,
    2
  ) + '\n'
);

// dashboard/config.json is local-only (gitignored). Seed it from the shipped
// example when absent, then point it at the workspace we just created.
const dashboardConfig = path.join(root, 'dashboard', 'config.json');
const exampleConfig = path.join(root, 'dashboard', 'config.example.json');
let current = {};
const seedFrom = fs.existsSync(dashboardConfig)
  ? dashboardConfig
  : (fs.existsSync(exampleConfig) ? exampleConfig : null);
if (seedFrom) {
  try {
    current = JSON.parse(fs.readFileSync(seedFrom, 'utf8')) || {};
  } catch (error) {
    console.warn(`Could not parse ${seedFrom}: ${error.message}`);
    current = {};
  }
}

current.workspace_dir = path
  .relative(path.dirname(dashboardConfig), workspaceDir)
  .replace(/\\/g, '/');
current.target_role = targetRole;
fs.writeFileSync(dashboardConfig, JSON.stringify(current, null, 2) + '\n', 'utf8');
console.log(`Updated dashboard/config.json -> ${current.workspace_dir}`);

console.log(`Workspace ready: ${workspaceDir}`);
console.log('Start the dashboard with: node dashboard/server.js');
