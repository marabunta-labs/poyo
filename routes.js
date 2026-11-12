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

// from/to: [lat, lng]. route: async (puntos) => { coords: [[lat, lng]…], distance, duration }.
// constraints: [{ id, sites: [{ id, lat, lng, name?, type? }], limit }] — cada tipo de parada (bancos, fuentes…) tiene su propio tramo máximo.
// (Atajo para uno solo: { limit, sites }.) reach: hasta dónde (m) una parada cuenta como «en la ruta»; detour: desvío máximo para llegar a una.
async function planRoute({ from, to, limit, sites, constraints, route, reach = 30, detour = 150, maxIter = 6 }) {
  const cons = constraints || [{ id: 'rest', sites, limit }];
  const stops = []; // paradas que obligamos a visitar, además de las que ya pillan de paso
  const failed = new Set();
  let r, per;
  for (let iter = 0; ; iter++) {
    r = await route([from, ...stops.map((s) => [s.lat, s.lng]), to]);
    const cum = cumulative(r.coords), total = cum[cum.length - 1];
    per = cons.map((c) => {
      const near = c.sites.map((s) => ({ ...s, ...nearest(r.coords, cum, [s.lat, s.lng]) }));
      const rest = near.filter((s) => s.off <= reach).sort((x, y) => x.pos - y.pos);
      const marks = [{ id: 'start', pos: 0 }, ...rest, { id: 'end', pos: total }];
      return { ...c, near, rest, gaps: marks.slice(1).map((m, i) => ({ kind: c.id, from: marks[i], to: m, meters: Math.round(m.pos - marks[i].pos) })) };
    });
    // por cada tramo largo, la parada más lejana que alcanzamos dentro del límite sin desviarnos demasiado; todas con una sola consulta
    const added = new Map();
    for (const c of per) {
      for (const bad of c.gaps.filter((g) => g.meters > c.limit && !failed.has(c.id + g.from.id + '>' + g.to.id))) {
        const pick = c.near.filter((s) => s.off <= detour && s.off > reach && s.pos > bad.from.pos + 20 && s.pos <= bad.from.pos + c.limit && s.pos < bad.to.pos && !stops.some((x) => x.id === s.id))
          .sort((x, y) => y.pos - x.pos || x.off - y.off)[0];
        if (pick) added.set(pick.id, pick); else failed.add(c.id + bad.from.id + '>' + bad.to.id);
      }
    }
    if (!added.size || iter >= maxIter) break;
    stops.push(...added.values());
    for (const s of stops) s.pos = nearest(r.coords, cum, [s.lat, s.lng]).pos; // posición en la ruta actual: el orden de las paradas debe seguirla
    stops.sort((x, y) => x.pos - y.pos);
  }
  const total = Math.round(cumulative(r.coords).at(-1));
  const gaps = per.flatMap((c) => c.gaps), maxGaps = Object.fromEntries(per.map((c) => [c.id, Math.max(...c.gaps.map((g) => g.meters))]));
  const seen = new Set();
  return {
    distance: Math.round(r.distance ?? total), duration: Math.round(r.duration ?? 0), geometry: r.coords,
    stops: per.flatMap((c) => c.rest).filter((s) => !seen.has(s.id) && seen.add(s.id)).sort((x, y) => x.pos - y.pos)
      .map(({ id, lat, lng, name, type, pos }) => ({ id, lat, lng, name: name || '', type, at: Math.round(pos) })),
    maxGap: Math.max(...Object.values(maxGaps)), maxGaps, ok: per.every((c) => maxGaps[c.id] <= c.limit),
    gaps: per.flatMap((c) => c.gaps.filter((g) => g.meters > c.limit)).map((g) => ({ kind: g.kind, from: Math.round(g.from.pos), to: Math.round(g.to.pos), meters: g.meters })),
  };
}

module.exports = { planRoute, meters };
