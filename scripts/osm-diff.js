#!/usr/bin/env node
// Compara dos volcados de OSM (.json o .json.gz) y escribe un resumen en Markdown: node scripts/osm-diff.js viejo nuevo
const fs = require('fs');
const zlib = require('zlib');
const load = (f) => { const raw = fs.readFileSync(f); return JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8')).items; };
const KIND = { b: 'bancos', p: 'mesas de pícnic', f: 'fuentes', s: 'tiendas' };
const [oldF, newF] = process.argv.slice(2);
if (!oldF || !newF) { console.error('Uso: node scripts/osm-diff.js <viejo> <nuevo>'); process.exit(1); }
const a = load(oldF), b = load(newF);
const ids = (l) => new Map(l.map((x) => [x[0], x]));
const A = ids(a), B = ids(b);
const added = b.filter((x) => !A.has(x[0])), removed = a.filter((x) => !B.has(x[0]));
const by = (l, k) => l.filter((x) => x[3] === k).length;
console.log(`## Volcado de OpenStreetMap\n\nAntes: **${a.length}** sitios · ahora: **${b.length}** (${b.length - a.length >= 0 ? '+' : ''}${b.length - a.length}).\n`);
console.log('| | nuevos | quitados |\n|---|---|---|');
for (const k of Object.keys(KIND)) console.log(`| ${KIND[k]} | ${by(added, k)} | ${by(removed, k)} |`);
console.log(`\n**Total: +${added.length} / −${removed.length}.** Los sitios quitados que tengan reseñas en Poyo seguirán viéndose (están guardados en la base de datos).`);
