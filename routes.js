// Rutas a pie con paradas: una ruta normal + puntos intermedios (bancos o fuentes) hasta que ningún tramo
// entre paradas supere `limit` metros. Sin red ni base de datos: `route(puntos)` y `sites` se inyectan (ver server.js y test/route.test.js).
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

function meters([la1, ln1], [la2, ln2]) {
  return Math.hypot(rad(ln2 - ln1) * Math.cos(rad((la1 + la2) / 2)), rad(la2 - la1)) * R;
}
const cumulative = (path) => path.reduce((c, p, i) => (c.push(i ? c[i - 1] + meters(path[i - 1], p) : 0), c), []);

// Punto más cercano de la ruta a `p`: a cuántos metros queda (off) y en qué metro de la ruta (pos).
function nearest(path, cum, p) {
  const k = Math.cos(rad(p[0]));
  const xy = (q) => [rad(q[1] - p[1]) * k * R, rad(q[0] - p[0]) * R]; // metros, con p en el origen
  let best = { off: Infinity, pos: 0 };
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1]), [bx, by] = xy(path[i]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.off) best = { off, pos: cum[i - 1] + t * (cum[i] - cum[i - 1]) };
  }
  return best;
}

// from/to: [lat, lng]. sites: [{ id, lat, lng, name?, type? }]. route: async (puntos) => { coords: [[lat, lng]…], distance, duration }.
// reach: hasta dónde (m) una parada cuenta como «en la ruta»; detour: cuánto nos desviamos como máximo para llegar a una.
async function planRoute({ from, to, limit, sites, route, reach = 30, detour = 150, maxIter = 6 }) {
  const stops = []; // paradas que obligamos a visitar, además de las que ya pillan de paso
  const failed = new Set();
  let r, cum, rest, gaps;
  for (let iter = 0; ; iter++) {
    r = await route([from, ...stops.map((s) => [s.lat, s.lng]), to]);
    cum = cumulative(r.coords);
    const total = cum[cum.length - 1];
    const near = sites.map((s) => ({ ...s, ...nearest(r.coords, cum, [s.lat, s.lng]) }));
    rest = near.filter((s) => s.off <= reach).sort((a, b) => a.pos - b.pos);
    const marks = [{ id: 'start', pos: 0 }, ...rest, { id: 'end', pos: total }];
    gaps = marks.slice(1).map((m, i) => ({ from: marks[i], to: m, meters: Math.round(m.pos - marks[i].pos) }));
    // por cada tramo largo, la parada más lejana que alcanzamos dentro de `limit` sin desviarnos demasiado; todas con una sola consulta
    const added = [];
    for (const bad of gaps.filter((g) => g.meters > limit && !failed.has(g.from.id + '>' + g.to.id))) {
      const pick = near.filter((s) => s.off <= detour && s.off > reach && s.pos > bad.from.pos + 20 && s.pos <= bad.from.pos + limit && s.pos < bad.to.pos && !stops.some((x) => x.id === s.id))
        .sort((x, y) => y.pos - x.pos || x.off - y.off)[0];
      if (pick) added.push(pick); else failed.add(bad.from.id + '>' + bad.to.id);
    }
    if (!added.length || iter >= maxIter) break;
    stops.push(...added); stops.sort((x, y) => x.pos - y.pos);
  }
  const total = Math.round(cum[cum.length - 1]);
  const maxGap = Math.max(...gaps.map((g) => g.meters));
  return {
    distance: Math.round(r.distance ?? total), duration: Math.round(r.duration ?? 0), geometry: r.coords,
    stops: rest.map(({ id, lat, lng, name, type, pos }) => ({ id, lat, lng, name: name || '', type, at: Math.round(pos) })),
    maxGap, ok: maxGap <= limit,
    gaps: gaps.filter((g) => g.meters > limit).map((g) => ({ from: Math.round(g.from.pos), to: Math.round(g.to.pos), meters: g.meters })),
  };
}

module.exports = { planRoute, meters };
