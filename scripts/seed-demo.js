// Simula usuarios, amistades y reseñas sobre los sitios que has revisado como «existe».
//   node scripts/seed-demo.js                 # escribe en data/demo (no toca data/db.json)
//   node scripts/seed-demo.js --out data      # mezcla en la base real
//   node scripts/seed-demo.js --purge         # borra solo lo simulado (marcado seed:true)
// Ver en la app:  DATA_DIR=data/demo PORT=3001 node server.js   (usuarios «demo1234» de contraseña)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OUT = path.resolve(ROOT, arg('--out') || 'data/demo');
const SRC = path.join(ROOT, 'data');
const PASSWORD = 'demo1234';

fs.mkdirSync(path.join(OUT, 'uploads'), { recursive: true });
if (OUT !== SRC && !fs.existsSync(path.join(OUT, 'osm'))) fs.symlinkSync(path.join(SRC, 'osm'), path.join(OUT, 'osm'));

const DB_FILE = path.join(OUT, 'db.json');
let db = {};
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
for (const k of ['places', 'users', 'sessions', 'uploads']) db[k] ??= {};
for (const k of ['reviews', 'friends', 'reports']) db[k] ??= [];

// ---- borrar lo simulado antes (así el script se puede repetir) ----
const seedUsers = new Set(Object.values(db.users).filter((u) => u.seed).map((u) => u.id));
for (const [f, owner] of Object.entries(db.uploads)) if (seedUsers.has(owner)) { fs.rmSync(path.join(OUT, 'uploads', f), { force: true }); delete db.uploads[f]; }
db.reviews = db.reviews.filter((r) => !r.seed);
db.friends = db.friends.filter((f) => !seedUsers.has(f.from) && !seedUsers.has(f.to));
for (const id of seedUsers) delete db.users[id];
for (const id of Object.keys(db.places)) if (db.places[id].seed) delete db.places[id];
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));
if (process.argv.includes('--purge')) { save(); console.log('Simulación borrada de', OUT); process.exit(0); }

// ---- azar reproducible ----
let st = 20261029;
const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => a.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const DAY = 86400000, now = Date.now();

// ---- usuarios: cada uno con su barrio de Granada ----
const PEOPLE = [
  ['lucia_gr', 'Albaicín', 37.1815, -3.5915, 'Paseando por el Albaicín desde que nací 🌿', 1.6],
  ['paco.alhambra', 'Realejo', 37.1715, -3.5935, 'Jubilado, mis rodillas me piden bancos a cada paso', 1.3],
  ['marta88', 'Centro', 37.1765, -3.5985, '', 1.0],
  ['jesusmi', 'Zaidín', 37.1535, -3.5980, 'Corro por el Zaidín y por el Genil', 1.4],
  ['carmenp', 'Chana', 37.1945, -3.6065, 'Mamá de dos. Conozco todos los parques de la Chana', 1.5],
  ['alvaro_zaidin', 'Zaidín', 37.1560, -3.6020, '', 0.7],
  ['nuria.g', 'Genil', 37.1625, -3.5885, 'Fotos, café y paseos', 1.1],
  ['dani_ruiz', 'Beiro', 37.1900, -3.5990, '', 0.6],
  ['sandra_beiro', 'Beiro', 37.1880, -3.6010, 'Estudiante de Enfermería', 0.9],
  ['migue92', 'Camino de Ronda', 37.1650, -3.6130, 'Bici a diario', 1.2],
  ['anabelen', 'Cartuja', 37.1950, -3.5930, '', 0.5],
  ['rafa.granada', 'Centro', 37.1740, -3.6000, 'Taxista, sé dónde sentarse en cada barrio', 1.7],
  ['irene_m', 'Realejo', 37.1725, -3.5950, 'Siempre con el termo de café ☕', 1.0],
  ['joseluis_t', 'Almanjáyar', 37.2000, -3.6000, '', 0.6],
  ['elena.sol', 'Albaicín', 37.1830, -3.5930, 'Arquitecta. Me fijo en el mobiliario urbano, perdón.', 1.3],
  ['tomas_v', 'Zaidín', 37.1500, -3.5950, 'Paseo con mi perro Bruno', 0.8],
];
const users = PEOPLE.map(([username, hood, lat, lng, bio, act]) => {
  const salt = crypto.randomBytes(16).toString('hex'), id = now.toString(36) + crypto.randomBytes(4).toString('hex');
  const u = { id, username, salt, hash: crypto.scryptSync(PASSWORD, salt, 64).toString('hex'), bio, createdAt: now - (150 + rnd() * 250) * DAY, seed: true };
  db.users[id] = u;
  return { ...u, hood, lat, lng, act };
});

// ---- reseñas escritas a mano: [nota, texto] ----
const TEXTS = {
  bench: [
    [5, 'Sombra casi todo el día y muy tranquilo. Perfecto para leer un rato.'], [4, 'Bien situado, aunque el respaldo está un poco duro.'],
    [5, 'Mi sitio de siempre después de comer 😌'], [3, 'Cumple, pero pasa mucho tráfico justo al lado y se oye bastante.'],
    [2, 'El banco está pintarrajeado y un poco cojo. Se puede usar pero poco más.'], [4, 'Buen sitio para esperar a alguien. Ni mucho sol ni mucho ruido.'],
    [5, 'Con niños pequeños va genial, el parque queda justo enfrente.'], [1, 'Lleno de excrementos de paloma, ni me senté.'],
    [3, 'Normalito. Al mediodía da el sol de lleno y no se puede estar.'], [4, 'Madera en buen estado, parece que lo han renovado hace poco.'],
    [5, 'Tranquilidad total a primera hora, solo se oyen los pájaros.'], [4, 'Me gusta para tomar el café que me llevo de casa ☕'],
    [3, 'Está bien pero justo al lado hay un contenedor y en verano huele.'], [5, 'De los más cómodos de la zona, respaldo inclinado y reposabrazos.'],
    [2, 'Da la cara al sol de tarde, imposible sentarse en verano.'], [4, 'Sitio discreto, la gente pasa y no te molesta.'],
    [5, 'Ideal para ver atardecer. Llega con tiempo que se llena.'], [3, 'Sin más. Es un banco.'],
    [4, 'Cerca de la parada del bus, muy práctico para esperar.'], [2, 'Roto el listón del asiento, ojo con los pantalones.'],
    [5, 'Nos sentamos aquí cada domingo con el abuelo. Casi siempre libre.'], [4, 'Bastante limpio y con papelera cerca, se agradece.'],
    [3, 'Mucho paso de bicis, vas con un ojo en el móvil y otro en la calle 😅'], [5, 'Rincón tranquilo, casi nadie lo conoce.'],
    [1, 'Pegajoso y con chicles. Pasad de largo.'], [4, 'Buena sombra de los árboles en verano, y sol de mañana en invierno.'],
    [3, 'Algo escondido, pero se está bien una vez sentado.'], [5, 'Perfecto para parar tras la cuesta, justo cuando más lo necesitas.'],
    [4, 'Hay farola al lado, de noche se ve bien.'], [2, 'Demasiado cerca de la terraza de un bar, ruido a todas horas.'],
  ],
  fountain: [
    [5, 'Agua fresquísima, ideal tras salir a correr.'], [4, 'Funciona bien, el chorro es un poco flojo.'], [3, 'En verano el agua sale templada, pero se agradece.'],
    [2, 'El pulsador va duro y salpica por todas partes.'], [5, 'Siempre rellenamos aquí la botella antes de la ruta 💧'], [1, 'Estaba seca la última vez que pasé.'],
    [4, 'Tiene pilón para perros al lado, detalle.'], [5, 'Perfecta, con grifo y todo. Fría incluso en agosto.'], [3, 'A veces hay cola los fines de semana.'],
    [4, 'Agua potable y sabe bien, la he probado muchas veces.'], [2, 'Hay barro alrededor y no hay dónde apoyar la botella.'],
    [5, 'Muy bien mantenida, se nota que la limpian.'], [3, 'Funciona, pero el botón a veces se queda atascado.'], [4, 'Justo a mitad de la cuesta, salvavidas.'],
    [2, 'Poca presión, tarda un mundo en llenar una botella.'], [5, 'La mejor del barrio, no hay duda.'], [4, 'Con niños es un éxito, les encanta darle al botón.'],
    [3, 'Sale con algo de cal pero bebible.'], [1, 'Estropeada desde hace meses. ¡Que la arreglen!'], [4, 'Ideal para ciclistas, encaja perfecto el bidón.'],
    [5, 'Fresca y limpia, no falla.'], [3, 'Ok. Se agradece que haya una en esta zona.'],
  ],
  shop: [
    [4, '{n}: buen surtido y fruta fresca. La cola de la caja a las 14h es larga.'], [3, 'Lo típico. Cumple para la compra de diario.'],
    [5, 'Personal muy amable y siempre tienen pan recién hecho.'], [2, 'Pasillos estrechos y muy lleno de cajas, cuesta moverse.'],
    [4, 'Abre hasta tarde, me ha sacado de un apuro más de una vez.'], [3, 'Algo más caro que el de la otra calle pero me queda más a mano.'],
    [5, 'Buenísima la sección de panadería 🥖'], [1, 'Cola eterna y una sola caja abierta. No vuelvo.'], [4, 'Limpio y ordenado, hay de todo para el día a día.'],
    [3, 'La fruta va por días, hay que mirarla bien.'], [5, 'Me encanta que tengan producto local, muy bien.'],
    [4, 'Cerca de casa, aparcar es complicado pero merece la pena.'], [2, 'Poca luz en algunos pasillos y las cámaras hacen mucho ruido.'],
    [4, 'Buena relación calidad-precio. Las ofertas del folleto sí están en tienda.'], [3, 'Normal. Nada destacable.'],
    [5, 'La cajera ya me conoce y me ayuda con las bolsas 😂'], [4, 'Tienen autocobro, así que me despacho rápido.'],
    [2, 'Se les agota el pan antes de las 11.'], [3, 'Para compras grandes mejor otro, para el día a día va bien.'],
  ],
  picnic: [
    [5, 'Mesa robusta y con sombra, la usamos para el cumple de mi hijo.'], [4, 'Buen sitio para comer, pero hay que llegar pronto un domingo.'],
    [3, 'Está un poco desgastada pero se puede usar.'], [5, 'Ideal para el picnic con amigos, hay hasta papelera.'], [2, 'Los bancos están flojos, tiene pinta de que se va a caer.'],
  ],
};
const EXTRA = ['Volveré.', 'Recomendable.', 'Mejor ir por la mañana.', 'Gracias a quien lo puso 🙏', 'Lo recomiendo.', 'Buen plan para un día tranquilo.'];
const bag = {}; // sin repetir texto hasta agotar el repertorio
function pickText(type, around, name) {
  if (!bag[type]?.length) bag[type] = shuffle(TEXTS[type]);
  let i = around ? bag[type].findIndex(([r]) => Math.abs(r - around) <= 1) : 0;
  if (i < 0 || (around && rnd() > 0.65)) i = 0;
  const [rating, text] = bag[type].splice(i, 1)[0];
  let t = text.replace('{n}', name || 'La tienda');
  if (rnd() < 0.2) t += ' ' + pick(EXTRA);
  if (rnd() < 0.12) t = t[0].toLowerCase() + t.slice(1).replace(/\.$/, '');
  return { rating, text: t };
}

// ---- sitios con veredicto «existe» ----
const TYPE = { b: 'bench', f: 'fountain', s: 'shop', p: 'picnic' };
const verdicts = JSON.parse(fs.readFileSync(path.join(SRC, 'review', 'verdicts.json'), 'utf8'));
const osm = new Map(JSON.parse(fs.readFileSync(path.join(SRC, 'osm', 'spain.json'), 'utf8')).items.map((i) => [i[0], i]));
const km = (a, b, c, d) => Math.hypot((c - a) * 111.3, (d - b) * 111.3 * Math.cos(a * Math.PI / 180));

let nPlaces = 0, nReviews = 0, nPhotos = 0;
for (const [id, v] of Object.entries(verdicts)) {
  const it = osm.get(id);
  if (v.verdict !== 'exists' || !it) continue;
  const [, lat, lng, kind, name] = it, type = TYPE[kind];
  const crop = v.crop && fs.existsSync(path.join(SRC, 'review', 'crops', v.crop)) ? v.crop : null;
  const n = crop ? pick([1, 1, 2, 2, 3]) : pick([0, 0, 1, 1, 2]);
  // quienes lo reseñan: vecinos (distancia al barrio, con algo de azar y más peso a los activos)
  const who = users.map((u) => [(km(lat, lng, u.lat, u.lng) + rnd() * 2) / u.act, u]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
  const placeCreated = now - (160 + rnd() * 80) * DAY;
  db.places[id] = { id, lat, lng, name: name || '', type, createdAt: placeCreated, seed: true };
  nPlaces++;
  let first = 0;
  who.forEach((u, i) => {
    const { rating, text } = pickText(type, first, name);
    first ||= rating;
    const photos = [];
    if (i === 0 && crop) {
      const f = crypto.randomBytes(12).toString('hex') + '.jpg';
      fs.copyFileSync(path.join(SRC, 'review', 'crops', crop), path.join(OUT, 'uploads', f));
      db.uploads[f] = u.id; photos.push(f); nPhotos++;
    }
    const start = Math.max(u.createdAt, now - 240 * DAY);
    db.reviews.push({
      id: (now - i).toString(36) + crypto.randomBytes(4).toString('hex'), placeId: id, userId: u.id, rating, text, photos,
      createdAt: Math.round(start + rnd() * (now - start - DAY)), seed: true,
    });
    nReviews++;
  });
}
db.reviews.sort((a, b) => a.createdAt - b.createdAt);

// ---- amistades: casi todos con 2-4 amigos, algunas solicitudes pendientes ----
const seen = new Set();
users.forEach((u) => {
  const near = users.filter((o) => o !== u).map((o) => [km(u.lat, u.lng, o.lat, o.lng) + rnd() * 3, o]).sort((a, b) => a[0] - b[0]);
  for (const [, o] of near.slice(0, 2 + Math.floor(rnd() * 3))) {
    const key = [u.id, o.id].sort().join('|');
    if (seen.has(key)) continue; seen.add(key);
    db.friends.push({ from: u.id, to: o.id, status: rnd() < 0.88 ? 'accepted' : 'pending', createdAt: Math.round(now - rnd() * 150 * DAY) });
  }
});

save();
console.log(`Simulado en ${OUT}: ${users.length} usuarios, ${nPlaces} sitios, ${nReviews} reseñas (${nPhotos} con foto), ${seen.size} amistades`);
