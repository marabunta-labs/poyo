// Genera SQL con datos de ejemplo: cuentas demo (is_seed = true, sin acceso: baneadas y sin contraseña) y reseñas en unos
// cientos de sitios repartidos por toda España. El resto de sitios del volcado de OSM sigue existiendo, sin reseñas.
//   node scripts/seed-demo.js <carpeta-de-salida>        → 01-users, 02-profiles, 03-places, 04-reviews (datos), 05-groups, 06-members, 07-checkins, 08-control (juego de bases)
// No toca ninguna base de datos: revisa los .sql y ejecútalos como propietario (marabunta-db/scripts/sbsql.sh). Es repetible
// (on conflict do nothing) y determinista. Para quitarlo todo: scripts/seed-demo.js --remove imprime el SQL de borrado.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { CRITERIA } = require('../criteria');

if (process.argv[2] === '--remove') {
  console.log(`-- Borra todo lo demo: cuentas (y por cascada perfiles y reseñas) y los sitios que se quedaron sin ninguna reseña.
delete from auth.users where raw_user_meta_data->>'seed' = 'poyo';
delete from poyo.groups g where not exists (select 1 from poyo.group_members m where m.group_id = g.id);
delete from poyo.places p where p.id like 'osm-%' and not exists (select 1 from poyo.reviews r where r.place_id = p.id);`);
  process.exit(0);
}
const OUT = process.argv[2] || (console.error('Uso: node scripts/seed-demo.js <carpeta-de-salida>'), process.exit(1));
fs.mkdirSync(OUT, { recursive: true });

// ---- datos de entrada y azar repetible ----
const dumpPath = path.join(__dirname, '..', 'data', 'osm', fs.existsSync(path.join(__dirname, '..', 'data', 'osm', 'spain.json')) ? 'spain.json' : 'spain.json.gz');
const raw = fs.readFileSync(dumpPath);
const { items } = JSON.parse((dumpPath.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
let seed = 20261112;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const weighted = (ws) => { let r = rnd() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) if ((r -= ws[i]) < 0) return i; return ws.length - 1; };
const uuid = (s) => { const h = crypto.createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---- sitios: una malla de ~0,2° (≈20 km); 1 sitio por celda y hasta 4 en las celdas con muchísimos (ciudades) ----
const TYPE = { b: 'bench', p: 'picnic', f: 'fountain', s: 'shop' };
const cells = new Map();
for (const it of items) { const k = Math.floor(it[1] / 0.2) + ',' + Math.floor(it[2] / 0.2); (cells.get(k) || cells.set(k, []).get(k)).push(it); }
const chosen = [];
for (const list of cells.values()) {
  const n = list.length > 400 ? 4 : list.length > 100 ? 2 : 1;
  const bag = list.slice().sort(() => rnd() - 0.5);
  for (const it of bag.slice(0, n)) chosen.push(it);
}
chosen.sort(() => rnd() - 0.5);
const places = chosen.slice(0, 900);

// ---- cuentas demo: 3 por región (cuadrícula de 1,5°) que tenga sitios elegidos; cada una solo reseña en su región ----
const NAMES = ['Lucia', 'Pablo', 'Marta', 'Diego', 'Carmen', 'Javi', 'Elena', 'Sergio', 'Nuria', 'Andres', 'Paula', 'Hugo', 'Irene', 'Ruben', 'Alba', 'Mario', 'Rocio', 'Oscar', 'Sara', 'Dani', 'Noelia', 'Iker', 'Laura', 'Adri', 'Ines', 'Gonzalo', 'Marina', 'Cristian', 'Ana', 'Raul'];
const TAGS = ['_paseos', '.banquito', '_y_sol', '88', '_sombra', '_urbana', '_tranqui', '92', '.bcn', '_vistas', '_picnic', '77', '_peatonal', '_siesta', '95'];
const BIOS = ['Siempre con un libro y buscando banco con sombra.', 'Paseo al perro a diario y me conozco los bancos del barrio.', 'Cafe en mano, vistas y tranquilidad.', 'Aficionada a sentarse a mirar la gente pasar.',
  'Corredor: las fuentes buenas son mi mapa.', 'Me gustan los bancos con buenas vistas al atardecer.', 'Jubilado con mucho tiempo para probar bancos.', 'Cuando hay sol, a leer en un banco.', '', 'Mapeando sitios para sentarse por mi ciudad.'];
const region = (lat, lng) => Math.round(lat / 1.5) + ',' + Math.round(lng / 1.5);
const regions = [...new Set(places.map((p) => region(p[1], p[2])))];
const usersByRegion = new Map(), users = [];
const used = new Set();
for (const r of regions) {
  const list = [];
  for (let i = 0; i < 3; i++) {
    let name; do { name = pick(NAMES) + pick(TAGS); } while (used.has(name.toLowerCase()) || name.length > 20);
    used.add(name.toLowerCase());
    const u = { id: uuid('poyo-seed-user-' + users.length), name, bio: pick(BIOS), n: users.length };
    users.push(u); list.push(u);
  }
  usersByRegion.set(r, list);
}

// ---- reseñas ----
const TEXT = { // por tipo y tono (bajo / medio / alto)
  bench: [['Está bastante deteriorado y casi no da sombra.', 'Incómodo y con ruido de tráfico; he visto mejores.', 'Cumple, pero el respaldo está roto.'],
    ['Normalito: sirve para un descanso corto.', 'Un banco más, sin vistas pero tranquilo.', 'Ni fu ni fa, aunque hay sombra a ratos.'],
    ['Muy buen sitio para descansar, con sombra y tranquilidad.', 'Vistas estupendas al atardecer, lo recomiendo.', 'Cómodo, limpio y bien situado. Repetiré.', 'Ideal para leer un rato, casi nunca hay gente.']],
  picnic: [['Mesa sucia y coja, poco recomendable.', 'Poco espacio y muy expuesta al sol.'], ['Sirve para una comida rápida, nada más.', 'Está bien, pero faltan papeleras.'],
    ['Perfecta para comer en grupo, con sombra y espacio.', 'Muy cuidada y limpia, buen plan de domingo.', 'Mesa amplia y tranquila, ideal con niños.']],
  fountain: [['No sale casi agua y está sucia.', 'Poco caudal, tardas un rato en llenar la botella.'], ['Funciona, aunque el agua sale templada.', 'Bien para beber algo, pero sin sitio para mascotas.'],
    ['Agua fresquita y buen caudal, de lo mejor de la zona.', 'Muy limpia y con cuenco para perros.', 'Imprescindible en la ruta, siempre funciona.']],
  shop: [['Precios altos y poco surtido.', 'Atención regular y colas a todas horas.'], ['Lo básico, con horario correcto.', 'Normal: abierto hasta tarde pero poca variedad.'],
    ['Buen surtido y precios razonables, atienden genial.', 'Abierto hasta tarde y muy bien surtido.', 'Trato excelente y producto fresco.']],
};
const SOON = Date.now(), DAY = 864e5;
const placeRows = [], reviewRows = [];
for (const p of places) {
  const type = TYPE[p[3]], r = region(p[1], p[2]);
  placeRows.push(`(${lit(p[0])}, ${p[1]}, ${p[2]}, ${lit((p[4] || '').slice(0, 80))}, '${type}')`);
  const pool = usersByRegion.get(r).slice().sort(() => rnd() - 0.5);
  const count = Math.min(pool.length, 1 + weighted([45, 30, 25]));
  for (const u of pool.slice(0, count)) {
    const rating = 1 + weighted([4, 8, 20, 38, 30]);
    const ratings = {};
    for (const k of CRITERIA[type]) if (rnd() < 0.6) ratings[k] = Math.max(1, Math.min(5, rating + Math.round(rnd() * 2 - 1)));
    const tone = rating <= 2 ? 0 : rating === 3 ? 1 : 2;
    const text = rnd() < 0.8 ? pick(TEXT[type][tone]) : '';
    const at = new Date(SOON - Math.floor(rnd() * 150 * DAY)).toISOString();
    reviewRows.push(`(${lit(p[0])}, ${lit(u.id)}, ${rating}, ${lit(JSON.stringify(ratings))}::jsonb, ${lit(text)}, ${lit(at)})`);
  }
}

// ---- juego de bases: un grupo por región (sus 3 cuentas), visitas en los últimos 14 días y quién manda en cada banco ----
const GROUP_NAMES = ['Los Bancales', 'Sol y Sombra', 'Banda del Respaldo', 'Los Sentados', 'Tarde de Banco', 'Reyes del Paseo', 'La Peña del Parque', 'Siesta Club', 'Los Cuatro Bancos', 'Brisa Urbana',
  'Las Fuentes Claras', 'Atardecer FC', 'Los Madrugadores', 'Equipo Tranqui', 'Descansos Unidos', 'Respaldo Real', 'Los del Mirador', 'Banco y Pipas', 'Los Paseantes', 'Sombra Fiel',
  'La Tertulia', 'Los Jubilados Pro', 'Parque Central', 'Los Pícnic', 'Sentada Total', 'Club del Banco', 'Vistas al Río', 'Brigada Verde', 'Los Descansillos', 'Tardes de Sol',
  'Los Vermuteros', 'Banco Corrido', 'Ruta del Descanso', 'Los Pacientes', 'Colectivo Banquito', 'Alameda Crew', 'Los de la Plaza', 'Mesa y Mantel', 'Los Atardeceres', 'Peña Pájaro',
  'Los Tranquilos', 'Gran Sentada', 'Los del Paseo Marítimo'];
const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a5', '#f032e6', '#8a9a00', '#9a6324', '#800000', '#008080', '#000075', '#e67e22', '#c0392b', '#16a085'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const groups = [], groupByRegion = new Map(), usedNames = new Set(), usedCodes = new Set();
regions.forEach((r, i) => {
  let name; do { name = pick(GROUP_NAMES); if (usedNames.has(name)) name += ' ' + (i + 1); } while (usedNames.has(name));
  usedNames.add(name);
  let code; do { code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rnd() * CODE_CHARS.length)]).join(''); } while (usedCodes.has(code));
  usedCodes.add(code);
  const g = { id: uuid('poyo-seed-group-' + i), name, color: PALETTE[i % PALETTE.length], code, members: usersByRegion.get(r), region: r };
  groups.push(g); groupByRegion.set(r, g);
});
const neighbours = (r) => { const [a, b] = r.split(',').map(Number); return [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]].map(([x, y]) => groupByRegion.get(x + ',' + y)).filter(Boolean); };
const madridDay = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const checkinRows = [], controlRows = [], usedDay = new Set();
for (const p of places) {
  if (!['b', 'p'].includes(p[3])) continue; // solo bancos y mesas de pícnic se pueden reclamar
  const r = region(p[1], p[2]), own = groupByRegion.get(r), rivals = neighbours(r);
  const active = [own, ...(rnd() < 0.3 && rivals.length ? [pick(rivals)] : [])];
  const scores = new Map();
  active.forEach((g, idx) => {
    const n = idx === 0 ? 1 + weighted([30, 25, 20, 15, 10]) : 1 + weighted([55, 30, 15]); // el grupo de la zona va más; el visitante, menos
    for (let k = 0; k < n; k++) {
      const u = pick(g.members), at = SOON - rnd() * 13.5 * DAY, day = madridDay(at), key = p[0] + u.id + day;
      if (usedDay.has(key)) continue;
      usedDay.add(key);
      const points = 1 + weighted([60, 30, 10]);
      checkinRows.push(`(${lit(p[0])}, ${lit(u.id)}, ${lit(g.id)}, ${(p[1] + (rnd() - 0.5) * 0.0004).toFixed(6)}, ${(p[2] + (rnd() - 0.5) * 0.0004).toFixed(6)}, ${Math.round(5 + rnd() * 15)}, ${points}, '${day}', ${lit(new Date(at).toISOString())})`);
      const s = scores.get(g.id) || { g, score: 0, first: at };
      s.score += points * Math.pow(0.5, (SOON - at) / DAY / 5); s.first = Math.min(s.first, at);
      scores.set(g.id, s);
    }
  });
  const top = [...scores.values()].sort((a, b) => b.score - a.score)[0];
  if (top) controlRows.push(`(${lit(p[0])}, ${lit(top.g.id)}, ${lit(new Date(top.first).toISOString())})`);
}

// ---- salida ----
const chunks = (rows, n) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, (i + 1) * n));
const w = (f, s) => fs.writeFileSync(path.join(OUT, f), s + '\n');
w('01-users.sql', `-- Cuentas demo en la cuenta común: baneadas (no pueden entrar) y marcadas en raw_user_meta_data.seed = 'poyo'.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, banned_until, created_at, updated_at, is_sso_user, is_anonymous) values
${users.map((u) => `(${lit(u.id)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-${u.n}@poyo.invalid', now(), '{"provider":"email","providers":["email"]}', '{"seed":"poyo"}', '2099-01-01', now(), now(), false, false)`).join(',\n')}
on conflict (id) do nothing;`);
w('02-profiles.sql', `insert into poyo.profiles (id, username, bio, is_seed) values
${users.map((u) => `(${lit(u.id)}, ${lit(u.name)}, ${lit(u.bio)}, true)`).join(',\n')}
on conflict do nothing;`);
chunks(placeRows, 300).forEach((c, i) => w(`03-places-${i + 1}.sql`, `insert into poyo.places (id, lat, lng, name, type) values\n${c.join(',\n')}\non conflict do nothing;`));
chunks(reviewRows, 250).forEach((c, i) => w(`04-reviews-${i + 1}.sql`, `insert into poyo.reviews (place_id, user_id, rating, ratings, text, created_at) values\n${c.join(',\n')}\non conflict do nothing;`));
w('05-groups.sql', `insert into poyo.groups (id, name, color, code, created_by) values
${groups.map((g) => `(${lit(g.id)}, ${lit(g.name)}, ${lit(g.color)}, ${lit(g.code)}, ${lit(g.members[0].id)})`).join(',\n')}
on conflict do nothing;`);
w('06-members.sql', `insert into poyo.group_members (group_id, user_id) values
${groups.flatMap((g) => g.members.map((u) => `(${lit(g.id)}, ${lit(u.id)})`)).join(',\n')}
on conflict do nothing;`);
chunks(checkinRows, 300).forEach((c, i) => w(`07-checkins-${i + 1}.sql`, `insert into poyo.checkins (place_id, user_id, group_id, lat, lng, accuracy, points, day, at) values\n${c.join(',\n')}\non conflict do nothing;`));
w('08-control.sql', `insert into poyo.place_control (place_id, group_id, since) values\n${controlRows.join(',\n')}\non conflict do nothing;`);
console.log(`${groups.length} grupos, ${checkinRows.length} check-ins y ${controlRows.length} bancos con dueño`);
console.log(`${users.length} cuentas demo en ${regions.length} regiones, ${places.length} sitios con reseñas (de ${items.length} en el volcado), ${reviewRows.length} reseñas → ${OUT}`);
