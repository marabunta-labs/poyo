// Prueba la API de Poyo contra un Postgres real con el esquema poyo (ver ../marabunta-db/test/run_local.sh) y un
// servicio de cuentas simulado. Uso: DATABASE_URL=postgres://poyo_app:...@127.0.0.1:54329/postgres node --test test/
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

const DB = process.env.DATABASE_URL;
const ADMIN_DB = process.env.ADMIN_DATABASE_URL; // para sembrar usuarios de auth (solo pruebas)
let auth, srv, base, admin;
const users = {}; // nombre -> { id, token }

const call = async (method, path, body, who) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(who && { Authorization: 'Bearer ' + users[who].token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

before(async () => {
  admin = new Pool({ connectionString: ADMIN_DB });
  await admin.query("delete from auth.users where email like '%@test.local'"); // por si una ejecución anterior se interrumpió
  await admin.query('truncate poyo.profiles cascade; truncate poyo.places cascade; truncate poyo.photo_trash');
  for (const n of ['ana', 'beto', 'cris', 'root']) {
    const { rows } = await admin.query(`insert into auth.users (id, email, instance_id) values (gen_random_uuid(), $1, '00000000-0000-0000-0000-000000000000') returning id`, [n + '@test.local']);
    users[n] = { id: rows[0].id, token: 'tok-' + n };
  }
  auth = http.createServer((req, res) => {
    const who = Object.values(users).find((u) => 'Bearer ' + u.token === req.headers.authorization);
    res.writeHead(who ? 200 : 401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(who ? { id: who.id } : { error: 'bad' }));
  }).listen(54401);
  srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: 3103, DATABASE_URL: DB, SUPABASE_URL: 'http://127.0.0.1:54401', SUPABASE_ANON_KEY: 'anon', ADMINS: 'root', RATE_LIMIT: 1000, DATA_DIR: '/private/tmp/claude-502/poyo-test-data' } });
  base = 'http://127.0.0.1:3103';
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/config'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(async () => { srv.kill(); auth.close(); await admin.query("delete from auth.users where email like '%@test.local'"); await admin.end(); });

test('config pública y sesión', async () => {
  const c = await call('GET', '/config'); assert.equal(c.body.supabaseAnonKey, 'anon'); assert.equal(c.body.bucket, 'poyo-photos');
  assert.equal((await call('GET', '/me')).body, null);
  assert.deepEqual((await call('GET', '/me', null, 'ana')).body, { needsProfile: true });
  assert.equal((await call('POST', '/places/osm-1/reviews', { rating: 5 }, 'ana')).status, 401); // sin perfil no se puede
});

test('crear perfiles: validación y nombres únicos', async () => {
  assert.equal((await call('POST', '/me/profile', { username: 'a' }, 'ana')).status, 400);
  const ok = await call('POST', '/me/profile', { username: 'Ana.G' }, 'ana'); assert.equal(ok.status, 201); assert.equal(ok.body.username, 'Ana.G');
  assert.equal((await call('POST', '/me/profile', { username: 'otro' }, 'ana')).status, 409);
  assert.equal((await call('POST', '/me/profile', { username: 'ana.g' }, 'beto')).status, 409); // sin distinguir mayúsculas
  for (const n of ['beto', 'cris', 'root']) assert.equal((await call('POST', '/me/profile', { username: n }, n)).status, 201);
  assert.equal((await call('GET', '/me', null, 'root')).body.isAdmin, true);
  assert.equal((await call('GET', '/me', null, 'ana')).body.isAdmin, false);
});

test('reseñas: crear, editar, validar fotos, estadísticas', async () => {
  const place = { lat: 37.17, lng: -3.6, name: 'Banco del Genil', type: 'bench' };
  const bad = await call('POST', '/places/osm-777/reviews', { rating: 9, place }, 'ana'); assert.equal(bad.status, 400);
  const mine = users.ana.id + '/0b1c2d3e-0000-4000-8000-000000000001.jpg'.replace(/^/, '');
  const photo = users.ana.id + '/abcdef123456.jpg', foreign = users.beto.id + '/abcdef123456.jpg';
  let r = await call('POST', '/places/osm-777/reviews', { rating: 4, text: 'Buena sombra', photos: [photo, foreign, '../x.jpg'], place }, 'ana');
  assert.equal(r.status, 201); assert.equal(r.body.count, 1); assert.equal(r.body.avg, 4); assert.deepEqual(r.body.photos, [photo]); // solo la foto propia y válida
  r = await call('POST', '/places/osm-777/reviews', { rating: 2, text: 'Ya no tanto', place }, 'ana'); // editar: misma reseña, conserva fotos
  assert.equal(r.body.count, 1); assert.equal(r.body.avg, 2); assert.deepEqual(r.body.photos, [photo]);
  await call('POST', '/places/osm-777/reviews', { rating: 5, place }, 'beto');
  const d = await call('GET', '/places/osm-777', null, 'ana'); assert.equal(d.body.count, 2); assert.equal(d.body.avg, 3.5);
  assert.ok(!('_uid' in d.body.reviews[0]) && d.body.reviews[0].author && 'avatar' in d.body.reviews[0]);
  assert.equal((await call('GET', '/places')).body.length, 1);
});

test('reseñas: categorías por tipo (solo las válidas, 1-5)', async () => {
  const place = { lat: 37.17, lng: -3.6, name: 'Banco del Genil', type: 'bench' };
  const r = await call('POST', '/places/osm-778/reviews', { rating: 4, ratings: { calm: 5, views: 9, price: 3, comfort: '4' }, place }, 'cris');
  assert.equal(r.status, 201);
  const mine = (await call('GET', '/places/osm-778', null, 'cris')).body.reviews.find((x) => x.author === 'cris');
  assert.deepEqual(mine.ratings, { calm: 5, comfort: 4 }); // 'views' fuera de rango y 'price' no es de bancos
  const none = await call('POST', '/places/osm-778/reviews', { rating: 3, place }, 'cris'); // sin categorías: se vacían
  assert.equal(none.status, 201);
  assert.deepEqual((await call('GET', '/places/osm-778', null, 'cris')).body.reviews.find((x) => x.author === 'cris').ratings, {});
});

test('cuentas demo: la API las marca con isSeed', async () => {
  await admin.query("update poyo.profiles set is_seed = true where username = 'cris'");
  assert.equal((await call('GET', '/users/cris')).body.isSeed, true);
  assert.equal((await call('GET', '/users/beto')).body.isSeed, false);
  assert.equal((await call('GET', '/places/osm-778')).body.reviews.find((r) => r.author === 'cris').isSeed, true);
  await admin.query("update poyo.profiles set is_seed = false where username = 'cris'");
});

test('juego de bases: grupos, check-in, control y antitrampas', async () => {
  const place = { lat: 37.17, lng: -3.6, name: 'Banco del juego', type: 'bench' };
  const at = (dlat = 0, acc = 5) => ({ lat: 37.17 + dlat, lng: -3.6, accuracy: acc, place });
  assert.equal((await call('POST', '/places/osm-900/checkin', at(), 'ana')).status, 403); // sin grupo
  const g = await call('POST', '/groups', { name: 'Los Bancos', color: '#aa3300' }, 'ana'); assert.equal(g.status, 201);
  assert.match(g.body.code, /^[A-Z0-9]{6}$/);
  assert.equal((await call('POST', '/groups', { name: 'Otro' }, 'ana')).status, 409); // ya está en uno
  assert.equal((await call('POST', '/groups', { name: 'los bancos' }, 'cris')).status, 409); // nombre repetido sin mirar mayúsculas
  assert.equal((await call('POST', '/groups/join', { code: 'ZZZZZZ' }, 'beto')).status, 404);
  assert.equal((await call('POST', '/groups/join', { code: g.body.code.toLowerCase() }, 'beto')).body.members.length, 2);
  assert.equal((await call('POST', '/groups', { name: 'Rivales' }, 'cris')).status, 201);

  assert.equal((await call('POST', '/places/osm-900/checkin', at(0.001), 'ana')).status, 400); // a ~110 m
  assert.equal((await call('POST', '/places/osm-900/checkin', at(0, 50), 'ana')).status, 400); // GPS impreciso
  const c1 = await call('POST', '/places/osm-900/checkin', at(), 'ana');
  assert.equal(c1.status, 201); assert.equal(c1.body.points, 1); assert.equal(c1.body.control.group.name, 'Los Bancos');
  assert.equal((await call('POST', '/places/osm-900/checkin', at(), 'ana')).status, 409); // una vez al día
  const c2 = await call('POST', '/places/osm-900/checkin', at(), 'beto');
  assert.equal(c2.body.points, 2); assert.equal(c2.body.meet, 1); // encuentro: compañera en la última hora
  assert.equal((await call('GET', '/places')).body.find((p) => p.id === 'osm-900').baseColor, '#aa3300');

  // los rivales mandan solo si superan en un 20 %: primero poco, luego mucho
  const cris = (await call('GET', '/groups/mine', null, 'cris')).body;
  await admin.query(`insert into poyo.checkins (place_id, user_id, group_id, lat, lng, points, day) values ('osm-900', $1, $2, 37.17, -3.6, 1, current_date - 3)`, [users.cris.id, cris.id]);
  assert.equal((await call('POST', '/places/osm-900/checkin', at(), 'cris')).body.control.group.name, 'Los Bancos'); // 2 puntos de Cris < 1,2 × 3
  await admin.query(`insert into poyo.checkins (place_id, user_id, group_id, lat, lng, points, day) values ('osm-900', $1, $2, 37.17, -3.6, 9, current_date - 1)`, [users.cris.id, cris.id]);
  await admin.query(`update poyo.checkins set at = now() - interval '1 hour 5 minutes' where day = current_date - 1`);
  const d = await call('GET', '/places/osm-900', null, 'ana'); assert.equal(d.body.control.group.name, 'Los Bancos'); // aún no se ha evaluado
  await admin.query(`delete from poyo.checkins where user_id = $1 and day = current_date`, [users.cris.id]); // Cris repite su check-in de hoy
  assert.equal((await call('POST', '/places/osm-900/checkin', at(), 'cris')).body.control.group.name, 'Rivales');

  // velocidad imposible: otro banco a ~111 km segundos después
  const far = { lat: 38.17, lng: -3.6, accuracy: 5, place: { lat: 38.17, lng: -3.6, name: 'Lejos', type: 'bench' } };
  assert.equal((await call('POST', '/places/osm-901/checkin', far, 'ana')).status, 400);
  // solo bancos y mesas
  const fuente = { lat: 37.17, lng: -3.6, accuracy: 5, place: { lat: 37.17, lng: -3.6, name: 'Fuente', type: 'fountain' } };
  assert.equal((await call('POST', '/places/osm-902/checkin', fuente, 'ana')).status, 400);

  const rk = (await call('GET', '/game/ranking')).body;
  assert.ok(rk.groups.length === 2 && rk.groups[0].score >= rk.groups[1].score && rk.users[0].points >= 1);
  assert.equal((await call('POST', '/groups/leave', null, 'beto')).status, 200);
  assert.equal((await call('POST', '/groups/leave', null, 'ana')).status, 200);
  assert.equal((await call('GET', '/groups/mine', null, 'ana')).body, null);
});

test('juego: ranking por zona, bases en peligro e insignias', async () => {
  await call('POST', '/groups/leave', null, 'cris'); // Cris sigue en «Rivales» del test anterior
  const place = { lat: 37.3, lng: -3.7, name: 'Banco zona', type: 'bench' };
  const ck = { lat: 37.3, lng: -3.7, accuracy: 5, place };
  assert.equal((await call('POST', '/groups', { name: 'Zona' }, 'ana')).status, 201);
  const rival = (await call('POST', '/groups', { name: 'Rival Zona' }, 'cris')).body;
  assert.equal((await call('POST', '/places/osm-910/checkin', ck, 'ana')).status, 201);
  await admin.query(`insert into poyo.checkins (place_id, user_id, group_id, lat, lng, points, day, at) values ('osm-910', $1, $2, 37.3, -3.7, 9, current_date - 2, now() - interval '2 days')`, [users.cris.id, rival.id]);
  const mine = (await call('GET', '/groups/mine', null, 'ana')).body;
  assert.equal(mine.atRisk, 1); assert.equal(mine.bases[0].danger, true); assert.ok(mine.bases[0].rival > mine.bases[0].score);
  const inZone = (await call('GET', '/game/ranking?s=37.2&w=-3.8&n=37.4&e=-3.6')).body;
  assert.deepEqual(inZone.groups.map((g) => g.name).sort(), ['Rival Zona', 'Zona']);
  const far = (await call('GET', '/game/ranking?s=0&w=0&n=1&e=1')).body;
  assert.deepEqual([far.groups.length, far.users.length], [0, 0]);
  assert.deepEqual((await call('GET', '/users/Ana.G')).body.badges, []);
  await admin.query(`insert into poyo.checkins (place_id, user_id, group_id, lat, lng, points, day, at)
    select 'osm-910', $1, $2, 37.3, -3.7, 1, current_date - n, (current_date - n + time '07:30') at time zone 'Europe/Madrid' from generate_series(1, 5) n`, [users.ana.id, mine.id]);
  assert.deepEqual((await call('GET', '/users/Ana.G')).body.badges, ['early']);
  await call('POST', '/groups/leave', null, 'ana'); await call('POST', '/groups/leave', null, 'cris');
});

test('revisión de sitios: pendiente, confirmar, duplicados, reclamar con foto y «ya no existe»', async () => {
  for (const n of ['ana', 'beto', 'cris']) await call('POST', '/groups/leave', null, n);
  const mk = (type, lat, lng, extra = {}) => ({ lat, lng, name: 'Nuevo ' + type, type, ...extra });
  // un sitio nuevo queda pendiente; el que lo crea no puede confirmarlo y otra persona sí, pero estando ahí
  const w = await call('POST', '/places', mk('wall', 37.4, -3.8), 'beto'); assert.equal(w.status, 201); assert.equal(w.body.status, 'pending');
  const wid = w.body.id;
  assert.equal((await call('GET', '/places/' + wid, null, 'beto')).body.canConfirm, false);
  assert.equal((await call('GET', '/places/' + wid, null, 'ana')).body.canConfirm, true);
  assert.equal((await call('POST', `/places/${wid}/confirm`, { lat: 37.4, lng: -3.8, accuracy: 5 }, 'beto')).status, 403);
  assert.equal((await call('POST', `/places/${wid}/confirm`, { lat: 37.401, lng: -3.8, accuracy: 5 }, 'ana')).status, 400); // a ~110 m
  assert.equal((await call('POST', `/places/${wid}/confirm`, { lat: 37.4, lng: -3.8, accuracy: 5 }, 'ana')).body.status, 'active');
  assert.equal((await call('POST', `/places/${wid}/confirm`, { lat: 37.4, lng: -3.8, accuracy: 5 }, 'ana')).status, 409);
  // no se admiten dos bancos a menos de 15 m
  assert.equal((await call('POST', '/places', mk('bench', 37.17, -3.6), 'beto')).status, 409); // ya está osm-900 (y otros)
  // reclamar un banco nuevo: grupo, estar ahí, foto y nota
  const claim = { lat: 37.5, lng: -3.9, accuracy: 5 };
  const photo = users.ana.id + '/abcdef123456.jpg';
  assert.equal((await call('POST', '/places', mk('bench', 37.5, -3.9, { claim, rating: 4, photos: [photo] }), 'ana')).status, 403); // sin grupo
  await call('POST', '/groups', { name: 'Descubridores' }, 'ana');
  assert.equal((await call('POST', '/places', mk('bench', 37.5, -3.9, { claim, rating: 4 }), 'ana')).status, 400); // sin foto
  assert.equal((await call('POST', '/places', mk('bench', 37.5, -3.9, { claim: { ...claim, lat: 37.51 }, rating: 4, photos: [photo] }), 'ana')).status, 400); // lejos
  const n = await call('POST', '/places', mk('bench', 37.5, -3.9, { claim, rating: 4, photos: [photo] }), 'ana');
  assert.equal(n.status, 201); assert.equal(n.body.points, 6); assert.equal(n.body.count, 1); assert.equal(n.body.baseGroup, 'Descubridores');
  const bid = n.body.id;
  // «ya no existe»: con base hacen falta 5 personas distintas (3 sin ella); un moderador lo oculta al momento
  assert.equal((await call('POST', `/places/${bid}/flag`, {}, 'beto')).body.hidden, false);
  assert.equal((await call('POST', `/places/${bid}/flag`, {}, 'beto')).body.flags, 1); // la misma persona no suma dos veces
  assert.equal((await call('POST', `/places/${bid}/flag`, {}, 'cris')).body.hidden, false);
  assert.equal((await call('POST', `/places/${bid}/flag`, {}, 'ana')).body.hidden, false); // 3 < 5 porque el banco tiene base
  const h = await call('POST', `/places/${bid}/flag`, {}, 'root'); assert.equal(h.body.hidden, true);
  assert.equal((await call('GET', '/places')).body.some((p) => p.id === bid), false);
  assert.equal((await call('GET', '/places/' + bid, null, 'ana')).status, 404);
  assert.equal((await call('GET', '/places/' + bid, null, 'root')).status, 200); // el moderador sí lo ve
  assert.equal((await call('GET', '/admin/places?status=hidden', null, 'root')).body[0].id, bid);
  assert.equal((await call('POST', '/admin/places/' + bid + '/hide', null, 'ana')).status, 403);
  assert.equal((await admin.query("select points, kind from poyo.checkins where place_id = $1", [bid])).rows[0].points, 1); // pierde el bonus
  assert.equal((await admin.query("select count(*)::int n from poyo.place_control where place_id = $1", [bid])).rows[0].n, 0);
  assert.equal((await call('POST', `/places/${bid}/checkin`, { lat: 37.5, lng: -3.9, accuracy: 5 }, 'ana')).status, 404);
  assert.equal((await call('POST', '/admin/places/' + bid + '/restore', null, 'root')).body.status, 'active');
  assert.equal((await call('GET', '/places')).body.some((p) => p.id === bid), true);
  // pendientes para el moderador
  const pend = await call('POST', '/places', mk('wall', 37.6, -4), 'beto');
  assert.equal((await call('GET', '/admin/places', null, 'root')).body.some((p) => p.id === pend.body.id), true);
  assert.equal((await call('POST', `/admin/places/${pend.body.id}/approve`, null, 'root')).body.status, 'active');
  await admin.query('delete from poyo.reviews where place_id = $1', [bid]); // para no alterar el feed de las pruebas siguientes
  await call('POST', '/groups/leave', null, 'ana');
});

test('amistades: solicitud, aceptar, rechazo, feed y perfil', async () => {
  assert.equal((await call('POST', '/friends/beto', null, 'ana')).body.relation, 'sent');
  { const x = await call('POST', '/friends/Ana.G', null, 'beto'); assert.equal(x.body.relation, 'friends', JSON.stringify(x)); } // beto acepta
  assert.equal((await call('POST', '/friends/cris', null, 'ana')).body.relation, 'sent');
  const list = (await call('GET', '/friends', null, 'cris')).body; assert.equal(list.incoming.length, 1); assert.equal(list.incoming[0].username, 'Ana.G');
  assert.equal((await call('DELETE', '/friends/Ana.G', null, 'cris')).body.relation, 'none'); // rechaza
  const feed = (await call('GET', '/feed', null, 'ana')).body; assert.equal(feed.length, 2); assert.ok(feed[0].place.name);
  const prof = (await call('GET', '/users/beto', null, 'ana')).body;
  assert.equal(prof.relation, 'friends'); assert.equal(prof.reviewCount, 1); assert.equal(prof.avg, 5); assert.equal(prof.friends.length, 1);
  const sug = (await call('GET', '/users?q=', null, 'cris')).body; assert.ok(sug.length >= 2 && sug.every((u) => u.username !== 'cris'));
  assert.equal((await call('GET', '/users?q=an', null, 'cris')).body[0].username, 'Ana.G');
  assert.equal((await call('POST', '/friends/cris', null, 'cris')).status, 400);
});

test('borrar, denunciar y moderar', async () => {
  const rv = (await call('GET', '/places/osm-777', null, 'ana')).body.reviews;
  const beto = rv.find((r) => r.author === 'beto');
  assert.equal((await call('DELETE', '/reviews/' + beto.id, null, 'ana')).status, 403);
  assert.equal((await call('POST', `/reviews/${beto.id}/report`, { reason: 'spam' }, 'ana')).status, 200);
  assert.equal((await call('GET', '/admin/reports', null, 'ana')).status, 403);
  const reports = (await call('GET', '/admin/reports', null, 'root')).body; assert.equal(reports.length, 1); assert.equal(reports[0].by, 'Ana.G'); assert.equal(reports[0].review.author, 'beto');
  assert.equal((await call('DELETE', '/reviews/' + beto.id, null, 'root')).status, 200); // moderador borra
  assert.equal((await call('GET', '/places/osm-777', null, 'ana')).body.count, 1);
});

test('avatar, fotos a la papelera y borrado de mis datos', async () => {
  const av = users.ana.id + '/avatar1234.jpg';
  assert.equal((await call('PUT', '/me', { avatar: users.beto.id + '/x12345678.jpg' }, 'ana')).status, 400);
  assert.equal((await call('PUT', '/me', { avatar: av, bio: 'hola' }, 'ana')).body.avatar, av);
  const av2 = users.ana.id + '/avatar5678.jpg'; await call('PUT', '/me', { avatar: av2 }, 'ana');
  const { rows } = await admin.query('select path from poyo.photo_trash order by path');
  assert.ok(rows.some((x) => x.path === av), 'el avatar anterior queda en la papelera');
  assert.equal((await call('DELETE', '/me', null, 'ana')).status, 200);
  assert.equal((await call('GET', '/me', null, 'ana')).body.needsProfile, true);
  assert.equal((await call('GET', '/places/osm-777', null, 'beto')).body.count, 0);
  const t = (await admin.query('select path from poyo.photo_trash')).rows.map((x) => x.path);
  assert.ok(t.includes(av2) && t.includes(users.ana.id + '/abcdef123456.jpg'));
  assert.equal((await call('GET', '/me', null, 'beto')).status, 200);
});
