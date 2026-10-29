#!/usr/bin/env node
// Importa bancos, mesas de pícnic, fuentes y tiendas de alimentación de un volcado .osm.pbf
// a DATA_DIR/osm/<nombre>.json, que el servidor usa en lugar de Overpass (que se satura).
// Sin dependencias. Uso:
//   node scripts/import-osm.js                      # España entera (Geofabrik, ~1,3 GB, se borra al terminar)
//   node scripts/import-osm.js <url|fichero.pbf> [--name nombre] [--keep]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const OUT_DIR = path.join(DATA, 'osm');
const DEFAULT_URL = 'https://download.geofabrik.de/europe/spain-latest.osm.pbf';

// ---------- protobuf mínimo ----------
class PB {
  constructor(buf) { this.buf = buf; this.p = 0; }
  more() { return this.p < this.buf.length; }
  varint() { let r = 0, m = 1, b; do { b = this.buf[this.p++]; r += (b & 0x7f) * m; m *= 128; } while (b & 0x80); return r; }
  tag() { const t = this.varint(); this.wt = t % 8; return Math.floor(t / 8); }
  bytes() { const n = this.varint(), s = this.p; this.p += n; return this.buf.subarray(s, s + n); }
  skip() { if (this.wt === 0) this.varint(); else if (this.wt === 2) this.bytes(); else this.p += this.wt === 1 ? 8 : 4; }
}
const zz = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);
function packed(buf, signed) {
  const pb = new PB(buf), out = [];
  while (pb.more()) { const v = pb.varint(); out.push(signed ? zz(v) : v); }
  return out;
}

// ---------- formato PBF: [longitud][cabecera][blob] ... ----------
function* blobs(fd, size) {
  const len = Buffer.alloc(4);
  let pos = 0;
  while (pos < size) {
    fs.readSync(fd, len, 0, 4, pos); pos += 4;
    const hb = Buffer.alloc(len.readUInt32BE(0));
    fs.readSync(fd, hb, 0, hb.length, pos); pos += hb.length;
    const h = new PB(hb); let type, dataSize;
    while (h.more()) { const f = h.tag(); if (f === 1) type = h.bytes().toString(); else if (f === 3) dataSize = h.varint(); else h.skip(); }
    const data = Buffer.alloc(dataSize);
    fs.readSync(fd, data, 0, dataSize, pos); pos += dataSize;
    yield { type, data, pos, size };
  }
}
function inflate(blob) {
  const pb = new PB(blob);
  while (pb.more()) {
    const f = pb.tag();
    if (f === 1) return pb.bytes();
    if (f === 3) return zlib.inflateSync(pb.bytes());
    pb.skip();
  }
  throw new Error('Blob con compresión no soportada');
}

function primitiveBlock(buf) {
  const pb = new PB(buf), strings = [], groups = [];
  let gran = 100, latOff = 0, lonOff = 0;
  while (pb.more()) {
    const f = pb.tag();
    if (f === 1) { const st = new PB(pb.bytes()); while (st.more()) { if (st.tag() === 1) strings.push(st.bytes()); else st.skip(); } }
    else if (f === 2) groups.push(pb.bytes());
    else if (f === 17) gran = pb.varint();
    else if (f === 19) latOff = pb.varint();
    else if (f === 20) lonOff = pb.varint();
    else pb.skip();
  }
  return { strings, groups, gran, latOff, lonOff };
}

// Índices (dentro de la tabla de cadenas de cada bloque) de las etiquetas que nos interesan.
const WANT = ['amenity', 'leisure', 'shop', 'name', 'bench', 'picnic_table', 'drinking_water', 'supermarket', 'convenience', 'general', 'no'];
function wanted(strings) {
  const W = Object.fromEntries(WANT.map((k) => [k, -2]));
  strings.forEach((b, i) => { if (b.length <= 14) { const s = b.toString(); if (s in W) W[s] = i; } });
  return W;
}
function classify(pairs, strings, W) { // pairs = [clave, valor, clave, valor...] → { kind, name } | null
  let kind = null, name = null, notDrinkable = false;
  for (let j = 0; j < pairs.length; j += 2) {
    const k = pairs[j], v = pairs[j + 1];
    if (k === W.amenity) { if (v === W.bench) kind = 'b'; else if (v === W.drinking_water) kind = 'f'; }
    else if (k === W.drinking_water) { if (v === W.no) notDrinkable = true; } // amenity=drinking_water + drinking_water=no
    else if (k === W.leisure) { if (v === W.picnic_table) kind = 'p'; }
    else if (k === W.shop) { if (v === W.supermarket || v === W.convenience || v === W.general) kind = 's'; }
    else if (k === W.name) name = v;
  }
  return kind && !(kind === 'f' && notDrinkable) && { kind, name: name == null ? '' : strings[name].toString().slice(0, 80) };
}

// Recorre los nodos de un grupo. cb(id, lat, lon, pairs|null) por cada nodo.
function eachDenseNode(buf, B, withTags, cb) {
  const pb = new PB(buf); let ids, lats, lons, kv;
  while (pb.more()) {
    const f = pb.tag();
    if (f === 1) ids = packed(pb.bytes(), true);
    else if (f === 8) lats = packed(pb.bytes(), true);
    else if (f === 9) lons = packed(pb.bytes(), true);
    else if (f === 10 && withTags) kv = packed(pb.bytes(), false);
    else pb.skip();
  }
  let id = 0, lat = 0, lon = 0, k = 0;
  for (let i = 0; i < ids.length; i++) {
    id += ids[i]; lat += lats[i]; lon += lons[i];
    let pairs = null;
    if (kv) { while (kv[k] !== 0) { (pairs ??= []).push(kv[k], kv[k + 1]); k += 2; } k++; }
    cb(id, (B.latOff + B.gran * lat) * 1e-9, (B.lonOff + B.gran * lon) * 1e-9, pairs);
  }
}

function plainNode(buf, B, cb) { // nodos sin comprimir en "dense" (raro, pero válido)
  const pb = new PB(buf); let id = 0, lat = 0, lon = 0, keys = [], vals = [];
  while (pb.more()) {
    const f = pb.tag();
    if (f === 1) id = zz(pb.varint()); else if (f === 2) keys = packed(pb.bytes(), false); else if (f === 3) vals = packed(pb.bytes(), false);
    else if (f === 8) lat = zz(pb.varint()); else if (f === 9) lon = zz(pb.varint()); else pb.skip();
  }
  const pairs = keys.length ? keys.flatMap((k, i) => [k, vals[i]]) : null;
  cb(id, (B.latOff + B.gran * lat) * 1e-9, (B.lonOff + B.gran * lon) * 1e-9, pairs);
}

function wayInfo(buf) {
  const pb = new PB(buf); let id, keys = [], vals = [], refs = [];
  while (pb.more()) {
    const f = pb.tag();
    if (f === 1) id = pb.varint(); else if (f === 2) keys = packed(pb.bytes(), false); else if (f === 3) vals = packed(pb.bytes(), false);
    else if (f === 8) refs = packed(pb.bytes(), true); else pb.skip();
  }
  let acc = 0; refs = refs.map((d) => (acc += d));
  return { id, pairs: keys.flatMap((k, i) => [k, vals[i]]), refs };
}

// ---------- importación ----------
async function download(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': 'poyo-import/1.0' } });
  if (!r.ok) throw new Error('Descarga fallida: HTTP ' + r.status);
  const total = Number(r.headers.get('content-length')) || 0; let got = 0, last = 0;
  const src = Readable.fromWeb(r.body);
  src.on('data', (c) => {
    got += c.length;
    if (Date.now() - last > 2000) { last = Date.now(); process.stdout.write(`\r  descargando ${(got / 1e6).toFixed(0)}${total ? '/' + (total / 1e6).toFixed(0) : ''} MB   `); }
  });
  await pipeline(src, fs.createWriteStream(dest));
  process.stdout.write('\n');
}

function importFile(file) {
  const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
  const items = [], pending = []; // pending: ways que necesitan coordenadas de sus nodos
  let nodeBlocks = 0, last = 0;
  const progress = (pos, what) => { if (Date.now() - last > 2000) { last = Date.now(); process.stdout.write(`\r  ${what} ${Math.round((pos / size) * 100)}% · ${items.length} sitios   `); } };

  for (const b of blobs(fd, size)) { // pasada 1: nodos con etiquetas y ways con etiquetas
    if (b.type !== 'OSMData') continue;
    const B = primitiveBlock(inflate(b.data)), W = wanted(B.strings);
    let hasNodes = false;
    for (const g of B.groups) {
      const pb = new PB(g);
      while (pb.more()) {
        const f = pb.tag();
        if (f === 2) { // dense
          hasNodes = true;
          eachDenseNode(pb.bytes(), B, true, (id, lat, lon, pairs) => {
            const c = pairs && classify(pairs, B.strings, W);
            if (c) items.push(['osm-' + id, +lat.toFixed(6), +lon.toFixed(6), c.kind, c.name]);
          });
        } else if (f === 1) {
          hasNodes = true;
          plainNode(pb.bytes(), B, (id, lat, lon, pairs) => {
            const c = pairs && classify(pairs, B.strings, W);
            if (c) items.push(['osm-' + id, +lat.toFixed(6), +lon.toFixed(6), c.kind, c.name]);
          });
        } else if (f === 3) {
          const w = wayInfo(pb.bytes()), c = classify(w.pairs, B.strings, W);
          if (c && w.refs.length) pending.push({ id: 'osm-w' + w.id, kind: c.kind, name: c.name, a: w.refs[0], b: w.refs[w.refs.length >> 1] });
        } else pb.skip();
      }
    }
    if (hasNodes) nodeBlocks++;
    progress(b.pos, 'leyendo');
  }

  // pasada 2: coordenadas de los nodos de las ways (esquina y punto medio → promedio)
  if (pending.length) {
    const need = new Map();
    pending.forEach((w) => { need.set(w.a, null); need.set(w.b, null); });
    let seen = 0;
    for (const b of blobs(fd, size)) {
      if (b.type !== 'OSMData') continue;
      const B = primitiveBlock(inflate(b.data));
      for (const g of B.groups) {
        const pb = new PB(g);
        while (pb.more()) {
          if (pb.tag() === 2) eachDenseNode(pb.bytes(), B, false, (id, lat, lon) => { if (need.has(id)) need.set(id, [lat, lon]); });
          else pb.skip();
        }
      }
      progress(b.pos, 'coordenadas');
      if (++seen >= nodeBlocks) break;
    }
    for (const w of pending) {
      const p = need.get(w.a), q = need.get(w.b);
      if (!p || !q) continue;
      items.push([w.id, +((p[0] + q[0]) / 2).toFixed(6), +((p[1] + q[1]) / 2).toFixed(6), w.kind, w.name]);
    }
  }
  fs.closeSync(fd);
  process.stdout.write('\n');
  return items;
}

(async () => {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
  const keep = args.includes('--keep'); if (keep) args.splice(args.indexOf('--keep'), 1);
  const nameArg = opt('--name');
  const src = args[0] || DEFAULT_URL;
  const name = nameArg || path.basename(src).replace(/(-latest)?\.osm\.pbf$/, '').replace(/[^a-z0-9_-]/gi, '') || 'region';
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let file = src, tmp = null;
  if (/^https?:\/\//.test(src)) {
    file = tmp = path.join(OUT_DIR, `.${name}.download.pbf`);
    console.log('Descargando', src);
    await download(src, file);
  }
  const t0 = Date.now();
  console.log('Procesando', file);
  const items = importFile(file);
  if (tmp && !keep) fs.rmSync(tmp);
  const out = path.join(OUT_DIR, name + '.json');
  fs.writeFileSync(out + '.tmp', JSON.stringify({ generated: new Date().toISOString(), source: src, items }));
  fs.renameSync(out + '.tmp', out);
  const n = (k) => items.filter((i) => i[3] === k).length;
  console.log(`✔ ${items.length} sitios en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
  console.log(`  bancos ${n('b')} · mesas ${n('p')} · fuentes ${n('f')} · tiendas ${n('s')}`);
  console.log('  Reinicia el servidor para cargarlo.');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
