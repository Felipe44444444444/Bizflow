#!/usr/bin/env node
/**
 * Applies migrations/musica.sql to the Supabase project.
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/run-migration-musica.js
 */
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PROJECT_REF = 'oxlhmndvpogpdjutfxzr';
const SQL_FILE    = path.join(__dirname, '../migrations/musica.sql');
const TOKEN       = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('\nError: SUPABASE_ACCESS_TOKEN is required.');
  console.error('  export SUPABASE_ACCESS_TOKEN=sbp_xxx && node scripts/run-migration-musica.js\n');
  process.exit(1);
}

(async () => {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  console.log(`\nRunning musica migration on project ${PROJECT_REF}...`);

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: sql }),
  });

  const body = await res.json();

  if (!res.ok) {
    console.error('\n✗ Migration failed:', JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log('✓ Migration applied successfully.\n');
})();
