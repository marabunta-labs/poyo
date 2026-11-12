// Poyo — servidor (Node >= 18). Datos en Postgres (Supabase, esquema "poyo"); cuentas con Supabase Auth.
//  · El navegador inicia sesión y sube las fotos directamente a Supabase (supabase-js); aquí solo llega un token.
//  · Este servidor verifica el token contra Supabase Auth y lee/escribe en el esquema poyo con el rol poyo_app,
//    que no ve nada más del proyecto (ni auth ni las otras apps).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data'); // volcados de OSM y cachés (no hay datos de usuarios)
const ADMINS = (process.env.ADMINS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''; // clave pública (anon): la ve cualquiera en el navegador
const BUCKET = 'poyo-photos';
const TYPES = ['bench', 'picnic', 'wall', 'other', 'fountain', 'shop'];
const MAX_PHOTOS = 3;
// Criterios de la reseña según el tipo de sitio (opcionales, 1-5). Las etiquetas están en el cliente.
const CRITERIA = {
  bench: ['views', 'comfort', 'access', 'shade', 'calm'], picnic: ['comfort', 'space', 'clean', 'shade'],
  wall: ['comfort', 'views'], other: ['comfort', 'views'], fountain: ['flow', 'clean', 'pets'], shop: ['hours', 'price', 'catalog', 'service'],
};
const validRatings = (type, raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {})
  .map(([k, v]) => [k, Math.round(Number(v))]).filter(([k, v]) => (CRITERIA[type] || []).includes(k) && v >= 1 && v <= 5));

if (!process.env.DATABASE_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltan DATABASE_URL, SUPABASE_URL o SUPABASE_ANON_KEY (ver README).');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, idleTimeoutMillis: 30000 });
pool.on('error', (e) => console.error('pg', e.message));
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const q1 = async (sql, params = []) => (await q(sql, params))[0];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
};

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}
async function readJSON(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 20000) fail(413, 'Archivo demasiado grande'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return fail(400, 'JSON inválido'); }
}

// Límite simple: 60 escrituras por minuto y por IP.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > 60000) hits.delete(k);
  return arr.length > 60;
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

// ---------- cuenta (Supabase Auth) ----------
// El token (JWT) lo emite Supabase; se lo preguntamos a su API y se recuerda un minuto. Sin secretos aquí.
const tokens = new Map(); // token -> { id, until }
async function authUserId(req) {
  const m = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const hit = tokens.get(m[1]);
  if (hit && hit.until > Date.now()) return hit.id;
  let r;
  try { r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + m[1] }, signal: AbortSignal.timeout(5000) }); }
  catch { return fail(502, 'El servicio de cuentas no responde'); }
  if (!r.ok) return null;
  const id = (await r.json()).id;
  if (tokens.size > 2000) tokens.clear();
  tokens.set(m[1], { id, until: Date.now() + 60000 });
  return id;
}
const isAdmin = (u) => !!u && !u.needsProfile && ADMINS.includes(u.username.toLowerCase());
// me = perfil de Poyo | { id, needsProfile } (cuenta sin elegir @usuario todavía) | null
async function currentUser(req) {
  const id = await authUserId(req);
  if (!id) return null;
  return (await q1('select id, username, bio, avatar from poyo.profiles where id = $1', [id])) || { id, needsProfile: true };
}
const needUser = (me) => (me && !me.needsProfile) || fail(401, me ? 'Elige tu nombre de usuario' : 'Inicia sesión para hacer esto');
const publicUser = (u) => ({ id: u.id, username: u.username, bio: u.bio || '', avatar: u.avatar || '', isAdmin: isAdmin(u) });
const byName = (name) => q1('select id, username, bio, avatar from poyo.profiles where lower(username) = lower($1)', [String(name)]);

// Rutas de foto válidas: <uid>/<nombre>.jpg dentro del bucket poyo-photos, en la carpeta de quien las usa.
const photoOk = (p, userId) => typeof p === 'string' && p.startsWith(userId + '/') && /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.jpg$/.test(p);
// Fotos que ya nadie usa: se anotan y scripts/purge-photos.js las borra de Storage (este servidor no tiene permiso).
const trash = (paths) => paths?.length ? q('insert into poyo.photo_trash (path) select unnest($1::text[]) on conflict do nothing', [paths]) : null;

// ---------- sitios y reseñas ----------
const REVIEW_SQL = `select r.id, r.user_id as _uid, r.place_id as "placeId", r.rating, r.ratings, r.text, r.photos, r.created_at as "createdAt",
    u.username as author, u.avatar,
    json_build_object('id', p.id, 'name', p.name, 'type', p.type, 'lat', p.lat, 'lng', p.lng) as place
  from poyo.reviews r join poyo.profiles u on u.id = r.user_id join poyo.places p on p.id = r.place_id`;
const shapeReview = ({ _uid, ...r }, withPlace) => (withPlace ? r : { ...r, place: undefined });

const STATS_SQL = `select p.id, p.lat, p.lng, p.name, p.type, count(r.id)::int as count,
    round(avg(r.rating)::numeric, 1)::float as avg,
    coalesce((select array_agg(ph) from (select unnest(r2.photos) as ph from poyo.reviews r2 where r2.place_id = p.id order by r2.created_at desc limit 6) x), '{}') as photos
  from poyo.places p left join poyo.reviews r on r.place_id = p.id`;
const placeStats = (id) => q1(STATS_SQL + ' where p.id = $1 group by p.id', [id]);

function validPlace(p) {
  const id = clean(p.id, 40);
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!/^(osm-[wr]?\d+|u-[a-z0-9]+)$/.test(id)) return null;
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { id, lat, lng, name: clean(p.name, 80), type: TYPES.includes(p.type) ? p.type : 'bench' };
}

// Borra a una persona de Poyo (sus reseñas, amistades y perfil). La cuenta de Supabase es de Marabunta Labs y no se toca.
async function purgeUser(u) {
  const photos = [u.avatar, ...(await q('select unnest(photos) as p from poyo.reviews where user_id = $1', [u.id])).map((r) => r.p)].filter(Boolean);
  await trash(photos);
  await q(`delete from poyo.places p where p.created_by = $1 and not exists (select 1 from poyo.reviews r where r.place_id = p.id and r.user_id <> $1)`, [u.id]);
  await q('delete from poyo.profiles where id = $1', [u.id]); // reseñas, amistades y denuncias caen en cascada
}
async function removeReview(r) {
  await trash(r.photos);
  await q('delete from poyo.reviews where id = $1', [r.id]);
}

// ---------- datos de OpenStreetMap ----------
// 1) Volcados locales (data/osm/*.json, creados con scripts/import-osm.js): instantáneo y sin depender de nadie.
// 2) Si la zona no está cubierta, Overpass: el público se satura a menudo, así que probamos varios mirrors,
//    guardamos cada zona en disco y, tras un fallo total, lo dejamos descansar un minuto.
const KIND = { b: { amenity: 'bench' }, p: { leisure: 'picnic_table' }, f: { amenity: 'drinking_water' }, s: { shop: 'supermarket' } };
const CELL = 0.01, grid = new Map();
let localCount = 0;
try {
  const files = fs.readdirSync(path.join(DATA, 'osm')).filter((x) => /\.json(\.gz)?$/.test(x) && !x.startsWith('.'));
  for (const f of files.filter((x) => !(x.endsWith('.gz') && files.includes(x.slice(0, -3))))) { // si está el .json, el .gz sobra
    const raw = fs.readFileSync(path.join(DATA, 'osm', f)); // .json.gz: el volcado va comprimido en el repo
    const { items } = JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
    for (const [id, lat, lng, k, name] of items) {
      const key = Math.floor(lat / CELL) + ',' + Math.floor(lng / CELL);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ id, lat, lng, tags: { ...KIND[k], ...(name && { name }) } });
    }
    localCount += items.length;
  }
} catch {}
if (localCount) console.log(`OSM local: ${localCount} sitios`);
function localSites(s, w, n, e) {
  const out = [];
  for (let y = Math.floor(s / CELL); y <= Math.floor(n / CELL); y++) {
    for (let x = Math.floor(w / CELL); x <= Math.floor(e / CELL); x++) {
      for (const it of grid.get(y + ',' + x) || []) if (it.lat >= s && it.lat <= n && it.lng >= w && it.lng <= e) out.push(it);
    }
  }
  return out.slice(0, 1500);
}
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OSM_HEADERS = { 'User-Agent': 'poyo/1.0 (mapa de sitios para sentarse)', Accept: 'application/json' };
const OSM_FILE = path.join(DATA, 'osm-cache-3.json'); // -3: la consulta cambió, la caché anterior no vale
const OSM_FRESH = 24 * 60 * 60 * 1000; // pasado esto se reintenta, pero si OSM falla se sirve lo viejo
const OSM_MAX = 400; // zonas guardadas
let osmCache = {}; // bbox -> { at, elements }
try { osmCache = JSON.parse(fs.readFileSync(OSM_FILE, 'utf8')); } catch {}
let osmTimer = null;
function saveOsm() {
  clearTimeout(osmTimer);
  osmTimer = setTimeout(() => {
    const keys = Object.keys(osmCache).sort((x, y) => osmCache[y].at - osmCache[x].at);
    keys.slice(OSM_MAX).forEach((k) => delete osmCache[k]);
    fs.writeFile(OSM_FILE, JSON.stringify(osmCache), () => {});
  }, 1000);
}

let overpassDownUntil = 0;
const inflight = new Map(); // bbox -> promesa, para no repetir la misma consulta si llegan varias a la vez
async function overpass(bbox) {
  if (Date.now() < overpassDownUntil) return null;
  const q = `[out:json][timeout:15];(node["amenity"="bench"](${bbox});node["leisure"="picnic_table"](${bbox});` +
    `node["amenity"="drinking_water"]["drinking_water"!="no"](${bbox});nwr["shop"~"^(supermarket|convenience|general)$"](${bbox}););out center 600;`;
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, {
        method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(10000),
        headers: { ...OSM_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data.elements)) continue;
      return data.elements.map((e) => ({
        id: 'osm-' + (e.type === 'node' ? '' : e.type[0]) + e.id, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon,
        tags: { name: e.tags?.name, amenity: e.tags?.amenity, leisure: e.tags?.leisure, shop: e.tags?.shop },
      })).filter((e) => e.lat != null && e.lng != null);
    } catch {}
  }
  overpassDownUntil = Date.now() + 60000;
  return null;
}

async function osm(url) {
  const [s, w, n, e] = ['s', 'w', 'n', 'e'].map((k) => Number(url.searchParams.get(k)));
  if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e || n - s > 0.1 || e - w > 0.1) fail(400, 'Zona no válida');
  // ajustar hacia fuera a una rejilla de 0.005° (~500 m): más aciertos de caché y misma zona consultada
  const G = 0.005, snap = (x, f) => (Math[f](x / G) * G).toFixed(3);
  const local = localSites(s, w, n, e);
  if (local.length) return local;
  const bbox = [snap(s, 'floor'), snap(w, 'floor'), snap(n, 'ceil'), snap(e, 'ceil')].join(',');
  const hit = osmCache[bbox];
  if (hit && Date.now() - hit.at < OSM_FRESH) return hit.elements;
  if (!inflight.has(bbox)) inflight.set(bbox, overpass(bbox).finally(() => inflight.delete(bbox)));
  const elements = await inflight.get(bbox);
  if (!elements) { if (hit) return hit.elements; fail(502, 'OpenStreetMap no responde'); }
  osmCache[bbox] = { at: Date.now(), elements };
  saveOsm();
  return elements;
}

// Buscador de lugares (Nominatim). Su política: máx. 1 petición/s, sin autocompletado → cacheamos y espaciamos.
const geoCache = new Map();
let lastGeo = 0;
async function geocode(url) {
  const q = clean(url.searchParams.get('q'), 100);
  if (q.length < 3) return [];
  // Solo España, con preferencia por lo cercano a `near` (lat,lng del usuario o del centro del mapa).
  const [nlat, nlng] = (url.searchParams.get('near') || '').split(',').map(Number);
  const near = Number.isFinite(nlat) && Number.isFinite(nlng) && Math.abs(nlat) <= 90 && Math.abs(nlng) <= 180 ? [nlat, nlng] : null;
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
  const key = lang + '|' + q.toLowerCase() + (near ? `|${Math.round(near[0] * 2) / 2},${Math.round(near[1] * 2) / 2}` : '');
  if (geoCache.has(key)) return geoCache.get(key);
  if (Date.now() - lastGeo < 1000) fail(429, 'Espera un segundo');
  lastGeo = Date.now();
  let r;
  try {
    r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q, format: 'jsonv2', limit: 8, 'accept-language': lang, countrycodes: 'es',
      ...(near && { viewbox: [near[1] - 0.7, near[0] + 0.5, near[1] + 0.7, near[0] - 0.5].join(','), bounded: 0 }),
    }),
      { headers: OSM_HEADERS, signal: AbortSignal.timeout(10000) });
  } catch { fail(502, 'El buscador no responde'); }
  if (!r.ok) fail(502, 'El buscador no responde');
  const out = (await r.json()).map((x) => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
  if (geoCache.size > 500) geoCache.clear();
  geoCache.set(key, out);
  return out;
}


// ---------- rutas ----------
async function relation(meId, otherId) {
  if (!meId) return 'none';
  if (meId === otherId) return 'self';
  const f = await q1('select from_id, status from poyo.friendships where (from_id = $1 and to_id = $2) or (from_id = $2 and to_id = $1)', [meId, otherId]);
  if (!f) return 'none';
  return f.status === 'accepted' ? 'friends' : f.from_id === meId ? 'sent' : 'received';
}
const friendIdsSql = `select case when from_id = $1 then to_id else from_id end as id from poyo.friendships
  where status = 'accepted' and (from_id = $1 or to_id = $1)`;

async function api(req, res, url) {
  const ip = (process.env.TRUST_PROXY && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent); // sin 'api'
  const [a, b, c] = parts;
  const isPost = req.method === 'POST', isGet = req.method === 'GET';

  if (!isGet && limited(ip)) fail(429, 'Demasiadas peticiones, espera un minuto');

  // --- configuración pública para el navegador (supabase-js) ---
  if (isGet && a === 'config') return send(res, 200, { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, bucket: BUCKET, criteria: CRITERIA });
  if (isGet && a === 'osm') return send(res, 200, await osm(url));
  if (isGet && a === 'geocode') return send(res, 200, await geocode(url));

  const me = await currentUser(req);

  // --- cuenta: el alta, el login y la contraseña los gestiona Supabase Auth; aquí solo el perfil de Poyo ---
  if (isGet && a === 'me') return send(res, 200, me && (me.needsProfile ? { needsProfile: true } : publicUser(me)));
  if (isPost && a === 'me' && b === 'profile') { // elegir @usuario la primera vez
    if (!me) fail(401, 'Inicia sesión para hacer esto');
    if (!me.needsProfile) fail(409, 'Ya tienes perfil');
    const username = clean((await readJSON(req)).username, 20);
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) fail(400, 'Usuario: 3-20 letras, números, _ . -');
    try { await q('insert into poyo.profiles (id, username) values ($1, $2)', [me.id, username]); }
    catch (e) { if (e.code === '23505') fail(409, 'Ese usuario ya existe'); throw e; }
    return send(res, 201, publicUser(await q1('select id, username, bio, avatar from poyo.profiles where id = $1', [me.id])));
  }
  if (req.method === 'PUT' && a === 'me') {
    needUser(me);
    const body = await readJSON(req);
    if ('bio' in body) await q('update poyo.profiles set bio = $2 where id = $1', [me.id, clean(body.bio, 200)]);
    if ('avatar' in body) { // foto de perfil: ya subida por el navegador a Storage ('' para quitarla)
      const f = String(body.avatar || '');
      if (f && !photoOk(f, me.id)) fail(400, 'Foto no válida');
      if (me.avatar && me.avatar !== f) await trash([me.avatar]);
      await q('update poyo.profiles set avatar = $2 where id = $1', [me.id, f]);
    }
    return send(res, 200, publicUser(await q1('select id, username, bio, avatar from poyo.profiles where id = $1', [me.id])));
  }
  if (req.method === 'DELETE' && a === 'me') { // borra mis datos de Poyo (la cuenta de Marabunta Labs sigue existiendo)
    needUser(me); await purgeUser(me);
    return send(res, 200, {});
  }

  // --- sitios ---
  if (isGet && a === 'places' && !b) return send(res, 200, await q(STATS_SQL + ' group by p.id'));
  if (isGet && a === 'places' && b && !c) {
    const p = await placeStats(b) || fail(404, 'No existe');
    const reviews = await q(REVIEW_SQL + ` where r.place_id = $1 order by r.created_at desc`, [b]);
    const fr = new Set(me && !me.needsProfile ? (await q(friendIdsSql, [me.id])).map((x) => x.id) : []);
    const others = reviews.some((r) => r._uid !== me?.id);
    const created = await q1('select created_by from poyo.places where id = $1', [b]);
    const canDelete = !!me && !me.needsProfile && b.startsWith('u-') && (isAdmin(me) || (created.created_by === me.id && !others));
    return send(res, 200, { ...p, canDelete, reviews: reviews.map((r) => ({ ...shapeReview(r, false), byFriend: fr.has(r._uid) })) });
  }
  if (isPost && a === 'places' && !b) {
    needUser(me);
    const p = validPlace({ ...(await readJSON(req)), id: 'u-' + uid() }) || fail(400, 'Datos inválidos');
    await q('insert into poyo.places (id, lat, lng, name, type, created_by) values ($1, $2, $3, $4, $5, $6)', [p.id, p.lat, p.lng, p.name, p.type, me.id]);
    return send(res, 201, await placeStats(p.id));
  }
  if (isPost && a === 'places' && c === 'reviews') {
    needUser(me);
    const body = await readJSON(req);
    if (!(await q1('select id from poyo.places where id = $1', [b]))) {
      const v = b.startsWith('osm-') && validPlace({ ...body.place, id: b });
      if (!v) fail(404, 'No existe');
      await q('insert into poyo.places (id, lat, lng, name, type) values ($1, $2, $3, $4, $5) on conflict do nothing', [v.id, v.lat, v.lng, v.name, v.type]);
    }
    const rating = Math.round(Number(body.rating));
    const ratings = validRatings((await q1('select type from poyo.places where id = $1', [b])).type, body.ratings);
    if (!(rating >= 1 && rating <= 5)) fail(400, 'La nota va de 1 a 5');
    const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, MAX_PHOTOS).filter((f) => photoOk(f, me.id));
    const prev = await q1('select photos from poyo.reviews where place_id = $1 and user_id = $2', [b, me.id]);
    if (prev && photos.length) await trash(prev.photos.filter((f) => !photos.includes(f)));
    await q(`insert into poyo.reviews (place_id, user_id, rating, ratings, text, photos) values ($1, $2, $3, $4, $5, $6)
      on conflict (place_id, user_id) do update set rating = excluded.rating, ratings = excluded.ratings, text = excluded.text, created_at = now(),
        photos = case when cardinality(excluded.photos) > 0 then excluded.photos else poyo.reviews.photos end`,
      [b, me.id, rating, ratings, clean(body.text, 600), photos]);
    return send(res, 201, await placeStats(b));
  }

  // --- usuarios y perfiles ---
  if (isGet && a === 'users' && !b) {
    const term = clean(url.searchParams.get('q'), 20).toLowerCase();
    if (term.length < 2) { // sin texto: gente con más reseñas que aún no es tu amiga
      if (!me || me.needsProfile) return send(res, 200, []);
      const rows = await q(`select u.id, u.username, u.bio, u.avatar from poyo.profiles u
        left join poyo.reviews r on r.user_id = u.id
        where u.id <> $1 and not exists (select 1 from poyo.friendships f where (f.from_id = $1 and f.to_id = u.id) or (f.to_id = $1 and f.from_id = u.id))
        group by u.id order by count(r.id) desc, u.created_at limit 10`, [me.id]);
      return send(res, 200, rows.map((u) => ({ ...publicUser(u), relation: 'none' })));
    }
    const rows = await q(`select id, username, bio, avatar from poyo.profiles where lower(username) like $1 order by username limit 15`, ['%' + term.replace(/[%_\\]/g, '\\$&') + '%']);
    return send(res, 200, await Promise.all(rows.map(async (u) => ({ ...publicUser(u), relation: await relation(me?.id, u.id) }))));
  }
  if (isGet && a === 'users' && b) {
    const u = await byName(b) || fail(404, 'Usuario no encontrado');
    const rev = await q(REVIEW_SQL + ' where r.user_id = $1 order by r.created_at desc', [u.id]);
    const st = await q1('select count(*)::int as n, round(avg(rating)::numeric, 1)::float as avg, coalesce(sum(cardinality(photos)), 0)::int as photos from poyo.reviews where user_id = $1', [u.id]);
    const friends = await q(`select u2.id, u2.username, u2.bio, u2.avatar from poyo.profiles u2 where u2.id in (${friendIdsSql}) order by u2.username limit 30`, [u.id]);
    const fcount = await q1(`select count(*)::int as n from (${friendIdsSql}) x`, [u.id]);
    return send(res, 200, {
      ...publicUser(u), joined: (await q1('select created_at from poyo.profiles where id = $1', [u.id])).created_at, relation: await relation(me?.id, u.id),
      friendCount: fcount.n, reviewCount: st.n, avg: st.avg, photoCount: st.photos,
      friends: friends.map(publicUser), reviews: rev.slice(0, 50).map((r) => shapeReview(r, true)),
    });
  }

  // --- amigos ---
  if (a === 'friends') {
    needUser(me);
    if (isGet && !b) {
      const list = (cond, other) => q(`select u.id, u.username, u.bio, u.avatar from poyo.friendships f join poyo.profiles u on u.id = f.${other} where ${cond} order by u.username`, [me.id]);
      return send(res, 200, {
        friends: (await q(`select u.id, u.username, u.bio, u.avatar from poyo.profiles u where u.id in (${friendIdsSql}) order by u.username`, [me.id])).map(publicUser),
        incoming: (await list(`f.status = 'pending' and f.to_id = $1`, 'from_id')).map(publicUser),
        outgoing: (await list(`f.status = 'pending' and f.from_id = $1`, 'to_id')).map(publicUser),
      });
    }
    const other = b && (await byName(b) || fail(404, 'Usuario no encontrado'));
    if (isPost && other) { // enviar solicitud, o aceptarla si ya te la mandaron
      if (other.id === me.id) fail(400, 'Eres tú');
      const rel = await relation(me.id, other.id);
      if (rel === 'none') await q(`insert into poyo.friendships (from_id, to_id) values ($1, $2) on conflict do nothing`, [me.id, other.id]);
      else if (rel === 'received') await q(`update poyo.friendships set status = 'accepted' where from_id = $2 and to_id = $1`, [me.id, other.id]);
      return send(res, 200, { relation: await relation(me.id, other.id) });
    }
    if (req.method === 'DELETE' && other) { // cancelar, rechazar o eliminar amistad
      await q('delete from poyo.friendships where (from_id = $1 and to_id = $2) or (from_id = $2 and to_id = $1)', [me.id, other.id]);
      return send(res, 200, { relation: 'none' });
    }
  }
  if (req.method === 'DELETE' && a === 'places' && b) {
    needUser(me);
    const p = await q1('select id, created_by from poyo.places where id = $1', [b]) || fail(404, 'No existe');
    const others = (await q1('select count(*)::int as n from poyo.reviews where place_id = $1 and user_id <> $2', [b, me.id])).n > 0;
    if (!b.startsWith('u-') || !(isAdmin(me) || (p.created_by === me.id && !others))) fail(403, 'No puedes borrar este sitio');
    await trash((await q('select unnest(photos) as p from poyo.reviews where place_id = $1', [b])).map((x) => x.p));
    await q('delete from poyo.places where id = $1', [b]);
    return send(res, 200, {});
  }
  if (req.method === 'DELETE' && a === 'reviews' && b) {
    needUser(me);
    const r = await q1('select id, user_id, place_id, photos from poyo.reviews where id = $1', [b]) || fail(404, 'No existe');
    if (r.user_id !== me.id && !isAdmin(me)) fail(403, 'No es tu reseña');
    await removeReview(r);
    return send(res, 200, await placeStats(r.place_id));
  }
  if (isPost && a === 'reviews' && c === 'report') {
    needUser(me);
    const r = await q1('select id, user_id from poyo.reviews where id = $1', [b]) || fail(404, 'No existe');
    if (r.user_id === me.id) fail(400, 'Es tu propia reseña');
    await q('insert into poyo.reports (review_id, by_id, reason) values ($1, $2, $3) on conflict do nothing', [b, me.id, clean((await readJSON(req)).reason, 200)]);
    return send(res, 200, { ok: true });
  }
  if (a === 'admin') {
    if (!isAdmin(me)) fail(403, 'Solo para moderadores');
    if (isGet && b === 'reports') {
      const rows = await q(`select rp.id, rp.reason, rp.created_at as "createdAt", ub.username as by, rp.review_id as "reviewId" from poyo.reports rp
        join poyo.profiles ub on ub.id = rp.by_id order by rp.created_at desc`);
      return send(res, 200, await Promise.all(rows.map(async ({ reviewId, ...rp }) => ({ ...rp, review: shapeReview(await q1(REVIEW_SQL + ' where r.id = $1', [reviewId]), true) }))));
    }
    if (req.method === 'DELETE' && b === 'reports' && c) { await q('delete from poyo.reports where id = $1', [c]); return send(res, 200, {}); }
    if (req.method === 'DELETE' && b === 'users' && c) {
      const u = await byName(c) || fail(404, 'Usuario no encontrado');
      if (isAdmin(u)) fail(400, 'No puedes borrar a un moderador');
      await purgeUser(u);
      return send(res, 200, {});
    }
  }
  if (isGet && a === 'feed') {
    needUser(me);
    return send(res, 200, (await q(REVIEW_SQL + ` where r.user_id = $1 or r.user_id in (${friendIdsSql}) order by r.created_at desc limit 40`, [me.id])).map((r) => shapeReview(r, true)));
  }
  fail(404, 'No encontrado');
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    return api(req, res, url).catch((e) => {
      if (!(e instanceof HttpError)) console.error(e);
      if (!res.headersSent) send(res, e.code || 500, { error: e instanceof HttpError ? e.message : 'Error interno' });
    });
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Poyo en http://localhost:${PORT}`));
