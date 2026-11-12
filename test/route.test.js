// Lógica de rutas con paradas, con un «servicio de rutas» falso que une los puntos en línea recta.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planRoute, meters } = require('../routes.js');

const LAT = 37.17, DLNG = 1 / (111320 * Math.cos((LAT * Math.PI) / 180)); // grados de longitud por metro
const at = (east, north = 0) => [LAT + north / 111320, -3.6 + east * DLNG]; // punto a `east` m al este y `north` m al norte de la salida
const site = (id, east, north = 0) => ({ id, lat: at(east, north)[0], lng: at(east, north)[1], type: 'bench' });
const fake = () => { const calls = []; return { calls, route: async (pts) => {
  calls.push(pts);
  const coords = []; pts.forEach((p, i) => { if (!i) return coords.push(p); for (let k = 1; k <= 20; k++) coords.push(pts[i - 1].map((v, j) => v + ((p[j] - v) * k) / 20)); });
  const distance = pts.slice(1).reduce((s, p, i) => s + meters(pts[i], p), 0);
  return { coords, distance, duration: distance / 1.3 };
} }; };

test('ruta que ya cumple: no pide nada más', async () => {
  const f = fake();
  const r = await planRoute({ from: at(0), to: at(600), limit: 250, sites: [site('a', 200), site('b', 400)], route: f.route });
  assert.equal(f.calls.length, 1); assert.equal(r.ok, true); assert.deepEqual(r.stops.map((s) => s.id), ['a', 'b']);
  assert.ok(r.maxGap <= 250 && r.maxGap >= 190);
});

test('mete un banco algo desviado para partir un tramo largo', async () => {
  const f = fake();
  const r = await planRoute({ from: at(0), to: at(400), limit: 250, sites: [site('lejos', 200, 80)], route: f.route });
  assert.equal(r.ok, true);
  assert.deepEqual(r.stops.map((s) => s.id), ['lejos']);
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].length, 3); // salida, banco, llegada
  assert.ok(r.distance > 400);
});

test('sin bancos cerca: devuelve la ruta y el tramo que sigue largo', async () => {
  const f = fake();
  const r = await planRoute({ from: at(0), to: at(1000), limit: 250, sites: [site('a', 300), site('lejisimos', 500, 400)], route: f.route });
  assert.equal(r.ok, false); assert.equal(r.stops.length, 1);
  assert.deepEqual(r.gaps.map((g) => [g.from, g.to]).map(([a, b]) => b - a > 250), r.gaps.map(() => true));
  assert.ok(r.maxGap > 250);
});

test('un banco que el router no deja en la ruta no se repite sin fin', async () => {
  const stuck = async (pts) => ({ coords: [pts[0], pts[pts.length - 1]], distance: meters(pts[0], pts[pts.length - 1]), duration: 1 }); // ignora los intermedios
  const r = await planRoute({ from: at(0), to: at(1000), limit: 250, sites: [site('x', 200, 60), site('y', 450, 60)], route: stuck });
  assert.equal(r.ok, false);
});

test('varias restricciones: pide bancos y fuentes en una sola consulta y da un tramo máximo por tipo', async () => {
  const f = fake();
  const fuente = (id, e, n = 0) => ({ ...site(id, e, n), type: 'fountain' });
  const r = await planRoute({ from: at(0), to: at(400), route: f.route, constraints: [
    { id: 'bench', limit: 350, sites: [site('b', 100, 70)] },
    { id: 'fountain', limit: 350, sites: [fuente('f', 240, -70)] },
  ] });
  assert.deepEqual(r.stops.map((s) => s.type), ['bench', 'fountain']); // en el orden de la ruta
  assert.deepEqual(Object.keys(r.maxGaps).sort(), ['bench', 'fountain']);
  assert.equal(f.calls[1].length, 4); // salida, banco, fuente, llegada
});

test('una restricción cumple y otra no: ok=false y el hueco dice de qué tipo', async () => {
  const f = fake();
  const r = await planRoute({ from: at(0), to: at(500), route: f.route, constraints: [
    { id: 'bench', limit: 300, sites: [site('b', 250)] },
    { id: 'fountain', limit: 300, sites: [] },
  ] });
  assert.equal(r.ok, false); assert.deepEqual([...new Set(r.gaps.map((g) => g.kind))], ['fountain']);
});

test('si los bancos están todos hacia el final del hueco, parte el hueco igualmente (aunque no llegue al límite)', async () => {
  const f = fake();
  const r = await planRoute({ from: at(0), to: at(600), limit: 250, sites: [site('tarde', 400, 60)], route: f.route });
  assert.equal(r.ok, false); // 404 m hasta el banco: sigue pasándose del límite…
  assert.deepEqual(r.stops.map((s) => s.id), ['tarde']); // …pero el hueco de 600 m queda partido
  assert.ok(r.maxGap < 600);
});

test('un rodeo largo que apenas mejora no se acepta', async () => {
  const f = fake();
  // el banco está a 140 m de la ruta: ir y volver cuesta ~280 m de más para ganar ~10 m de tramo
  const r = await planRoute({ from: at(0), to: at(300), limit: 250, sites: [site('rodeo', 250, 140)], route: f.route });
  assert.equal(r.stops.length, 0); assert.equal(r.distance < 310, true); // se queda con la ruta directa
});
