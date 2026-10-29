#!/usr/bin/env node
// Borra de Supabase Storage las fotos que Poyo anotó en poyo.photo_trash (reseñas o cuentas borradas, avatares cambiados).
// El servidor de Poyo no tiene permiso para borrar de Storage, así que esto se ejecuta aparte (cron / GitHub Action).
// Necesita: DATABASE_URL (rol poyo_app), SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (la clave de servicio, solo aquí).
const { Pool } = require('pg');
const { DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltan DATABASE_URL, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
(async () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query('select path from poyo.photo_trash order by created_at limit 500');
  if (!rows.length) { console.log('Nada que purgar'); return pool.end(); }
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/poyo-photos`, {
    method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: rows.map((x) => x.path) }),
  });
  if (!r.ok) { console.error('Storage respondió', r.status, await r.text()); process.exit(1); }
  await pool.query('delete from poyo.photo_trash where path = any($1)', [rows.map((x) => x.path)]);
  console.log(`Purgadas ${rows.length} fotos`);
  await pool.end();
})();
