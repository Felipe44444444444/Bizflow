#!/usr/bin/env node
/**
 * Seeds the `canciones` table from /data/canciones-regional-mexicano.json
 * Usage:
 *   node scripts/seed-musica.js            # insert only new rows
 *   node scripts/seed-musica.js --reset    # truncate first, then insert all
 */
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const JSON_FILE = path.resolve('/Users/luis/data/canciones-regional-mexicano.json');
const BATCH     = 25;
const RESET     = process.argv.includes('--reset');

function mapRow(c) {
  return {
    id:                  c.id,
    titulo:              c.titulo,
    artista:             c.artista,
    genero:              c.genero,
    tono:                c.tono,
    bpm:                 c.bpm ?? null,
    acordes:             c.acordes            ?? null,
    estructura:          c.estructura         ?? null,
    letra_por_seccion:   c.letra_por_seccion  ?? null,
    duracion_segundos:   c.duracion_segundos  ?? null,
    youtube_id:          c.youtube_id         ?? null,
    popularidad:         c.popularidad        ?? 50,
    tiempos_por_compas:  c.tiempos_por_compas ?? 4,
    sync_calidad:        c.sync_calidad       ?? 'estimado',
  };
}

(async () => {
  if (!fs.existsSync(JSON_FILE)) {
    console.error(`✗ JSON file not found: ${JSON_FILE}`);
    process.exit(1);
  }

  const canciones = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  console.log(`\n📀 ${canciones.length} canciones encontradas en el JSON`);

  if (RESET) {
    console.log('⚠  --reset: truncando tabla canciones (cascade)...');
    const { error } = await supabase.rpc('truncate_canciones');
    if (error) {
      // rpc might not exist; fall back to delete all
      const { error: delErr } = await supabase.from('canciones').delete().gte('id', 0);
      if (delErr) { console.error('✗ Reset failed:', delErr.message); process.exit(1); }
    }
    console.log('  Tabla vaciada.\n');
  }

  const rows = canciones.map(mapRow);
  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('canciones')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
      .select('id');

    if (error) {
      console.error(`✗ Error en batch ${i / BATCH + 1}:`, error.message);
      process.exit(1);
    }

    inserted += data?.length ?? 0;
    const label = `  Batch ${String(Math.floor(i / BATCH) + 1).padStart(2)} [${i + 1}–${Math.min(i + BATCH, rows.length)}]`;
    console.log(`${label} → ${data?.length ?? 0} upserted`);
  }

  // Summary
  const { count } = await supabase
    .from('canciones')
    .select('*', { count: 'exact', head: true });

  console.log(`\n✓ Seed completo`);
  console.log(`  Upserted : ${inserted}`);
  console.log(`  Total DB : ${count}`);
  console.log();
})();
