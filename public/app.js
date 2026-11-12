const TYPES = { bench: t('Banco'), picnic: t('Mesa de pícnic'), wall: t('Muro / escalón'), other: t('Otro'), fountain: t('Fuente'), shop: t('Tienda de alimentación') };
const EMOJI = { bench: '🪑', picnic: '🧺', wall: '🧱', other: '📍', fountain: '💧', shop: '🛒' };
const GROUP = { bench: 'sit', picnic: 'sit', wall: 'sit', other: 'sit', fountain: 'fountain', shop: 'shop' };
const FILTERS = { sit: t('🪑 Sentarse'), fountain: t('💧 Fuentes'), shop: t('🛒 Tiendas') };
const visible = new Set(Object.keys(FILTERS));
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => k != null && k !== false && n.append(k));
  return n;
};
const CRIT = { views: t('Vistas'), comfort: t('Comodidad'), access: t('Accesibilidad'), shade: t('Sombra'), calm: t('Tranquilidad'),
  space: t('Espacio'), clean: t('Limpieza'), flow: t('Caudal'), pets: t('Apta para mascotas'), hours: t('Horario'), price: t('Precio'),
  catalog: t('Catálogo'), service: t('Atención') }; // qué criterios tiene cada tipo: cfg.criteria (lo define el servidor)
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
let cfg = null, sb = null; // configuración pública y cliente de Supabase (cuentas y fotos), se cargan al arrancar
const photoUrl = (f) => `${cfg.supabaseUrl}/storage/v1/object/public/${cfg.bucket}/${f}`;
const token = async () => (sb ? (await sb.auth.getSession()).data.session?.access_token : null);

async function api(method, url, body) {
  const tk = await token();
  const r = await fetch('/api' + url, {
    method, headers: { ...(body && { 'Content-Type': 'application/json' }), ...(tk && { Authorization: 'Bearer ' + tk }) },
    body: body && JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(t(data.error || 'Error')), { status: r.status });
  return data;
}

// Sube una foto (JPEG) a Storage, a la carpeta de la persona (<uid>/<nombre>.jpg); devuelve la ruta.
async function uploadPhoto(blob) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error(t('Inicia sesión para hacer esto'));
  const path = `${session.user.id}/${[...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')}.jpg`;
  const { error } = await sb.storage.from(cfg.bucket).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw new Error(t('No se pudo subir la foto'));
  return path;
}

const map = L.map('map', { zoomControl: false, maxZoom: 20 }).setView([40.4168, -3.7038], 17);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const OFM_ATTR = '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://openmaptiles.org">OpenMapTiles</a> ' + OSM_ATTR;
const BASES = { // los dos primeros son vectoriales SIN comercios ni iconos, para que destaquen los sitios de Poyo
  light: { name: t('Claro (sin comercios)'), style: 'https://tiles.openfreemap.org/styles/positron', attribution: OFM_ATTR },
  color: { name: t('Color (sin comercios)'), style: 'https://tiles.openfreemap.org/styles/liberty', attribution: OFM_ATTR },
  osm: { name: t('Estándar (OpenStreetMap)'), url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxNativeZoom: 19, attribution: OSM_ATTR } },
  sat: { name: t('Satélite'), url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opts: { maxNativeZoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' } },
  topo: { name: t('Relieve'), url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    opts: { subdomains: 'abc', maxNativeZoom: 17, attribution: OSM_ATTR + ' © <a href="https://opentopomap.org">OpenTopoMap</a>' } },
};
const pref = (k, def) => { try { return localStorage.getItem('poyo-' + k) ?? def; } catch { return def; } };
const setPref = (k, v) => { try { localStorage.setItem('poyo-' + k, v); } catch {} };
const hasWebGL = () => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } };
let baseKey = pref('base', 'light'), baseLayer, baseToken = 0;
if (!BASES[baseKey]) baseKey = 'light';
const rasterLayer = (b) => L.tileLayer(b.url, { maxZoom: 20, ...b.opts });
async function setBase(k) {
  baseKey = k; setPref('base', k); baseLayer?.remove(); baseLayer = null;
  const b = BASES[k], token = ++baseToken;
  let layer;
  if (b.style && hasWebGL() && window.L.maplibreGL) {
    try {
      const style = await (await fetch(b.style)).json();
      style.layers = style.layers.filter((l) => l['source-layer'] !== 'poi'); // fuera comercios y demás iconos
      layer = L.maplibreGL({ style, attribution: b.attribution });
    } catch {}
  }
  layer ??= rasterLayer(b.url ? b : BASES.osm); // sin WebGL o sin red al estilo: mapa estándar
  if (token === baseToken) baseLayer = layer.addTo(map);
}
setBase(baseKey);

const places = new Map();
const markers = new Map();
let me = null, adding = false;

// ---------- marcadores ----------
const color = (p) => (!p.count ? '#8a8f8b' : p.avg >= 4 ? '#2f7d4f' : p.avg >= 3 ? '#c9a227' : '#c0392b');
let emojiMode = pref('emoji', '0') === '1';
const icon = (p) => emojiMode ? L.divIcon({
  className: '', iconSize: [32, 32], iconAnchor: [16, 16],
  html: `<div class="emo${p.count ? '' : ' empty'}"><span class="e">${EMOJI[p.type] || EMOJI.other}</span>${p.count ? `<b style="background:${color(p)}">${p.avg.toFixed(1)}</b>` : ''}</div>`,
}) : L.divIcon({
  className: '', iconSize: [30, 30], iconAnchor: [15, 30],
  html: `<div class="pin${p.count ? '' : ' empty'}" style="background:${color(p)}"><span>${EMOJI[p.type] || EMOJI.other}</span>${p.count ? `<b>${p.avg.toFixed(1)}</b>` : ''}</div>`,
});
const shown = (p) => visible.has(GROUP[p.type]);
function upsert(p) {
  const cur = { ...places.get(p.id), ...p };
  places.set(p.id, cur);
  const m = markers.get(p.id);
  if (m) { m.setIcon(icon(cur)); m.setZIndexOffset(cur.count ? 1000 : 0); return; }
  const mk = L.marker([cur.lat, cur.lng], { icon: icon(cur), zIndexOffset: cur.count ? 1000 : 0 });
  if (shown(cur)) mk.addTo(map);
  mk.on('click', () => openPlace(p.id));
  markers.set(p.id, mk);
}
function applyFilters() {
  markers.forEach((mk, id) => (shown(places.get(id)) ? mk.addTo(map) : mk.remove()));
}
const chips = $('filters');
Object.entries(FILTERS).forEach(([k, label]) => chips.append(el('button', { className: 'on', textContent: label, onclick: (e) => {
  visible.has(k) ? visible.delete(k) : visible.add(k);
  e.currentTarget.classList.toggle('on', visible.has(k));
  applyFilters();
} })));

// ---------- menú de vista (capas y estilo de los sitios) ----------
const viewMenu = $('viewmenu');
function buildViewMenu() {
  const radio = (group, value, label, checked, onchange) => el('label', {},
    el('input', { type: 'radio', name: group, value, checked, onchange }), label);
  viewMenu.replaceChildren(
    el('h4', { textContent: t('Mapa') }),
    ...Object.entries(BASES).map(([k, b]) => radio('base', k, b.name, k === baseKey, () => setBase(k))),
    el('h4', { textContent: t('Sitios') }),
    radio('style', 'pin', t('📍 Pines'), !emojiMode, () => setEmojiMode(false)),
    radio('style', 'emoji', t('😀 Emojis sobre el mapa'), emojiMode, () => setEmojiMode(true)));
}
function setEmojiMode(v) {
  emojiMode = v; setPref('emoji', v ? '1' : '0');
  markers.forEach((m, id) => m.setIcon(icon(places.get(id))));
}
buildViewMenu();
$('viewbtn').onclick = () => { viewMenu.hidden = !viewMenu.hidden; results.hidden = true; };
map.on('click', () => (viewMenu.hidden = true));

// ---------- datos de OpenStreetMap ----------
let overpassCtl, osmRetry, osmTries = 0;
async function loadOSM() {
  clearTimeout(osmRetry);
  if (map.getZoom() < 16) { $('status').textContent = t('Acércate para ver sitios'); return; }
  const b = map.getBounds();
  const qs = new URLSearchParams({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
  overpassCtl?.abort();
  overpassCtl = new AbortController();
  $('status').textContent = t('Buscando sitios…');
  try {
    const r = await fetch('/api/osm?' + qs, { signal: overpassCtl.signal });
    const data = { elements: await r.json() };
    if (!r.ok) throw new Error(data.elements.error || 'osm');
    data.elements.forEach((e) => {
      const id = e.id;
      if (places.has(id)) return;
      const t = e.tags || {};
      upsert({ id, lat: e.lat, lng: e.lng, name: t.name || '', count: 0, avg: null,
        type: t.shop ? 'shop' : t.amenity === 'drinking_water' ? 'fountain' : t.leisure === 'picnic_table' ? 'picnic' : 'bench' });
    });
    osmTries = 0;
    $('status').textContent = t('{n} sitios en esta zona', { n: data.elements.length });
  } catch (e) {
    if (e.name === 'AbortError') return;
    const again = osmTries++ < 4;
    $('status').textContent = again ? t('OpenStreetMap no responde, reintentando…') : t('No se pudo cargar OpenStreetMap · mueve el mapa para reintentar');
    if (again) osmRetry = setTimeout(loadOSM, 15000);
  }
}
let moveTimer; map.on('moveend', () => { clearTimeout(moveTimer); osmTries = 0; moveTimer = setTimeout(loadOSM, 500); });

// ---------- buscador ----------
// Los resultados salen justo bajo la caja. Al escribir: sitios de Poyo con ese nombre (al instante, sin red);
// al pulsar Enter: lugares de España vía Nominatim (su política no permite autocompletar), priorizando
// los cercanos al usuario (o al centro del mapa si no hemos podido ubicarle).
const results = $('results');
let userPos = null;
const goTo = (lat, lng, id) => { results.hidden = true; map.setView([lat, lng], 18); if (id) openPlace(id); };
const resRow = (text, fn) => el('button', { type: 'button', className: 'res', textContent: text, onclick: fn });
const away = (m) => (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km');
function localMatches(q) { // los más cercanos primero, con la distancia para distinguir cadenas con el mismo nombre
  const here = userPos ? L.latLng(userPos.lat, userPos.lng) : map.getCenter();
  return [...places.values()].filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()))
    .map((p) => [here.distanceTo([p.lat, p.lng]), p]).sort((x, y) => x[0] - y[0]).slice(0, 5)
    .map(([d, p]) => resRow(`${EMOJI[p.type]} ${p.name} · ${away(d)}`, () => goTo(p.lat, p.lng, p.id)));
}
function showResults(nodes) { results.replaceChildren(...nodes); results.hidden = !nodes.length; viewMenu.hidden = true; }
async function runSearch() {
  const q = $('q').value.trim();
  if (q.length < 2) return;
  const mine = localMatches(q);
  showResults([...mine, el('div', { className: 'muted', textContent: t('Buscando en España…') })]);
  const near = userPos || map.getCenter();
  let geo = [];
  try { geo = await api('GET', `/geocode?lang=${LANG}&q=${encodeURIComponent(q)}&near=${near.lat ?? near[0]},${near.lng ?? near[1]}`); }
  catch (x) { if (!mine.length) return showResults([el('div', { className: 'err', textContent: x.message })]); }
  showResults([...mine, ...geo.map((g) => resRow('📍 ' + g.name, () => goTo(g.lat, g.lng)))]);
  if (!results.children.length) showResults([el('div', { className: 'muted', textContent: t('Sin resultados en España') })]);
}
$('search').onsubmit = (e) => { e.preventDefault(); runSearch(); };
$('q').oninput = () => {
  const q = $('q').value.trim();
  if (q.length < 2) return (results.hidden = true);
  showResults([...localMatches(q), resRow(t('🔎 Buscar «{q}» en España', { q }), runSearch)]);
};
$('q').addEventListener('keydown', (e) => { if (e.key === 'Escape') results.hidden = true; });
map.on('click', () => (results.hidden = true));

// ---------- panel ----------
let viewId = 0;
const content = () => { const c = $('content'); c.replaceChildren(); c.dataset.v = ++viewId; $('panel').hidden = false; return c; };
const stale = (id) => $('content').dataset.v !== String(id); // el usuario ya navegó a otra vista mientras esperábamos a la red
$('close').onclick = () => { $('panel').hidden = true; hist.stack = []; hist.i = -1; syncNav(); };

// Historial del panel (← →): cada vista se registra con una clave; repetir la misma clave (refrescar) no añade entrada.
const hist = { stack: [], i: -1 };
function syncNav() { $('back').disabled = hist.i < 1; $('fwd').disabled = hist.i >= hist.stack.length - 1; }
function visit(key, fn) {
  const cur = hist.stack[hist.i];
  if (cur?.key === key) hist.stack[hist.i] = { key, fn };
  else { hist.stack.length = hist.i + 1; hist.stack.push({ key, fn }); if (hist.stack.length > 50) hist.stack.shift(); else hist.i++; }
  syncNav(); fn();
}
function step(d) { const n = hist.i + d; if (n < 0 || n >= hist.stack.length) return; hist.i = n; syncNav(); hist.stack[n].fn(); }
$('back').onclick = () => step(-1);
$('fwd').onclick = () => step(1);

// Avatar: la foto si la hay; si no, la inicial sobre un color propio de cada usuario.
const hue = (name) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
function avatarEl(u, size = 40) {
  const name = u.username || u.author || '?';
  const a = el('div', { className: 'avatar', style: `width:${size}px;height:${size}px;font-size:${size * 0.45}px;background:hsl(${hue(name)} 45% 42%)` });
  if (u.avatar) a.append(el('img', { src: photoUrl(u.avatar), alt: '' })); else a.textContent = name[0].toUpperCase();
  return a;
}

// Reseñas de la gente sobre el mapa: cada una es el avatar de su autor con la nota.
const people = L.layerGroup().addTo(map);
function showOnMap(reviews, label) {
  people.clearLayers();
  const rs = reviews.filter((r) => r.place);
  $('mapchip').hidden = !rs.length;
  if (!rs.length) return alert('Todavía no hay reseñas que enseñar en el mapa.');
  $('mapchip-t').textContent = `${label} · ${rs.length}`;
  rs.forEach((r) => {
    const m = L.marker([r.place.lat, r.place.lng], { zIndexOffset: 3000, icon: L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19],
      html: `<div class="pmark">${avatarEl({ username: r.author, avatar: r.avatar }, 34).outerHTML}<b>${r.rating}★</b></div>` }) });
    m.bindTooltip(`${r.author}: ${r.place.name || TYPES[r.place.type]}`);
    m.on('click', () => openPlace(r.placeId));
    people.addLayer(m);
  });
  map.fitBounds(L.latLngBounds(rs.map((r) => [r.place.lat, r.place.lng])), { paddingTopLeft: [40, 120], paddingBottomRight: [innerWidth > 700 ? 400 : 40, 40], maxZoom: 17 });
}
$('mapchip-x').onclick = () => { people.clearLayers(); $('mapchip').hidden = true; };

function lightbox(src) {
  const box = el('div', { id: 'lightbox', onclick: () => box.remove() }, el('img', { src }));
  document.body.append(box);
}
const photoStrip = (files, cls) => files?.length
  ? el('div', { className: cls }, ...files.map((f) => el('img', { src: photoUrl(f), loading: 'lazy', onclick: () => lightbox(photoUrl(f)) })))
  : null;
const userLink = (name) => el('button', { className: 'link', textContent: name, onclick: () => openProfile(name) });
const demoBadge = () => el('span', { className: 'badge demo', textContent: t('demo'), title: t('Cuenta de ejemplo: no es una persona real') });
const whoLine = (r, noDate) => el('div', { className: 'who' }, el('button', { className: 'plain', onclick: () => openProfile(r.author) }, avatarEl(r, 28)),
  userLink(r.author), r.isSeed ? demoBadge() : null, r.byFriend ? el('span', { className: 'badge', textContent: t('amigo') }) : null,
  noDate ? null : el('time', { textContent: new Date(r.createdAt).toLocaleDateString(LOCALE) }));

function reviewActions(r, refresh) {
  if (!me || !refresh) return null;
  if (r.author === me.username || me.isAdmin) {
    return el('button', { className: 'btn danger', style: 'margin-top:6px', textContent: r.author === me.username ? t('🗑 Borrar mi reseña') : t('Borrar (mod)'), onclick: async () => {
      if (!confirm(t('¿Borrar esta reseña y sus fotos?'))) return;
      try { const p = await api('DELETE', '/reviews/' + r.id); upsert(p); refresh(); } catch (x) { alert(x.message); }
    } });
  }
  return el('button', { className: 'link small', textContent: t('Denunciar'), onclick: async () => {
    const reason = prompt('¿Por qué denuncias esta reseña? (spam, insultos, foto inapropiada…)');
    if (reason === null) return;
    try { await api('POST', `/reviews/${r.id}/report`, { reason }); alert('Gracias, un moderador la revisará.'); } catch (x) { alert(x.message); }
  } });
}

const critChips = (ratings) => Object.keys(ratings || {}).length
  ? el('div', { className: 'crits' }, ...Object.entries(ratings).filter(([k]) => CRIT[k]).map(([k, v]) => el('span', { textContent: `${CRIT[k]} ${v}★` }))) : null;

function reviewRow(r, showPlace, refresh) {
  return el('div', { className: 'review' },
    showPlace ? null : whoLine(r),
    el('span', { className: 'stars', textContent: stars(r.rating) }), showPlace ? el('time', { textContent: new Date(r.createdAt).toLocaleDateString(LOCALE) }) : null,
    showPlace && r.place ? el('div', {}, el('button', { className: 'link', textContent: (EMOJI[r.place.type] || '') + ' ' + (r.place.name || TYPES[r.place.type]),
      onclick: () => { map.setView([r.place.lat, r.place.lng], 18); openPlace(r.placeId); } })) : null,
    critChips(r.ratings),
    r.text ? el('p', { textContent: r.text }) : null,
    photoStrip(r.photos, 'rphotos'),
    reviewActions(r, refresh));
}

// ---------- autenticación (Supabase Auth: cuenta común de Marabunta Labs) ----------
async function initAuth() {
  cfg = await (await fetch('/api/config')).json();
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(openNewPassword);
    if (event === 'SIGNED_OUT') setMe(null);
  });
}
// Con sesión iniciada: o ya hay perfil de Poyo, o hay que elegir @usuario.
async function afterLogin() {
  const m = await api('GET', '/me');
  if (!m || m.needsProfile) return openChooseName();
  setMe(m); openProfile(m.username);
}
const openAccount = async (msg) => ((await token()) ? afterLogin() : openAuth(msg));

function openAuth(msg) {
  const c = content();
  let mode = 'login';
  const email = el('input', { type: 'email', placeholder: t('Email'), maxLength: 120, autocomplete: 'email', required: true });
  const pass = el('input', { type: 'password', placeholder: t('Contraseña (mín. 6)'), autocomplete: 'current-password', minLength: 6, maxLength: 72 });
  const err = el('div', { className: 'err' });
  const info = el('div', { className: 'muted' });
  const title = el('h3');
  const submit = el('button', { className: 'submit' });
  const toggle = el('button', { type: 'button', className: 'link' });
  const forgot = el('button', { type: 'button', className: 'link', textContent: t('He olvidado mi contraseña') });
  const labels = { login: [t('Entrar'), t('¿No tienes cuenta? Regístrate')], register: [t('Crear cuenta'), t('Ya tengo cuenta')], reset: [t('Enviar enlace'), t('Volver a entrar')] };
  const render = () => {
    title.textContent = submit.textContent = labels[mode][0];
    toggle.textContent = labels[mode][1];
    pass.hidden = mode === 'reset'; pass.required = mode !== 'reset'; forgot.hidden = mode !== 'login';
    pass.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    err.textContent = info.textContent = '';
  };
  toggle.onclick = () => { mode = mode === 'login' ? 'register' : 'login'; render(); };
  forgot.onclick = () => { mode = 'reset'; render(); };
  const form = el('form', {}, title, msg ? el('div', { className: 'muted', textContent: msg }) : null, email, pass, err, info, submit, toggle, forgot);
  form.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = info.textContent = '';
    try {
      if (mode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin });
        if (error) throw error;
        info.textContent = t('Si ese email tiene cuenta, te hemos enviado un enlace para elegir una contraseña nueva.');
      } else if (mode === 'register') {
        const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: pass.value, options: { data: { app: 'poyo' }, emailRedirectTo: location.origin } });
        if (error) throw error;
        if (data.session) afterLogin();
        else info.textContent = t('Te hemos enviado un email para confirmar tu cuenta. Si ya tenías cuenta de Marabunta Labs, entra con ella directamente.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        if (error) throw error;
        afterLogin();
      }
    } catch (x) {
      err.textContent = /invalid login/i.test(x.message) ? t('Email o contraseña incorrectos') : /not confirmed/i.test(x.message) ? t('Confirma tu email antes de entrar') : x.message;
    }
  };
  render();
  const google = el('button', { type: 'button', className: 'btn', style: 'width:100%;margin-top:4px', textContent: t('Continuar con Google'),
    onclick: () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } }) });
  c.append(el('h2', { textContent: t('🪑 Únete a Poyo') }), el('div', { className: 'sub', textContent: t('Reseña sitios, sube fotos y sigue a tus amigos.') }),
    form, google, el('p', { className: 'muted small', style: 'margin:12px 0 0', textContent: t('Tu cuenta es de Marabunta Labs: si ya la tienes en otra de nuestras apps (Teaserflix, Platoplan…), usa el mismo email y la misma contraseña.') }));
}
// Primera vez en Poyo: elegir el @usuario público.
function openChooseName() {
  const c = content();
  const name = el('input', { placeholder: t('Usuario'), maxLength: 20, autocomplete: 'username' });
  const err = el('div', { className: 'err' });
  const form = el('form', {}, el('h3', { textContent: t('Elige tu @usuario') }),
    el('div', { className: 'muted', textContent: t('Es el nombre que verán los demás. 3-20 letras, números, _ . -') }), name, err, el('button', { className: 'submit', textContent: t('Continuar') }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    try { setMe(await api('POST', '/me/profile', { username: name.value })); openProfile(me.username); } catch (x) { err.textContent = x.message; }
  };
  c.append(el('h2', { textContent: t('¡Bienvenido a Poyo!') }), form);
}
// Tras pulsar el enlace de "he olvidado mi contraseña" del email.
function openNewPassword() {
  const c = content();
  const pass = el('input', { type: 'password', placeholder: t('Nueva contraseña (mín. 6)'), autocomplete: 'new-password', minLength: 6, required: true });
  const err = el('div', { className: 'err' });
  const form = el('form', {}, el('h3', { textContent: t('Nueva contraseña') }), pass, err, el('button', { className: 'submit', textContent: t('Guardar') }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: pass.value });
    if (error) err.textContent = error.message; else afterLogin();
  };
  c.append(form);
}
function setMe(u) {
  me = u; $('nav-me').title = u ? t('Mi perfil y mis reseñas') : t('Entrar o crear cuenta');
  $('nav-me').replaceChildren(...(u ? [avatarEl(u, 22), u.username] : [t('👤 Entrar')]));
}
async function requireLogin(msg) { if (!me) { openAccount(msg); return false; } return true; }
$('nav-me').onclick = () => (me ? openProfile(me.username) : openAccount());
$('nav-social').onclick = () => (me ? openSocial() : openAccount(t('Inicia sesión para ver a tus amigos')));

// ---------- sitio ----------
const openPlace = (id) => visit('place:' + id, () => loadPlace(id));
async function loadPlace(id) {
  const cur = places.get(id);
  content().append(el('p', { className: 'muted', textContent: t('Cargando…') }));
  const vid = viewId;
  let detail = { ...cur, reviews: [] };
  if (!id.startsWith('osm-') || cur.count) { try { detail = await api('GET', '/places/' + id); } catch {} }
  if (!stale(vid)) renderPlace(detail);
}

// Reduce la foto a JPEG ≤1080px (calidad .7, ~100 KB) antes de subirla.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1080 / Math.max(img.width, img.height));
      const cv = el('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Foto no válida')))), 'image/jpeg', 0.7);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error(t('Foto no válida')));
    img.src = URL.createObjectURL(file);
  });
}

// Campos de una reseña (nota, texto, fotos). Se usan al reseñar un sitio y al crear uno nuevo.
function reviewFields(mine, type) {
  let rating = 0; const files = [], crit = { ...mine?.ratings };
  const btns = [1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', textContent: '★', onclick: () => {
    rating = n; btns.forEach((b, i) => b.classList.toggle('on', i < n));
  } }));
  if (mine) btns[mine.rating - 1].click();
  const critBox = el('div', { className: 'critbox' });
  const setType = (tp) => { // criterios opcionales del tipo de sitio; tocar la misma nota otra vez la quita
    type = tp;
    critBox.replaceChildren(...(cfg.criteria[tp] || []).map((k) => {
      const bs = [1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', textContent: '★', onclick: () => {
        if (crit[k] === n) delete crit[k]; else crit[k] = n;
        bs.forEach((b, i) => b.classList.toggle('on', i < (crit[k] || 0)));
      } }));
      bs.forEach((b, i) => b.classList.toggle('on', i < (crit[k] || 0)));
      return el('div', { className: 'crit' }, el('span', { textContent: CRIT[k] }), el('div', {}, ...bs));
    }));
  };
  setType(type);
  const text = el('textarea', { placeholder: t('¿Sombra? ¿Vistas? ¿Ruido? ¿Es cómodo?'), rows: 3, maxLength: 600, value: mine?.text || '' });
  const thumbs = el('div', { className: 'thumbs' });
  const pickFile = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const err = el('div', { className: 'err' });
  pickFile.onchange = async () => {
    err.textContent = '';
    for (const f of [...pickFile.files].slice(0, 3 - files.length)) {
      try {
        const file = await uploadPhoto(await shrink(f));
        files.push(file); thumbs.append(el('img', { src: photoUrl(file) }));
      } catch (x) { err.textContent = x.message; }
    }
    pickFile.value = '';
  };
  return { rating: () => rating, ratings: () => Object.fromEntries(Object.entries(crit).filter(([k]) => (cfg.criteria[type] || []).includes(k))),
    setType, files, text, err, nodes: [el('div', { className: 'pick' }, ...btns), el('div', { className: 'muted', textContent: t('Detalles (opcional)') }), critBox, text,
    el('button', { type: 'button', className: 'btn filebtn', textContent: t('📷 Añadir fotos (máx. 3)'), onclick: () => pickFile.click() }),
    pickFile, thumbs, err] };
}

function critAvg(p) { // media por criterio, de las reseñas que lo puntuaron
  const acc = {};
  p.reviews.forEach((r) => Object.entries(r.ratings || {}).forEach(([k, v]) => (acc[k] ||= []).push(v)));
  const rows = Object.entries(acc).filter(([k]) => CRIT[k]);
  return rows.length ? el('div', { className: 'crits' }, ...rows.map(([k, vs]) =>
    el('span', { textContent: `${CRIT[k]} ${(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1)}★` }))) : null;
}

function renderPlace(p) {
  const c = content();
  c.append(
    el('h2', { textContent: p.name || TYPES[p.type] || t('Sitio') }),
    el('div', { className: 'sub', textContent: TYPES[p.type] + (p.id.startsWith('osm-') ? t(' · de OpenStreetMap') : t(' · añadido por la comunidad')) }),
  );
  const sum = el('div');
  if (p.count) sum.append(el('span', { className: 'big', textContent: p.avg.toFixed(1) + ' ' }),
    el('span', { className: 'stars', textContent: stars(p.avg) }), el('span', { textContent: ` (${p.count})` }));
  else sum.textContent = t('Aún sin reseñas. ¡Sé el primero!');
  c.append(sum, critAvg(p), photoStrip(p.photos, 'photos'));

  if (!me) {
    c.append(el('button', { className: 'submit', style: 'margin:14px 0;width:100%', textContent: t('Inicia sesión para reseñar'),
      onclick: () => openAuth(t('Inicia sesión para reseñar este sitio')) }));
  } else {
    const mine = p.reviews.find((r) => r.author === me.username);
    const f = reviewFields(mine, p.type);
    const form = el('form', {}, el('h3', { textContent: mine ? t('Editar tu reseña') : t('Deja tu reseña') }),
      ...f.nodes, el('button', { className: 'submit', textContent: t('Publicar') }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.rating()) return (f.err.textContent = t('Elige una nota'));
      try {
        const d = await api('POST', `/places/${p.id}/reviews`, { rating: f.rating(), ratings: f.ratings(), text: f.text.value, photos: f.files,
          place: { lat: p.lat, lng: p.lng, name: p.name, type: p.type } });
        upsert(d); openPlace(p.id);
      } catch (x) { f.err.textContent = x.message; }
    };
    c.append(form);
  }
  c.append(el('button', { className: 'btn', style: 'margin:10px 0', textContent: t('🚶 Ruta hasta aquí'), onclick: () => {
    route.to = { lat: p.lat, lng: p.lng, label: p.name || TYPES[p.type] }; if (!route.from && userPos) route.from = { ...userPos, label: t('Mi ubicación') };
    route.result = null; drawRoute(); openRoute();
  } }));
  if (p.canDelete) c.append(el('button', { className: 'btn danger', style: 'margin:10px 0', textContent: t('Borrar este sitio'), onclick: async () => {
    if (!confirm(t('¿Borrar el sitio y todas sus reseñas?'))) return;
    try { await api('DELETE', '/places/' + p.id); markers.get(p.id)?.remove(); markers.delete(p.id); places.delete(p.id); $('panel').hidden = true; }
    catch (x) { alert(x.message); }
  } }));
  p.reviews.forEach((r) => c.append(reviewRow(r, false, () => openPlace(p.id))));
}

// ---------- perfil ----------
const openProfile = (username) => visit('user:' + username.toLowerCase(), () => loadProfile(username));
async function loadProfile(username) {
  content().append(el('p', { className: 'muted', textContent: t('Cargando…') }));
  const vid = viewId;
  let u;
  try { u = await api('GET', '/users/' + encodeURIComponent(username)); }
  catch (x) { return stale(vid) || content().append(el('p', { className: 'err', textContent: x.message })); }
  if (stale(vid)) return;
  const c = content();
  const own = u.relation === 'self';
  const avatar = avatarEl(u, 84);
  c.append(el('div', { className: 'cover' }), el('div', { className: 'head' }, avatar,
    el('div', {}, el('h2', { textContent: '@' + u.username }, u.isAdmin ? el('span', { className: 'badge', textContent: 'mod' }) : null, u.isSeed ? demoBadge() : null),
      el('div', { className: 'sub', textContent: t('En Poyo desde {d}', { d: new Date(u.joined).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }) }) }))));
  if (own) {
    const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
    file.onchange = async () => {
      try {
        const f = await uploadPhoto(await squareAvatar(file.files[0]));
        setMe(await api('PUT', '/me', { avatar: f })); loadProfile(username);
      } catch (x) { alert(x.message); }
    };
    c.append(el('div', { className: 'acts', style: 'margin:0 0 10px' }, file,
      el('button', { className: 'btn', textContent: u.avatar ? t('📷 Cambiar foto') : t('📷 Añadir foto de perfil'), onclick: () => file.click() }),
      u.avatar ? el('button', { className: 'btn', textContent: t('Quitar'), onclick: async () => { setMe(await api('PUT', '/me', { avatar: '' })); loadProfile(username); } }) : null));
    const bio = el('input', { value: u.bio, placeholder: t('Escribe algo sobre ti…'), maxLength: 200 });
    bio.onchange = () => api('PUT', '/me', { bio: bio.value }).then(setMe);
    c.append(bio);
  } else if (u.bio) c.append(el('p', { textContent: u.bio }));
  const stat = (n, label) => el('div', {}, el('b', { textContent: n }), label);
  c.append(el('div', { className: 'stats' }, stat(u.reviewCount, t('reseñas')), stat(u.photoCount, t('fotos')),
    stat(u.avg ?? '–', t('nota media')), stat(u.friendCount, t('amigos'))));

  const acts = el('div', { className: 'acts', style: 'flex-wrap:wrap' });
  if (own) acts.append(el('button', { className: 'btn', textContent: t('Ajustes'), onclick: openSettings }),
    el('button', { className: 'btn', textContent: t('Cerrar sesión'), onclick: async () => { await sb.auth.signOut(); setMe(null); $('panel').hidden = true; } }));
  else acts.append(friendButton(u, () => loadProfile(username)));
  if (u.reviews.length) acts.append(el('button', { className: 'btn fill', textContent: t(own ? t('🗺 Mis reseñas en el mapa') : t('🗺 Sus reseñas en el mapa')),
    onclick: () => showOnMap(u.reviews.map((r) => ({ ...r, author: u.username, avatar: u.avatar })), own ? t('Mis reseñas') : '@' + u.username) }));
  c.append(acts);

  if (u.friends.length) c.append(el('h3', { textContent: own ? t('Mis amigos') : t('Amigos') }),
    el('div', { className: 'friendrow' }, ...u.friends.map((f) => el('button', { className: 'plain fr', title: '@' + f.username, onclick: () => openProfile(f.username) },
      avatarEl(f, 44), el('span', { textContent: f.username })))));

  c.append(el('h3', { textContent: own ? t('Mis reseñas') : t('Reseñas') }));
  if (!u.reviews.length) c.append(el('p', { className: 'muted', textContent: own ? t('Todavía no has reseñado nada. Toca un sitio del mapa para empezar.') : t('Todavía no ha reseñado nada.') }));
  u.reviews.forEach((r) => c.append(reviewRow({ ...r, author: u.username }, true, () => loadProfile(username))));
}

// Recorta la foto al cuadrado central y la deja en 256 px.
function squareAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), cv = el('canvas', { width: 256, height: 256 });
      cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Foto no válida')))), 'image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error(t('Foto no válida')));
    img.src = URL.createObjectURL(file);
  });
}

const openSettings = () => visit('settings', loadSettings);
function loadSettings() {
  const c = content();
  const neu = el('input', { type: 'password', placeholder: t('Nueva contraseña (mín. 6)'), autocomplete: 'new-password', minLength: 6 });
  const msg = el('div', { className: 'err' });
  const pwForm = el('form', {}, el('h3', { textContent: t('Cambiar contraseña') }),
    el('div', { className: 'muted', textContent: t('Es la contraseña de tu cuenta de Marabunta Labs: cambia también en sus otras apps.') }), neu, msg, el('button', { className: 'submit', textContent: t('Guardar') }));
  pwForm.onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: neu.value });
    msg.style.color = error ? '' : 'green'; msg.textContent = error ? error.message : t('Contraseña actualizada'); if (!error) neu.value = '';
  };
  const dmsg = el('div', { className: 'err' });
  const delForm = el('form', {}, el('h3', { textContent: t('Borrar mis datos de Poyo') }),
    el('div', { className: 'muted', textContent: t('Se eliminan tu perfil, reseñas, fotos y amistades de Poyo. Tu cuenta de Marabunta Labs y tus otras apps no se tocan. No se puede deshacer.') }), dmsg,
    el('button', { className: 'btn danger', textContent: t('Borrar mis datos de Poyo') }));
  delForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm(t('¿Seguro? Esto no se puede deshacer.'))) return;
    try { await api('DELETE', '/me'); setMe(null); $('panel').hidden = true; location.reload(); }
    catch (x) { dmsg.textContent = x.message; }
  };
  c.append(el('h2', { textContent: t('Ajustes') }), el('button', { className: 'link', textContent: t('← Volver'), onclick: () => step(-1) }), pwForm, delForm);
}

function friendButton(u, refresh) {
  const act = (method, label, cls = '') => el('button', { className: 'btn ' + cls, textContent: label, onclick: async () => {
    if (!(await requireLogin(t('Inicia sesión para añadir amigos')))) return;
    await api(method, '/friends/' + encodeURIComponent(u.username)); refresh();
  } });
  return {
    none: () => act('POST', t('➕ Añadir amigo'), 'fill'),
    sent: () => act('DELETE', t('Solicitud enviada · cancelar')),
    received: () => act('POST', t('✔ Aceptar solicitud'), 'fill'),
    friends: () => act('DELETE', t('Amigos ✓ · eliminar'), 'danger'),
  }[u.relation || 'none']();
}

// ---------- social ----------
const userRow = (u) => el('button', { className: 'plain urow', onclick: () => openProfile(u.username) }, avatarEl(u, 36),
  el('span', {}, el('b', { textContent: '@' + u.username }), u.isSeed ? demoBadge() : null, u.bio ? el('small', { textContent: u.bio }) : null));
const openSocial = (tab = 'feed') => visit('social:' + tab, () => loadSocial(tab));
async function loadSocial(tab) {
  const c = content(), vid = viewId;
  const tabs = el('div', { className: 'tabs' }, ...[['feed', t('Novedades')], ['friends', t('Amigos')], ['search', t('Buscar gente')], ...(me.isAdmin ? [['mod', 'Mod']] : [])].map(([k, label]) =>
    el('button', { className: tab === k ? 'on' : '', textContent: label, onclick: () => openSocial(k) })));
  c.append(el('h2', { textContent: t('Social') }), tabs);
  try {
    if (tab === 'feed') {
      const feed = await api('GET', '/feed');
      if (stale(vid)) return;
      if (feed.length) c.append(el('button', { className: 'btn fill', style: 'margin-bottom:8px', textContent: t('🗺 Ver estas reseñas en el mapa'),
        onclick: () => showOnMap(feed, t('Novedades')) }));
      if (!feed.length) c.append(el('p', { className: 'muted', textContent: t('Aquí verás las reseñas de tus amigos. ¡Busca gente y añádela!') }));
      feed.forEach((r) => c.append(el('div', { className: 'feeditem' }, whoLine(r, true), reviewRow(r, true))));
    } else if (tab === 'friends') {
      const f = await api('GET', '/friends');
      if (stale(vid)) return;
      const section = (title, list, buttons) => {
        if (!list.length) return;
        c.append(el('h3', { textContent: title }));
        list.forEach((u) => c.append(el('div', { className: 'row' }, userRow(u), el('div', { className: 'acts' }, ...buttons(u)))));
      };
      const call = (method, u) => () => api(method, '/friends/' + encodeURIComponent(u.username)).then(() => openSocial('friends'));
      section(t('Solicitudes recibidas'), f.incoming, (u) => [el('button', { className: 'btn fill', textContent: t('Aceptar'), onclick: call('POST', u) }),
        el('button', { className: 'btn', textContent: t('Rechazar'), onclick: call('DELETE', u) })]);
      section(t('Enviadas'), f.outgoing, (u) => [el('button', { className: 'btn', textContent: t('Cancelar'), onclick: call('DELETE', u) })]);
      section(t('Mis amigos'), f.friends, (u) => [el('button', { className: 'btn', textContent: t('Ver perfil'), onclick: () => openProfile(u.username) })]);
      if (!f.friends.length && !f.incoming.length && !f.outgoing.length)
        c.append(el('p', { className: 'muted', textContent: t('Aún no tienes amigos.') }), el('button', { className: 'btn fill', textContent: t('🔎 Buscar gente'), onclick: () => openSocial('search') }));
    } else if (tab === 'mod') {
      const reports = await api('GET', '/admin/reports');
      if (stale(vid)) return;
      if (!reports.length) c.append(el('p', { className: 'muted', textContent: t('Sin denuncias pendientes 🎉') }));
      reports.forEach((rp) => c.append(el('div', { className: 'report' },
        el('div', { className: 'muted', textContent: t('Denunciada por @{by}: {reason}', { by: rp.by, reason: rp.reason || t('sin motivo') }) }),
        el('div', {}, userLink(rp.review.author)), reviewRow(rp.review, true),
        el('div', { className: 'acts' },
          el('button', { className: 'btn danger', textContent: t('Borrar reseña'), onclick: async () => { await api('DELETE', '/reviews/' + rp.review.id); openSocial('mod'); } }),
          el('button', { className: 'btn', textContent: t('Descartar'), onclick: async () => { await api('DELETE', '/admin/reports/' + rp.id); openSocial('mod'); } }),
          el('button', { className: 'btn danger', textContent: t('Expulsar usuario'), onclick: async () => {
            if (confirm(t('¿Borrar la cuenta de @{user} y todo su contenido?', { user: rp.review.author }))) { await api('DELETE', '/admin/users/' + encodeURIComponent(rp.review.author)); openSocial('mod'); } } })))));
    } else {
      const results = el('div');
      const q = el('input', { placeholder: t('Buscar usuario…'), maxLength: 20 });
      const title = el('h3', { textContent: t('Gente con más reseñas') }); // sin texto, se sugieren usuarios
      const load = async () => {
        const list = await api('GET', '/users?q=' + encodeURIComponent(q.value));
        title.textContent = q.value.trim().length < 2 ? t('Gente con más reseñas') : list.length ? t('Resultados') : t('Nadie con ese nombre');
        results.replaceChildren(...list.filter((u) => u.relation !== 'self').map((u) => el('div', { className: 'row' }, userRow(u), friendButton(u, load))));
      };
      let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(load, 250); };
      c.append(q, title, results); load();
    }
  } catch (x) { c.append(el('p', { className: 'err', textContent: x.message })); }
}

// ---------- añadir sitio ----------
let draft = null;
function setAdding(v) { adding = v; $('hint').hidden = !v; $('map').classList.toggle('adding', v); }
$('add').onclick = async () => { if (await requireLogin(t('Inicia sesión para añadir sitios'))) setAdding(true); };
$('cancel').onclick = (e) => { e.preventDefault(); setAdding(false); };
function closeDraft() { draft?.remove(); draft = null; }
$('close').addEventListener('click', closeDraft);
map.on('click', (e) => {
  if (!adding) return;
  setAdding(false); closeDraft();
  draft = L.marker(e.latlng, { draggable: true, opacity: 0.8 }).addTo(map);
  const c = content();
  const name = el('input', { placeholder: t('Ej. Banco bajo el olmo'), maxLength: 80 });
  const type = el('select', {}, ...Object.entries(TYPES).map(([k, v]) => el('option', { value: k, textContent: v })));
  const f = reviewFields(undefined, 'bench');
  type.onchange = () => f.setType(type.value);
  const err = f.err;
  const form = el('form', {}, el('h3', { textContent: t('Nuevo sitio') }),
    el('div', { className: 'muted', textContent: t('Arrastra el marcador para ajustar la posición.') }),
    el('label', { textContent: t('Nombre (opcional)') }, name), el('label', { textContent: t('Tipo') }, type),
    el('h3', { textContent: t('⭐ Tu opinión (opcional, pero ayuda mucho)') }), ...f.nodes,
    el('button', { className: 'submit', textContent: t('Crear sitio') }),
    el('button', { type: 'button', className: 'btn', textContent: t('Cancelar'), onclick: () => { closeDraft(); $('panel').hidden = true; } }));
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const ll = draft.getLatLng();
    if (!f.rating() && (f.text.value.trim() || f.files.length)) return (err.textContent = t('Elige una nota para publicar tu opinión'));
    try {
      let p = await api('POST', '/places', { lat: ll.lat, lng: ll.lng, name: name.value, type: type.value });
      if (f.rating()) {
        try { p = await api('POST', `/places/${p.id}/reviews`, { rating: f.rating(), ratings: f.ratings(), text: f.text.value, photos: f.files }); }
        catch { /* el sitio ya existe: se puede reseñar desde su ficha */ }
      }
      closeDraft(); upsert(p); openPlace(p.id);
    } catch (x) { err.textContent = x.message; }
  };
  c.append(form);
});

// ---------- ruta con paradas: sin tramos largos sin banco (o sin fuente) ----------
const route = { from: null, to: null, kind: 'bench', gap: 250, picking: null, result: null, layer: L.layerGroup().addTo(map) };
const openRoute = () => visit('route', renderRoute);
const setPicking = (v) => { route.picking = v; $('map').classList.toggle('picking', !!v); };
map.on('click', (e) => {
  if (!route.picking) return;
  route[route.picking] = { lat: e.latlng.lat, lng: e.latlng.lng, label: '' }; setPicking(null); route.result = null; drawRoute(); openRoute();
});
const endIcon = (txt) => L.divIcon({ className: '', html: `<div class="rend">${txt}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
const km = (m) => (m / 1000).toFixed(1);
function drawRoute() { // origen, destino y, si ya está calculada, la ruta con sus paradas y los tramos largos en rojo
  route.layer.clearLayers();
  if (route.from) L.marker([route.from.lat, route.from.lng], { icon: endIcon('A') }).addTo(route.layer);
  if (route.to) L.marker([route.to.lat, route.to.lng], { icon: endIcon('B') }).addTo(route.layer);
  const r = route.result; if (!r) return;
  L.polyline(r.geometry, { color: '#2f7d4f', weight: 5, opacity: 0.85 }).addTo(route.layer);
  const cum = [0]; r.geometry.forEach((p, i) => { if (i) cum.push(cum[i - 1] + L.latLng(r.geometry[i - 1]).distanceTo(L.latLng(p))); });
  r.gaps.forEach((g) => L.polyline(r.geometry.filter((_, i) => cum[i] >= g.from && cum[i] <= g.to), { color: '#d93025', weight: 6, dashArray: '2 10', lineCap: 'round' }).addTo(route.layer));
  r.stops.forEach((s) => {
    const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div class="rstop">${EMOJI[s.type] || EMOJI.bench}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(route.layer);
    m.bindTooltip(`${s.name || TYPES[s.type]} · ${away(s.at)}`);
    m.on('click', () => openPlace(s.id));
  });
}
function renderRoute() {
  const c = content();
  const where = (k, title) => {
    const p = route[k], on = route.picking === k;
    return el('div', { className: 'rrow' }, el('b', { textContent: title }),
      el('span', { textContent: p ? (p.label || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`) : t('Sin elegir') }),
      el('button', { type: 'button', className: 'btn', textContent: t('Mi ubicación'), onclick: () => {
        const go = (pos) => { route[k] = { ...pos, label: t('Mi ubicación') }; route.result = null; drawRoute(); renderRoute(); };
        if (userPos) go(userPos); else navigator.geolocation?.getCurrentPosition((pp) => { userPos = { lat: pp.coords.latitude, lng: pp.coords.longitude }; go(userPos); }, () => alert(t('No se pudo obtener tu ubicación')));
      } }),
      el('button', { type: 'button', className: 'btn' + (on ? ' on' : ''), textContent: on ? t('Toca el mapa…') : t('Elegir en el mapa'), onclick: () => { setPicking(on ? null : k); renderRoute(); } }));
  };
  const kind = el('select', {}, el('option', { value: 'bench', textContent: t('🪑 Bancos') }), el('option', { value: 'fountain', textContent: t('💧 Fuentes') }));
  kind.value = route.kind; kind.onchange = () => { route.kind = kind.value; route.result = null; drawRoute(); renderRoute(); };
  const gap = el('select', {}, ...[100, 150, 250, 400, 600].map((m) => el('option', { value: m, textContent: t('Máx. {m} m entre paradas', { m }) })));
  gap.value = route.gap; gap.onchange = () => { route.gap = Number(gap.value); route.result = null; drawRoute(); renderRoute(); };
  const err = el('div', { className: 'err' }), out = el('div', { className: 'rsum' });
  const go = el('button', { className: 'submit', textContent: t('Calcular ruta'), onclick: async () => {
    err.textContent = '';
    if (!route.from || !route.to) return (err.textContent = t('Elige origen y destino'));
    go.disabled = true; go.textContent = t('Calculando…');
    try {
      route.result = await api('GET', `/route?from=${route.from.lat},${route.from.lng}&to=${route.to.lat},${route.to.lng}&kind=${route.kind}&gap=${route.gap}`);
      drawRoute(); map.fitBounds(L.polyline(route.result.geometry).getBounds(), { padding: [40, 40] }); renderRoute();
    } catch (x) { err.textContent = x.message; go.disabled = false; go.textContent = t('Calcular ruta'); }
  } });
  c.append(el('h2', { textContent: t('Ruta con paradas') }), el('div', { className: 'sub', textContent: t('Una ruta a pie sin tramos largos sin un banco donde sentarte (o una fuente donde beber).') }),
    where('from', t('Origen')), where('to', t('Destino')), el('div', { className: 'rrow' }, kind, gap), go, err, out);
  const r = route.result;
  if (r) {
    out.append(el('div', { textContent: t('{km} km · {min} min a pie · {n} paradas en la ruta', { km: km(r.distance), min: Math.round(r.duration / 60), n: r.stops.length }) }),
      el('div', { className: r.ok ? 'okk' : 'warn', textContent: r.ok ? t('✅ Ningún tramo supera {m} m', { m: route.gap }) : t('⚠️ Tramos de más de {m} m sin dónde parar: {n} (con los sitios conocidos)', { n: r.gaps.length, m: route.gap }) }),
      el('div', { className: 'muted', textContent: t('Mayor tramo sin parada: {m} m', { m: r.maxGap }) }));
    out.append(el('button', { className: 'btn', style: 'margin-top:8px', textContent: t('Quitar ruta'), onclick: () => { route.result = null; route.from = route.to = null; drawRoute(); renderRoute(); } }));
  }
}
$('routebtn').onclick = openRoute;

// ---------- ubicación e inicio ----------
function locate(first) {
  navigator.geolocation?.getCurrentPosition(
    (pos) => { userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; map.setView([userPos.lat, userPos.lng], 18); },
    () => { if (!first) alert('No pude obtener tu ubicación'); });
}
$('locate').onclick = () => locate(false);

(async () => {
  try { await initAuth(); } catch { alert(t('No se pudo conectar con el servicio de cuentas')); }
  try { const m = await api('GET', '/me'); if (m?.needsProfile) openChooseName(); else setMe(m); } catch {}
  try { (await api('GET', '/places')).forEach(upsert); } catch {}
  locate(true); loadOSM();
})();
