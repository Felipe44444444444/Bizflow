#!/usr/bin/env node
/**
 * Applies migrations/leads_and_plans.sql to the remote Supabase project
 * using the Supabase Management REST API.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=<personal-access-token> node scripts/run-migration.js
 *
 * Get your token at: https://supabase.com/dashboard/account/tokens
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PROJECT_REF = 'oxlhmndvpogpdjutfxzr';
const SQL_FILE    = path.join(__dirname, '../migrations/leads_and_plans.sql');
const TOKEN       = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('\nError: SUPABASE_ACCESS_TOKEN env var is required.');
  console.error('Get yours at: https://supabase.com/dashboard/account/tokens\n');
  console.error('Then run:');
  console.error('  SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/run-migration.js\n');
  process.exit(1);
}

async function run() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');

  console.log(`\nRunning migration on project ${PROJECT_REF}...`);
  console.log(`SQL file: ${SQL_FILE}\n`);

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Migration failed:', res.status, body);
    process.exit(1);
  }

  const result = await res.json();
  console.log('Migration applied successfully!');
  console.log(JSON.stringify(result, null, 2));
}

run().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
