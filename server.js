// Poyo — servidor sin dependencias (Node >= 18). Guarda todo en data/db.json y data/uploads/.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMINS = (process.env.ADMINS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
const SECURE = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const UPLOADS = path.join(DATA, 'uploads');
const DB_FILE = path.join(DATA, 'db.json');
const TYPES = ['bench', 'picnic', 'wall', 'other', 'fountain', 'shop'];
const MAX_PHOTOS = 3;

let db = {};
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
db.places ??= {}; db.reviews ??= []; db.users ??= {}; db.sessions ??= {};
db.friends ??= []; db.uploads ??= {}; db.reports ??= [];
fs.mkdirSync(UPLOADS, { recursive: true });

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 100);
}

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

function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new HttpError(413, 'Archivo demasiado grande')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSON(req) {
  const buf = await readRaw(req, 20000);
  try { return JSON.parse(buf.toString() || '{}'); } catch { return fail(400, 'JSON inválido'); }
}

// Límite simple: 60 escrituras por minuto y por IP (los intentos de login cuentan doble).
const hits = new Map();
function limited(ip, cost = 1) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  for (let i = 0; i < cost; i++) arr.push(now);
  hits.set(ip, arr);
  return arr.length > 60;
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

// ---------- usuarios y sesiones ----------
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const verifyPw = (u, pw) => crypto.timingSafeEqual(Buffer.from(hashPw(String(pw || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
function currentUser(req) {
  const m = /(?:^|;\s*)poyo=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  const s = m && db.sessions[m[1]];
  return (s && db.users[s.userId]) || null;
}
const needUser = (me) => me || fail(401, 'Inicia sesión para hacer esto');
function startSession(res, user, code = 200, extra = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, createdAt: Date.now() };
  save();
  send(res, code, { ...publicUser(user), ...extra }, {
    'Set-Cookie': `poyo=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 90}${SECURE}`,
  });
}
const isAdmin = (u) => !!u && ADMINS.includes(u.username.toLowerCase());
const publicUser = (u) => ({ id: u.id, username: u.username, bio: u.bio || '', avatar: u.avatar || '', isAdmin: isAdmin(u) });
const newRecovery = (u) => {
  const code = crypto.randomBytes(6).toString('hex').match(/.{4}/g).join('-');
  u.recovery = hashPw(code, u.salt);
  return code;
};
const byName = (name) => Object.values(db.users).find((u) => u.username.toLowerCase() === String(name).toLowerCase());

// ---------- amistad ----------
const findFriend = (a, b) => db.friends.find((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a));
function relation(meId, otherId) {
  if (!meId || meId === otherId) return meId ? 'self' : 'none';
  const f = findFriend(meId, otherId);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.from === meId ? 'sent' : 'received';
}
const friendIds = (meId) => db.friends
  .filter((f) => f.status === 'accepted' && (f.from === meId || f.to === meId))
  .map((f) => (f.from === meId ? f.to : f.from));

// ---------- sitios y reseñas ----------
function stats(place) {
  const rs = db.reviews.filter((r) => r.placeId === place.id);
  const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null;
  const photos = rs.flatMap((r) => r.photos || []).slice(-6);
  const { createdBy, ...pub } = place;
  return { ...pub, count: rs.length, avg: avg && Math.round(avg * 10) / 10, photos };
}
const shapeReview = (r, withPlace) => ({
  id: r.id, placeId: r.placeId, rating: r.rating, text: r.text, photos: r.photos || [],
  createdAt: r.createdAt, author: db.users[r.userId]?.username || 'Anónimo', avatar: db.users[r.userId]?.avatar || '',
  ...(withPlace && db.places[r.placeId] && {
    place: { id: r.placeId, name: db.places[r.placeId].name, type: db.places[r.placeId].type,
      lat: db.places[r.placeId].lat, lng: db.places[r.placeId].lng },
  }),
});

function dropPhotos(files) {
  const used = new Set([...db.reviews.flatMap((r) => r.photos || []), ...Object.values(db.users).map((u) => u.avatar)]);
  for (const f of files || []) if (!used.has(f)) { delete db.uploads[f]; fs.rm(path.join(UPLOADS, f), () => {}); }
}
function removeReview(r) {
  db.reviews = db.reviews.filter((x) => x !== r);
  db.reports = db.reports.filter((x) => x.reviewId !== r.id);
  dropPhotos(r.photos);
}
function removePlace(p) {
  db.reviews.filter((r) => r.placeId === p.id).forEach(removeReview);
  delete db.places[p.id];
}
function purgeUser(u) {
  db.reviews.filter((r) => r.userId === u.id).forEach(removeReview);
  Object.values(db.places).filter((p) => p.createdBy === u.id && !db.reviews.some((r) => r.placeId === p.id)).forEach(removePlace);
  db.friends = db.friends.filter((f) => f.from !== u.id && f.to !== u.id);
  db.reports = db.reports.filter((r) => r.by !== u.id);
  for (const t of Object.keys(db.sessions)) if (db.sessions[t].userId === u.id) delete db.sessions[t];
  for (const [f, owner] of Object.entries(db.uploads)) if (owner === u.id) { delete db.uploads[f]; fs.rm(path.join(UPLOADS, f), () => {}); }
  delete db.users[u.id];
  save();
}

function validPlace(p) {
  const id = clean(p.id, 40);
  const lat = Number(p.lat), lng = Number(p.lng);
  if (!/^(osm-[wr]?\d+|u-[a-z0-9]+)$/.test(id)) return null;
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { id, lat, lng, name: clean(p.name, 80), type: TYPES.includes(p.type) ? p.type : 'bench', createdAt: Date.now() };
}

// ---------- datos de OpenStreetMap ----------
// 1) Volcados locales (data/osm/*.json, creados con scripts/import-osm.js): instantáneo y sin depender de nadie.
// 2) Si la zona no está cubierta, Overpass: el público se satura a menudo, así que probamos varios mirrors,
//    guardamos cada zona en disco y, tras un fallo total, lo dejamos descansar un minuto.
const KIND = { b: { amenity: 'bench' }, p: { leisure: 'picnic_table' }, f: { amenity: 'drinking_water' }, s: { shop: 'supermarket' } };
const CELL = 0.01, grid = new Map();
let localCount = 0;
try {
  for (const f of fs.readdirSync(path.join(DATA, 'osm')).filter((x) => x.endsWith('.json') && !x.startsWith('.'))) {
    const { items } = JSON.parse(fs.readFileSync(path.join(DATA, 'osm', f), 'utf8'));
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
  const key = q.toLowerCase() + (near ? `|${Math.round(near[0] * 2) / 2},${Math.round(near[1] * 2) / 2}` : '');
  if (geoCache.has(key)) return geoCache.get(key);
  if (Date.now() - lastGeo < 1000) fail(429, 'Espera un segundo');
  lastGeo = Date.now();
  let r;
  try {
    r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q, format: 'jsonv2', limit: 8, 'accept-language': 'es', countrycodes: 'es',
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
async function api(req, res, url) {
  const ip = (process.env.TRUST_PROXY && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent); // sin 'api'
  const [a, b, c] = parts;
  const me = currentUser(req);
  const isPost = req.method === 'POST', isGet = req.method === 'GET';

  if (req.method !== 'GET' && limited(ip, a === 'login' || a === 'register' ? 3 : 1)) fail(429, 'Demasiadas peticiones, espera un minuto');

  // --- cuenta ---
  if (isPost && a === 'register') {
    const body = await readJSON(req);
    const username = clean(body.username, 20);
    const pw = String(body.password || '');
    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) fail(400, 'Usuario: 3-20 letras, números, _ . -');
    if (pw.length < 6 || pw.length > 100) fail(400, 'La contraseña debe tener al menos 6 caracteres');
    if (byName(username)) fail(409, 'Ese usuario ya existe');
    const salt = crypto.randomBytes(16).toString('hex');
    const user = { id: uid(), username, salt, hash: hashPw(pw, salt), bio: '', createdAt: Date.now() };
    db.users[user.id] = user;
    return startSession(res, user, 201, { recoveryCode: newRecovery(user) });
  }
  if (isPost && a === 'login') {
    const body = await readJSON(req);
    const u = byName(clean(body.username, 20));
    const ok = u && verifyPw(u, body.password);
    if (!ok) fail(401, 'Usuario o contraseña incorrectos');
    return startSession(res, u);
  }
  if (isPost && a === 'logout') {
    const m = /poyo=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (m) { delete db.sessions[m[1]]; save(); }
    return send(res, 200, {}, { 'Set-Cookie': 'poyo=; HttpOnly; Path=/; Max-Age=0' });
  }
  if (isPost && a === 'reset') { // recuperar contraseña con el código de recuperación
    const body = await readJSON(req);
    const u = byName(clean(body.username, 20));
    const code = clean(body.recoveryCode, 20).toLowerCase();
    const pw = String(body.password || '');
    const ok = u && u.recovery && crypto.timingSafeEqual(Buffer.from(hashPw(code, u.salt), 'hex'), Buffer.from(u.recovery, 'hex'));
    if (!ok) fail(401, 'Usuario o código de recuperación incorrectos');
    if (pw.length < 6 || pw.length > 100) fail(400, 'La contraseña debe tener al menos 6 caracteres');
    u.hash = hashPw(pw, u.salt);
    for (const t of Object.keys(db.sessions)) if (db.sessions[t].userId === u.id) delete db.sessions[t];
    return startSession(res, u, 200, { recoveryCode: newRecovery(u) });
  }
  if (isPost && a === 'password') {
    needUser(me);
    const body = await readJSON(req);
    const pw = String(body.newPassword || '');
    if (!verifyPw(me, body.password)) fail(401, 'Contraseña actual incorrecta');
    if (pw.length < 6 || pw.length > 100) fail(400, 'La contraseña debe tener al menos 6 caracteres');
    me.hash = hashPw(pw, me.salt); save();
    return send(res, 200, {});
  }
  if (req.method === 'DELETE' && a === 'me') { // borrar mi cuenta
    needUser(me);
    if (!verifyPw(me, (await readJSON(req)).password)) fail(401, 'Contraseña incorrecta');
    purgeUser(me);
    return send(res, 200, {}, { 'Set-Cookie': 'poyo=; HttpOnly; Path=/; Max-Age=0' });
  }
  if (isGet && a === 'osm') return send(res, 200, await osm(url));
  if (isGet && a === 'geocode') return send(res, 200, await geocode(url));
  if (isGet && a === 'me') return send(res, 200, me ? publicUser(me) : null);
  if (req.method === 'PUT' && a === 'me') {
    needUser(me);
    const body = await readJSON(req);
    if ('bio' in body) me.bio = clean(body.bio, 200);
    if ('avatar' in body) { // foto de perfil: un archivo subido por mí con /upload (o '' para quitarla)
      const f = String(body.avatar || '');
      if (f && (db.uploads[f] !== me.id || db.reviews.some((r) => r.photos?.includes(f)))) fail(400, 'Foto no válida');
      const old = me.avatar; me.avatar = f; dropPhotos(old ? [old] : []);
    }
    save();
    return send(res, 200, publicUser(me));
  }

  // --- fotos ---
  if (isPost && a === 'upload') {
    needUser(me);
    const buf = await readRaw(req, 3 * 1024 * 1024);
    if (!(buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) fail(400, 'Solo se admiten fotos JPEG');
    const name = crypto.randomBytes(12).toString('hex') + '.jpg';
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    db.uploads[name] = me.id; save();
    return send(res, 201, { file: name });
  }

  // --- sitios ---
  if (isGet && a === 'places' && !b) return send(res, 200, Object.values(db.places).map(stats));
  if (isGet && a === 'places' && b && !c) {
    const p = db.places[b] || fail(404, 'No existe');
    const fr = new Set(me ? friendIds(me.id) : []);
    const reviews = db.reviews.filter((r) => r.placeId === b).sort((x, y) => y.createdAt - x.createdAt)
      .map((r) => ({ ...shapeReview(r), byFriend: fr.has(r.userId) }));
    const others = reviews.some((r) => r.author !== me?.username);
    const canDelete = !!me && p.id.startsWith('u-') && (isAdmin(me) || (p.createdBy === me.id && !others));
    return send(res, 200, { ...stats(p), reviews, canDelete });
  }
  if (isPost && a === 'places' && !b) {
    needUser(me);
    const p = validPlace({ ...(await readJSON(req)), id: 'u-' + uid() }) || fail(400, 'Datos inválidos');
    db.places[p.id] = { ...p, createdBy: me.id }; save();
    return send(res, 201, stats(p));
  }
  if (isPost && a === 'places' && c === 'reviews') {
    needUser(me);
    const body = await readJSON(req);
    let place = db.places[b];
    if (!place) {
      place = b.startsWith('osm-') && validPlace({ ...body.place, id: b });
      if (!place) fail(404, 'No existe');
      db.places[b] = place;
    }
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) fail(400, 'La nota va de 1 a 5');
    const photos = (Array.isArray(body.photos) ? body.photos : []).slice(0, MAX_PHOTOS)
      .filter((f) => db.uploads[f] === me.id);
    const prev = db.reviews.find((r) => r.placeId === b && r.userId === me.id);
    const data = { rating, text: clean(body.text, 600), photos: photos.length ? photos : prev?.photos || [], createdAt: Date.now() };
    if (prev) Object.assign(prev, data);
    else db.reviews.push({ id: uid(), placeId: b, userId: me.id, ...data });
    save();
    return send(res, 201, stats(place));
  }

  // --- usuarios y perfiles ---
  if (isGet && a === 'users' && !b) {
    const q = clean(url.searchParams.get('q'), 20).toLowerCase();
    if (q.length < 2) { // sin texto: gente con más reseñas que aún no es tu amiga
      if (!me) return send(res, 200, []);
      const n = (u) => db.reviews.filter((r) => r.userId === u.id).length;
      return send(res, 200, Object.values(db.users).filter((u) => u.id !== me.id && !findFriend(me.id, u.id))
        .map((u) => [n(u), u]).sort((x, y) => y[0] - x[0]).slice(0, 10).map(([, u]) => ({ ...publicUser(u), relation: 'none' })));
    }
    return send(res, 200, Object.values(db.users).filter((u) => u.username.toLowerCase().includes(q)).slice(0, 15)
      .map((u) => ({ ...publicUser(u), relation: relation(me?.id, u.id) })));
  }
  if (isGet && a === 'users' && b) {
    const u = byName(b) || fail(404, 'Usuario no encontrado');
    const rev = db.reviews.filter((r) => r.userId === u.id).sort((x, y) => y.createdAt - x.createdAt);
    return send(res, 200, {
      ...publicUser(u), joined: u.createdAt, relation: relation(me?.id, u.id),
      friendCount: friendIds(u.id).length, reviewCount: rev.length,
      avg: rev.length ? Math.round(rev.reduce((a, r) => a + r.rating, 0) / rev.length * 10) / 10 : null,
      photoCount: rev.reduce((a, r) => a + (r.photos?.length || 0), 0),
      friends: friendIds(u.id).slice(0, 30).map((id) => publicUser(db.users[id])),
      reviews: rev.slice(0, 50).map((r) => shapeReview(r, true)),
    });
  }

  // --- amigos ---
  if (a === 'friends') {
    needUser(me);
    if (isGet && !b) {
      const list = (pred) => db.friends.filter(pred).map((f) => publicUser(db.users[f.from === me.id ? f.to : f.from]));
      return send(res, 200, {
        friends: friendIds(me.id).map((id) => publicUser(db.users[id])),
        incoming: list((f) => f.status === 'pending' && f.to === me.id),
        outgoing: list((f) => f.status === 'pending' && f.from === me.id),
      });
    }
    const other = b && (byName(b) || fail(404, 'Usuario no encontrado'));
    if (isPost && other) { // enviar solicitud, o aceptarla si ya te la mandaron
      if (other.id === me.id) fail(400, 'Eres tú');
      const f = findFriend(me.id, other.id);
      if (!f) db.friends.push({ from: me.id, to: other.id, status: 'pending', createdAt: Date.now() });
      else if (f.status === 'pending' && f.to === me.id) f.status = 'accepted';
      save();
      return send(res, 200, { relation: relation(me.id, other.id) });
    }
    if (req.method === 'DELETE' && other) { // cancelar, rechazar o eliminar amistad
      db.friends = db.friends.filter((f) => f !== findFriend(me.id, other.id)); save();
      return send(res, 200, { relation: 'none' });
    }
  }
  if (req.method === 'DELETE' && a === 'places' && b) {
    needUser(me);
    const p = db.places[b] || fail(404, 'No existe');
    const others = db.reviews.some((r) => r.placeId === b && r.userId !== me.id);
    if (!b.startsWith('u-') || !(isAdmin(me) || (p.createdBy === me.id && !others))) fail(403, 'No puedes borrar este sitio');
    removePlace(p); save();
    return send(res, 200, {});
  }
  if (req.method === 'DELETE' && a === 'reviews' && b) {
    needUser(me);
    const r = db.reviews.find((x) => x.id === b) || fail(404, 'No existe');
    if (r.userId !== me.id && !isAdmin(me)) fail(403, 'No es tu reseña');
    removeReview(r); save();
    return send(res, 200, stats(db.places[r.placeId]));
  }
  if (isPost && a === 'reviews' && c === 'report') {
    needUser(me);
    const r = db.reviews.find((x) => x.id === b) || fail(404, 'No existe');
    if (r.userId === me.id) fail(400, 'Es tu propia reseña');
    if (!db.reports.some((x) => x.reviewId === b && x.by === me.id))
      db.reports.push({ id: uid(), reviewId: b, by: me.id, reason: clean((await readJSON(req)).reason, 200), createdAt: Date.now() });
    save();
    return send(res, 200, { ok: true });
  }
  if (a === 'admin') {
    if (!isAdmin(me)) fail(403, 'Solo para moderadores');
    if (isGet && b === 'reports') {
      return send(res, 200, db.reports.map((rp) => ({
        id: rp.id, reason: rp.reason, by: db.users[rp.by]?.username, createdAt: rp.createdAt,
        review: shapeReview(db.reviews.find((r) => r.id === rp.reviewId), true),
      })).sort((x, y) => y.createdAt - x.createdAt));
    }
    if (req.method === 'DELETE' && b === 'reports' && c) { db.reports = db.reports.filter((x) => x.id !== c); save(); return send(res, 200, {}); }
    if (req.method === 'DELETE' && b === 'users' && c) {
      const u = byName(c) || fail(404, 'Usuario no encontrado');
      if (isAdmin(u)) fail(400, 'No puedes borrar a un moderador');
      purgeUser(u);
      return send(res, 200, {});
    }
  }
  if (isGet && a === 'feed') {
    needUser(me);
    const ids = new Set([...friendIds(me.id), me.id]);
    return send(res, 200, db.reviews.filter((r) => ids.has(r.userId))
      .sort((x, y) => y.createdAt - x.createdAt).slice(0, 40).map((r) => shapeReview(r, true)));
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
  const isUpload = url.pathname.startsWith('/uploads/');
  const root = isUpload ? UPLOADS : PUBLIC;
  const rel = isUpload ? url.pathname.slice(9) : url.pathname === '/' ? 'index.html' : url.pathname;
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      ...(isUpload && { 'Cache-Control': 'public, max-age=31536000, immutable' }),
    });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Poyo en http://localhost:${PORT}`));
