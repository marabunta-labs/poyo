// Solo para el vídeo, en la base LOCAL: rellena el centro de Madrid y el Retiro con bancos reales del volcado de OSM, reseñas y
// check-ins de 4 grupos demo (ya cargados con scripts/seed-demo.js), para que se vean muchos aros de colores juntos.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('../node_modules/pg');
const { CRITERIA } = require('../criteria.js');
const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL || 'postgres://supabase_admin:test@127.0.0.1:54329/postgres' });
const q = async (s, p = []) => (await pool.query(s, p)).rows;

let seed = 7;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gz = '../data/osm/spain.json.gz';
const { items } = JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(gz, import.meta.url))).toString());
const box = { s: 40.404, w: -3.705, n: 40.426, e: -3.665 };
const sites = items.filter(([, la, ln, k]) => ['b', 'p'].includes(k) && la > box.s && la < box.n && ln > box.w && ln < box.e).sort(() => rnd() - 0.5).slice(0, 170);
const TYPE = { b: 'bench', p: 'picnic' };
console.log(sites.length, 'sitios reales de OSM en la zona');

const groups = await q(`select g.id, g.name from poyo.groups g order by g.name limit 5`);
const members = new Map();
for (const g of groups) members.set(g.id, (await q('select user_id from poyo.group_members where group_id = $1', [g.id])).map((r) => r.user_id));
const allUsers = (await q('select id from poyo.profiles where is_seed')).map((r) => r.id);
const mid = { lat: (box.s + box.n) / 2, lng: (box.w + box.e) / 2 };
// territorio: cada grupo manda en un cuadrante; un par de grupos más pequeños se cuelan
const home = (la, ln) => groups[(la > mid.lat ? 1 : 0) + (ln > mid.lng ? 2 : 0)];
const TEXT = ['Shady and quiet, great for a break.', 'Lovely view of the park, never too crowded.', 'Comfortable bench, perfect spot to read.', 'Right next to a fountain, very handy.', 'Good place to meet friends in the afternoon.', 'A bit noisy but super central.', 'Sunny in the morning, ideal for coffee.', 'Clean and well kept. Will be back!'];
const SOON = Date.now(), DAY = 864e5;
const madridDay = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const used = new Set();
for (const [id, la, ln, k, name] of sites) {
  await q(`insert into poyo.places (id, lat, lng, name, type) values ($1, $2, $3, $4, $5) on conflict do nothing`, [id, la, ln, (name || '').slice(0, 80), TYPE[k]]);
  // reseñas en 1 de cada 2 sitios
  if (rnd() < 0.5) for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) {
    const u = pick(allUsers), rating = 3 + Math.floor(rnd() * 3), ratings = {};
    for (const c of CRITERIA[TYPE[k]]) if (rnd() < 0.7) ratings[c] = Math.max(1, Math.min(5, rating + Math.round(rnd() * 2 - 1)));
    await q(`insert into poyo.reviews (place_id, user_id, rating, ratings, text, created_at) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
      [id, u, rating, ratings, pick(TEXT), new Date(SOON - rnd() * 90 * DAY)]);
  }
  // check-ins: el grupo del cuadrante va más; a veces otro disputa el banco
  const g0 = home(la, ln), actives = [g0, ...(rnd() < 0.4 ? [pick(groups.filter((g) => g !== g0))] : [])];
  const score = new Map();
  actives.forEach((g, idx) => {
    const n = idx === 0 ? 2 + Math.floor(rnd() * 5) : 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const u = pick(members.get(g.id)), at = SOON - rnd() * 13.5 * DAY, day = madridDay(at), key = id + u + day;
      if (used.has(key)) continue; used.add(key);
      const pts = 1 + Math.floor(rnd() * 3);
      q(`insert into poyo.checkins (place_id, user_id, group_id, lat, lng, accuracy, points, day, at) values ($1,$2,$3,$4,$5,8,$6,$7,$8) on conflict do nothing`, [id, u, g.id, la, ln, pts, day, new Date(at)]);
      const s = score.get(g.id) || { g, v: 0, first: at };
      s.v += pts * Math.pow(0.5, (SOON - at) / DAY / 5); s.first = Math.min(s.first, at); score.set(g.id, s);
    }
  });
  const top = [...score.values()].sort((a, b) => b.v - a.v)[0];
  if (top) q(`insert into poyo.place_control (place_id, group_id, since) values ($1,$2,$3) on conflict do nothing`, [id, top.g.id, new Date(top.first)]);
}
await new Promise((r) => setTimeout(r, 1500)); // deja terminar los insert sin await
console.log(groups.map((g) => g.name).join(', '));
console.log(await q(`select (select count(*) from poyo.place_control where place_id in (select id from poyo.places where lat between $1 and $2 and lng between $3 and $4)) bases_madrid`, [box.s, box.n, box.w, box.e]));
await pool.end();
