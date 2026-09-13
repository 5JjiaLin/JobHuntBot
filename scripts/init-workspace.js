#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

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

const workspaceRoot = path.join(root, 'workspace');
const workspaceDir = path.join(workspaceRoot, slug);
fs.mkdirSync(workspaceDir, { recursive: true });

function writeIfMissing(file, content) {
  const p = path.join(workspaceDir, file);
  if (!fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8');
}

writeIfMissing('01_role_market.md', `# ${targetRole} 市场与能力模型\n\n`);
writeIfMissing('02_evidence_matrix.md', '# 岗位能力 × 经历证据矩阵\n\n');
writeIfMissing('03_resume.md', `# ${targetRole} 定制简历\n\n`);
writeIfMissing('04_resume_audit.md', '# 简历审计\n\n');
writeIfMissing('06_application_priority.md', '# 投递优先级\n\n');
writeIfMissing(
  'jobs.csv',
  'job_id,date_found,company_tier,company,job_title,role_family,job_type,convert_track,location,source,job_url,posted_date,deadline,match_score,submission_tier,status,resume_variant,hard_gate,verification_status,current_stage,next_action,applied_date,notes\n'
);
writeIfMissing('application_log.csv', 'timestamp,job_id,event,stage,evidence,notes\n');
writeIfMissing('follow_up.csv', 'event_id,job_id,date,time,event_type,notes,status\n');
writeIfMissing('blockers.csv', 'blocker_id,job_id,type,reason,next_action,status,created_at,resolved_at\n');
writeIfMissing(
  'config.json',
  JSON.stringify({ target_role: targetRole, created_at: new Date().toISOString(), feishu: { enabled: false } }, null, 2) + '\n'
);

const dashboardConfig = path.join(root, 'dashboard', 'config.json');
if (fs.existsSync(dashboardConfig)) {
  try {
    const current = JSON.parse(fs.readFileSync(dashboardConfig, 'utf8'));
    current.workspace_dir = path.relative(path.dirname(dashboardConfig), workspaceDir).replace(/\\/g, '/');
    current.target_role = targetRole;
    fs.writeFileSync(dashboardConfig, JSON.stringify(current, null, 2) + '\n', 'utf8');
    console.log(`Updated dashboard/config.json -> ${current.workspace_dir}`);
  } catch (error) {
    console.warn(`Workspace created, but dashboard/config.json was not updated: ${error.message}`);
  }
}

console.log(`Workspace ready: ${workspaceDir}`);
