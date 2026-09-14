'use strict';

// Canonical workspace schema — the single definition of every CSV table in
// `workspace/<target-role-slug>/`.
//
// Shared by dashboard/server.js (serving + writing) and
// scripts/init-workspace.js (scaffolding), so a freshly initialised workspace
// is always byte-compatible with what the dashboard expects.
//
// jobs.csv is a superset of the Core table: extra columns (level,
// remote_policy, priority, skip_reason, cohort_match_status, 验证置信度 and the
// Core scoring columns) are kept because dropping them would silently discard
// real user data.
const WORKSPACE_HEADERS = {
  'jobs.csv': [
    'job_id', 'date_found', 'company', 'job_title', 'role_family', 'level',
    'convert_track', 'location', 'remote_policy', 'source', 'job_url',
    'posted_date', 'priority', 'status', 'resume_variant', 'skip_reason',
    'blocker', 'next_action', 'notes', 'cohort_match_status', 'current_stage',
    '验证置信度', 'submission_tier', 'company_tier', 'job_type', 'deadline',
    'match_score', 'hard_gate', 'verification_status', 'applied_date',
  ],
  'follow_up.csv': [
    'date', 'company', 'job_title', 'contact', 'channel', 'event_type',
    'deadline', 'next_action', 'status', 'notes', 'time',
  ],
  'blockers.csv': [
    'blocker_id', 'job_id', 'type', 'reason', 'next_action', 'status',
    'created_at', 'resolved_at',
  ],
  'application_log.csv': [
    'job_id', 'attempt_date', 'company', 'job_title', 'job_url', 'platform',
    'status', 'submission_evidence', 'resume_used', 'answers_used',
    'confirmation_url', 'confirmation_text', 'notes',
  ],
};

module.exports = { WORKSPACE_HEADERS };
