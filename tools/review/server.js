// Herramienta local para revisar los sitios del volcado de OSM con fotos de la calle.
//   node tools/review/server.js [zona]      → http://localhost:3100   (zona por defecto: granada)
// Solo escucha en 127.0.0.1. Veredictos en data/review/verdicts.json, recortes en data/review/crops/.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
try { // .env.local → process.env (sin dependencias)
  for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}
const MLY = process.env.MAPILLARY_TOKEN;
const GKEY = process.env.GOOGLE_MAPS_KEY;
if (!MLY) { console.error('Falta MAPILLARY_TOKEN (en .env.local o como variable de entorno)'); process.exit(1); }

const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const REVIEW = path.join(DATA, 'review');
const CROPS = path.join(REVIEW, 'crops');
const VERDICTS = path.join(REVIEW, 'verdicts.json');
fs.mkdirSync(CROPS, { recursive: true });

// [sur, oeste, norte, este]
const ZONES = {
  todas: [36.0, -9.0, 44.0, 4.0],
  granada: [37.12, -3.65, 37.22, -3.55],
  madrid: [40.35, -3.78, 40.50, -3.60],
  barcelona: [41.32, 2.07, 41.47, 2.23],
  valencia: [39.42, -0.43, 39.52, -0.32],
  sevilla: [37.33, -6.03, 37.44, -5.93],
  malaga: [36.67, -4.52, 36.77, -4.35],
  zaragoza: [41.60, -0.97, 41.72, -0.80],
  bilbao: [43.23, -2.98, 43.30, -2.88],
  murcia: [37.95, -1.17, 38.03, -1.08],
  cordoba: [37.84, -4.82, 37.92, -4.73],
  alicante: [38.32, -0.53, 38.38, -0.43],
  valladolid: [41.62, -4.78, 41.68, -4.70],
  palma: [39.53, 2.60, 39.60, 2.70],
};
const DEFAULT_ZONE = (process.argv[2] || 'granada').toLowerCase();
if (!ZONES[DEFAULT_ZONE]) (console.error(`Zona desconocida. Opciones: ${Object.keys(ZONES).join(', ')}`), process.exit(1));
const TYPE_NAME = { b: 'Banco', f: 'Fuente', s: 'Tienda', p: 'Mesa de picnic' };

let verdicts = {};
try { verdicts = JSON.parse(fs.readFileSync(VERDICTS, 'utf8')); } catch {}
const saveVerdicts = () => {
  fs.writeFileSync(VERDICTS + '.tmp', JSON.stringify(verdicts, null, 1));
  fs.renameSync(VERDICTS + '.tmp', VERDICTS);
};

// Cola: todos los sitios en orden pseudoaleatorio estable (muestra sin sesgo → % de fiabilidad real).
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const dump = JSON.parse(fs.readFileSync(path.join(DATA, 'osm', 'spain.json'), 'utf8'));
const ALL = dump.items.map(([id, lat, lng, kind, name]) => ({ id, lat, lng, kind, type: TYPE_NAME[kind], name }))
  .sort((a, b) => hash(a.id) - hash(b.id));
const byId = new Map(ALL.map((p) => [p.id, p]));
const inBox = (p, [s, w, n, e]) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
const zoneCache = {};
const zoneItems = (z) => (zoneCache[z] ??= ALL.filter((p) => {
  if (z === 'todas') {
    // Si es "todas", comprobamos si el sitio está dentro de CUALQUIERA de las otras ciudades
    return Object.entries(ZONES).some(([name, box]) => name !== 'todas' && inBox(p, box));
  }
  // Si es una ciudad concreta, funciona como antes
  return inBox(p, ZONES[z]);
}));
console.log(`${ALL.length} sitios en el volcado, ${Object.keys(verdicts).length} ya revisados. Zona inicial: ${DEFAULT_ZONE}`);

// Filtro de la petición: ?zone=granada&kinds=bf&bbox=s,w,n,e&radius=100
function parseFilter(sp) {
  const zone = ZONES[sp.get('zone')] ? sp.get('zone') : DEFAULT_ZONE;
  const bb = (sp.get('bbox') || '').split(',').map(Number);
  const kinds = sp.get('kinds');
  return {
    zone, box: bb.length === 4 && bb.every(Number.isFinite) ? bb : null,
    kinds: kinds ? new Set(kinds.split('')) : null, radius: Math.max(0, Number(sp.get('radius') ?? 100) || 0),
  };
}
const matches = (p, f) => (!f.kinds || f.kinds.has(p.kind)) && (!f.box || inBox(p, f.box));

// Separación: un sitio queda oculto si ya hay uno del mismo tipo revisado a menos de `radius` metros.
const CELLD = 0.001; // ~90 m
let revIndex = null; // se reconstruye tras cada cambio de veredictos
function reviewedIndex() {
  if (revIndex) return revIndex;
  revIndex = new Map();
  for (const id in verdicts) {
    const p = byId.get(id); if (!p) continue;
    const k = `${p.kind}|${Math.floor(p.lat / CELLD)}|${Math.floor(p.lng / CELLD)}`;
    (revIndex.get(k) || revIndex.set(k, []).get(k)).push(p);
  }
  return revIndex;
}
function nearReviewed(p, radius) {
  if (!radius) return false;
  const idx = reviewedIndex(), n = Math.ceil(radius / 70), cy = Math.floor(p.lat / CELLD), cx = Math.floor(p.lng / CELLD);
  for (let y = cy - n; y <= cy + n; y++) for (let x = cx - n; x <= cx + n; x++) {
    for (const q of idx.get(`${p.kind}|${y}|${x}`) || []) if (meters(p.lat, p.lng, q.lat, q.lng) < radius) return true;
  }
  return false;
}

// ---------- fotos ----------
const rad = (d) => (d * Math.PI) / 180;
function bearing(lat1, lng1, lat2, lng2) { // rumbo de 1 → 2, en grados
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function meters(lat1, lng1, lat2, lng2) {
  const dx = rad(lng2 - lng1) * Math.cos(rad((lat1 + lat2) / 2)), dy = rad(lat2 - lat1);
  return Math.hypot(dx, dy) * 6371000;
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

async function mapillaryImages(lat, lng) {
  const d = 0.0006; // ~65 m alrededor
  const u = new URL('https://graph.mapillary.com/images');
  u.search = new URLSearchParams({
    access_token: MLY, limit: '100', bbox: [lng - d * 1.3, lat - d, lng + d * 1.3, lat + d].join(','),
    fields: 'id,thumb_2048_url,computed_compass_angle,captured_at,is_pano,geometry',
  });
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Mapillary ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).data || []).filter((i) => i.thumb_2048_url && i.geometry).map((i) => {
    const [ilng, ilat] = i.geometry.coordinates;
    const dist = meters(ilat, ilng, lat, lng);
    const toPlace = bearing(ilat, ilng, lat, lng);
    const off = i.is_pano ? 0 : angDiff(i.computed_compass_angle ?? 0, toPlace); // panorámicas: sin orientación fija
    return {
      source: 'mapillary', id: i.id, url: i.thumb_2048_url, pano: !!i.is_pano,
      dist: Math.round(dist), off: Math.round(off), capturedAt: i.captured_at,
      score: dist + off * 0.5 + (i.is_pano ? 15 : 0), // cerca y mirando al sitio primero
    };
  }).filter((i) => i.off < 70 && i.dist < 60).sort((a, b) => a.score - b.score).slice(0, 12);
}

const ALLOWED_IMG = /^https:\/\/([a-z0-9-]+\.)*(fbcdn\.net|mapillary\.com)\//;

// ---------- servidor ----------
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
function readBody(req, max = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function route(req, res, url) {
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (url.pathname === '/api/state') {
    const f = parseFilter(url.searchParams);
    const items = zoneItems(f.zone).filter((p) => matches(p, f));
    const counts = { exists: 0, missing: 0, doubt: 0 };
    for (const p of items) if (verdicts[p.id]) counts[verdicts[p.id].verdict]++;
    const skip = new Set((url.searchParams.get('skip') || '').split(',')); // saltados en esta sesión
    const open = items.filter((p) => !verdicts[p.id]);
    const eligible = open.filter((p) => !nearReviewed(p, f.radius));
    return json(res, 200, {
      zone: f.zone, zones: ZONES, total: items.length, counts, gkey: GKEY || null,
      left: eligible.length, hidden: open.length - eligible.length,
      pending: eligible.find((p) => !skip.has(p.id)) || null,
    });
  }
  if (url.pathname === '/api/points') { // para el mapa de filtros: [lat, lng, tipo, estado 0 pendiente/1 existe/2 no existe/3 dudoso]
    const z = ZONES[url.searchParams.get('zone')] ? url.searchParams.get('zone') : DEFAULT_ZONE;
    const code = { exists: 1, missing: 2, doubt: 3 };
    return json(res, 200, zoneItems(z).map((p) => [p.lat, p.lng, p.kind, code[verdicts[p.id]?.verdict] || 0]));
  }
  if (url.pathname === '/api/reviewed') { // lo ya revisado, lo último primero
    return json(res, 200, Object.entries(verdicts).filter(([id]) => byId.has(id))
      .map(([id, v]) => ({ ...byId.get(id), ...v })).sort((a, b) => b.at - a.at));
  }
  if (url.pathname === '/api/place') { // un sitio concreto (para volver atrás)
    const p = byId.get(url.searchParams.get('id'));
    return p ? json(res, 200, { ...p, review: verdicts[p.id] || null }) : json(res, 404, { error: 'no existe' });
  }
  if (url.pathname === '/api/images') {
    const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(res, 400, { error: 'lat/lng' });
    let images = [], error = null;
    try { images = await mapillaryImages(lat, lng); } catch (e) { error = e.message; }
    return json(res, 200, { images, error });
  }
  if (url.pathname === '/img') { // proxy: así el canvas del navegador puede recortar sin CORS
    const target = url.searchParams.get('u') || '';
    if (!ALLOWED_IMG.test(target)) return json(res, 400, { error: 'host no permitido' });
    const r = await fetch(target, { signal: AbortSignal.timeout(20000) });
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=3600' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (url.pathname === '/api/verdict' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 50000)).toString() || '{}');
    if (!byId.has(body.id) || !['exists', 'missing', 'doubt'].includes(body.verdict)) return json(res, 400, { error: 'datos inválidos' });
    const prev = verdicts[body.id]; // al corregir: sin recorte nuevo se conserva el anterior, salvo si pasa a «no existe»
    const photo = body.crop ? body : body.verdict !== 'missing' && prev?.crop ? { ...prev, crop: prev.crop } : {};
    if (prev?.crop && !photo.crop) fs.rmSync(path.join(CROPS, prev.crop), { force: true });
    verdicts[body.id] = {
      verdict: body.verdict, at: Date.now(),
      ...(photo.crop && { crop: photo.crop, source: photo.source, sourceId: photo.sourceId }),
    };
    saveVerdicts(); revIndex = null;
    return json(res, 200, {});
  }
  if (url.pathname === '/api/undo' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 5000)).toString() || '{}');
    if (verdicts[body.id]?.crop) fs.rmSync(path.join(CROPS, verdicts[body.id].crop), { force: true });
    delete verdicts[body.id]; saveVerdicts(); revIndex = null;
    return json(res, 200, {});
  }
  if (url.pathname === '/api/crop' && req.method === 'POST') { // JPEG ya recortado desde el navegador
    const id = url.searchParams.get('id');
    const buf = await readBody(req);
    if (!byId.has(id) || !(buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8)) return json(res, 400, { error: 'JPEG inválido' });
    const name = `${id}.jpg`;
    fs.writeFileSync(path.join(CROPS, name), buf);
    return json(res, 201, { crop: name });
  }
  if (url.pathname.startsWith('/crops/')) {
    const file = path.join(CROPS, path.basename(url.pathname));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404); res.end('404');
}

http.createServer((req, res) => {
  route(req, res, new URL(req.url, 'http://localhost')).catch((e) => {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: e.message });
  });
}).listen(process.env.REVIEW_PORT || 3100, '127.0.0.1', () => console.log(`Revisión en http://localhost:${process.env.REVIEW_PORT || 3100}`));
