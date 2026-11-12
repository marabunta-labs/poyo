// Graba la app en formato móvil vertical (1080x1920) con rótulos en inglés y toques animados.
//   node promo/record.mjs [url] [carpeta-de-fotogramas]      (por defecto http://localhost:3055/ y promo/frames)
// Necesita el servidor de Poyo en marcha con los datos demo (scripts/seed-demo.js) y la zona densa de Madrid (promo/seed-madrid.mjs).
// El montaje (fotogramas → mp4) lo hace promo/assemble.mjs. Usa patchright (Chromium) de la extensión de VS Code.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/pablo.roas/.vscode/extensions/danielsanmedium.dscodegpt-3.24.77/standalone/node_modules/patchright/index.mjs';

const URL_ = process.argv[2] || 'http://localhost:3055/';
const FRAMES = path.resolve(process.argv[3] || new URL('./frames', import.meta.url).pathname);
fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });

const W = 432, H = 768, DPR = 2.5; // 432x768 css px × 2.5 = 1080x1920
const RETIRO = { latitude: 40.4153, longitude: -3.6844 };
const T = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'en-US', geolocation: RETIRO, permissions: ['geolocation'] });
const page = await ctx.newPage();

// ---- rótulos, tarjetas y toques: se inyectan en la página para que salgan en la grabación ----
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = `
      #pcap { position:fixed; left:14px; right:14px; top:66px; z-index:2147483000; padding:11px 14px; border-radius:16px; background:rgba(16,22,18,.86); color:#fff;
        font:700 20px/1.25 -apple-system,system-ui,sans-serif; text-align:center; opacity:0; transform:translateY(-8px); transition:opacity .35s, transform .35s; pointer-events:none; box-shadow:0 6px 24px #0007; }
      #pcap.on { opacity:1; transform:none; }
      #pcard { position:fixed; inset:0; z-index:2147483100; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; text-align:center; color:#fff; padding:30px;
        background:linear-gradient(160deg,#2f7d4f,#143d27); opacity:0; transition:opacity .6s; pointer-events:none; font-family:-apple-system,system-ui,sans-serif; }
      #pcard.on { opacity:1; }
      #pcard .logo { font-size:84px; line-height:1; } #pcard h1 { margin:0; font-size:64px; letter-spacing:1px; } #pcard p { margin:0; font-size:26px; line-height:1.3; opacity:.95; }
      #pcard .url { margin-top:18px; padding:12px 20px; border-radius:99px; background:#fff; color:#1d5a37; font-weight:800; font-size:21px; }
      .pripple { position:fixed; width:54px; height:54px; margin:-27px 0 0 -27px; border-radius:50%; background:rgba(255,255,255,.55); border:3px solid #fff; z-index:2147483200; pointer-events:none; animation:prp .7s ease-out forwards; }
      @keyframes prp { from { transform:scale(.3); opacity:1; } to { transform:scale(1.4); opacity:0; } }
      .pglow { outline:4px solid #ffd54a !important; outline-offset:3px; border-radius:10px; }`;
    document.head.append(st);
    const cap = document.createElement('div'); cap.id = 'pcap'; document.body.append(cap);
    const card = document.createElement('div'); card.id = 'pcard'; document.body.append(card);
  });
});

// ---- captura de fotogramas por CDP (screencast) con su marca de tiempo ----
const cdp = await ctx.newCDPSession(page);
const stamps = []; let n = 0, recording = false;
cdp.on('Page.screencastFrame', async (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  if (!recording) return;
  const name = `f_${String(++n).padStart(6, '0')}.jpg`;
  fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, 'base64'));
  stamps.push([name, f.metadata.timestamp]);
});

if (process.env.DEBUG) { page.on('pageerror', (e) => console.error('PAGEERROR', e.message)); page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text().slice(0, 200))); page.on('request', (r) => r.url().includes('/api/route') && console.error(((Date.now() - T) / 1000).toFixed(1), '→', r.url().replace(URL_, '/'))); page.on('response', (r) => r.url().includes('/api/route') && console.error(((Date.now() - T) / 1000).toFixed(1), '←', r.status())); page.on('requestfailed', (r) => console.error('fallo', r.url().slice(0, 90), r.failure()?.errorText)); }
const cap = async (text, ms = 2500) => { await page.evaluate((t) => { const c = document.getElementById('pcap'); c.textContent = t; c.classList.add('on'); }, text); await sleep(ms); };
const uncap = async () => { await page.evaluate(() => document.getElementById('pcap').classList.remove('on')); await sleep(350); };
const card = async (html, on, ms = 0) => { await page.evaluate(([h, o]) => { const c = document.getElementById('pcard'); if (h) c.innerHTML = h; c.classList.toggle('on', o); }, [html, on]); await sleep(ms); };
const ripple = (x, y) => page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'pripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.append(r); setTimeout(() => r.remove(), 800); }, [x, y]);
const tapXY = async (x, y, after = 700) => {
  await ripple(x, y); await sleep(160); await page.touchscreen.tap(x, y); await sleep(after);
  if (!page.url().startsWith(URL_)) throw new Error(`La página navegó a ${page.url()} tras tocar (${Math.round(x)}, ${Math.round(y)})`);
};
const tap = async (sel, after = 700) => { const loc = typeof sel === 'string' ? page.locator(sel).first() : sel; await loc.scrollIntoViewIfNeeded().catch(() => {}); await sleep(250); const b = await loc.boundingBox(); await tapXY(b.x + b.width / 2, b.y + b.height / 2, after); };
const glow = (sel, on = true) => page.evaluate(([s, o]) => document.querySelector(s)?.classList.toggle('pglow', o), [sel, on]);
const setLocation = async (lat, lng) => { await ctx.setGeolocation({ latitude: lat, longitude: lng }); await tap('#locate', 1200); }; // el mapa se centra en ella
const zoom = async (dir, times, gap = 650) => { for (let i = 0; i < times; i++) { await tap(dir > 0 ? '.leaflet-control-zoom-in' : '.leaflet-control-zoom-out', gap); } };
const closePanel = async () => { if (await page.locator('#panel:not([hidden])').count()) await tap('#close', 700); };
const panelScroll = (top) => page.evaluate((t) => document.getElementById('panel').scrollTo({ top: t, behavior: 'smooth' }), top);
// píxel (css) de un punto respecto al centro del mapa, a un nivel de zoom dado (proyección Mercator de Leaflet)
const merc = (lat, lng, z) => { const s = 256 * 2 ** z, r = (lat * Math.PI) / 180; return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s]; };
const pxAt = (center, p, z) => { const [cx, cy] = merc(center[0], center[1], z), [x, y] = merc(p[0], p[1], z); return [W / 2 + (x - cx), H / 2 + (y - cy)]; };

// ---------------------------------------------------------------------------------------------
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#gamebtn', { timeout: 90000 });
await sleep(3500); // el mapa se centra solo en el Retiro (ubicación simulada) y carga los sitios
await card('<div class="logo">🪑</div><h1>Poyo</h1><p>Find a place to sit.<br>Anywhere in Spain.</p>', true);
recording = true; await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
const t0 = Date.now();
await sleep(2000);
await card(null, false, 600);

// 1) el mapa: cientos de miles de sitios, grupos al alejar
await cap('216,000+ benches, fountains & shops on one map', 1900);
await uncap();
await cap('Zoom out to see what is around you', 400);
await zoom(-1, 3, 600);
await sleep(1300);
const clusters = await page.locator('.cl').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: Number(e.textContent) }; }).filter((c) => c.x > 30 && c.x < 400 && c.y > 170 && c.y < 420));
if (clusters.length) { clusters.sort((a, b) => b.n - a.n); await tapXY(clusters[0].x, clusters[0].y, 1400); }
await uncap();

// 2) una ficha con reseñas por categorías y Street View
const places = await page.evaluate(async () => (await (await fetch('/api/places')).json()));
const near = places.filter((p) => p.type === 'bench' && p.count >= 2 && Math.abs(p.lat - 40.4153) < 0.012 && Math.abs(p.lng + 3.6844) < 0.02).sort((a, b) => b.avg - a.avg);
const target = near[0];
await closePanel();
await setLocation(target.lat, target.lng);
let opened = false;
if (process.env.DEBUG) await page.screenshot({ path: process.env.DEBUG + '/pre.png' });
for (const [dx, dy] of [[0, -16], [0, -24], [0, -8], [0, 0], [6, -16], [-6, -16], [0, -32]]) {
  await tapXY(W / 2 + dx, H / 2 + dy, 1300);
  const info = await page.evaluate(() => ({ panel: !!document.getElementById('panel'), hidden: document.getElementById('panel')?.hidden, h2: document.querySelector('#content h2')?.textContent, reviews: document.querySelectorAll('#content .review').length, url: location.href }));
  if (process.env.DEBUG) console.error('intento', dx, dy, JSON.stringify(info));
  if (info.reviews) { opened = true; break; }
  await closePanel();
}
if (!opened) console.error('AVISO: no se abrió una ficha con reseñas');
await cap('Real reviews, rated by category', 1800);
await panelScroll(260); await sleep(1800);
await uncap();
await cap('Check any spot on Street View', 400);
await page.evaluate(() => document.querySelector('#panel a.btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await sleep(800); await glow('#panel a.btn'); await sleep(1800); await glow('#panel a.btn', false);
await uncap();

// 3) ruta con paradas: bancos cada 150 m y fuentes cada 400 m
await closePanel();
const A = [40.4240, -3.7177], B = [40.4190, -3.7143], mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
await setLocation(mid[0], mid[1]);
await zoom(-1, 2, 700);
await cap('Plan walks with rest stops', 800);
await tap('#routebtn', 900);
const pick = async (idx, p) => { await tap(page.locator('#content .rrow button', { hasText: 'Pick on the map' }).nth(idx), 700); const [x, y] = pxAt(mid, p, 16); await tapXY(x, y, 1100); };
await pick(0, A); await pick(1, B);
await tap(page.locator('#content .rchk input').nth(1), 400); // fuentes
const sels = page.locator('#content select');
await sels.nth(0).selectOption('150'); await sleep(350);
await sels.nth(1).selectOption('400'); await sleep(600);
await uncap(); await cap('A bench every 150 m. A fountain every 400 m.', 600);
console.error(((Date.now() - T) / 1000).toFixed(1), 'tap Get route');
await tap(page.locator('#content .submit'), 800);
try { await page.waitForSelector('.rsum .okk, .rsum .warn', { timeout: 45000 }); }
catch (e) { console.error(((Date.now() - T) / 1000).toFixed(1), 'La ruta no terminó. Panel:', (await page.innerText('#content').catch(() => '')).replace(/\n/g, ' | ')); if (process.env.DEBUG) await page.screenshot({ path: process.env.DEBUG + '/route-fail.png' }); throw e; }
await sleep(2000);
await closePanel(); await sleep(2800);
await uncap();

// 4) modo juego: instrucciones, aros de colores por grupo y filtro
await cap('New: game mode! Claim benches with friends', 700);
await tap('#gamebtn', 1200);
await panelScroll(240); await sleep(1800);
await panelScroll(0); await sleep(500);
await tap(page.locator('#content input[type=checkbox]').first(), 1200); // activar el modo juego
await closePanel();
await uncap();
await setLocation(RETIRO.latitude, RETIRO.longitude);
await zoom(-1, 2, 700); await sleep(1500);
await cap('Colored rings show who rules each bench', 2600);
await uncap();
const opts = await page.locator('#gamefilter option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
await page.locator('#gamefilter').focus(); await sleep(300);
const grp = (await page.locator('#gamefilter option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]))).find(([v]) => !['all', 'bases', 'mine'].includes(v));
await cap('Filter the map by group', 700);
await glow('#gamefilter'); await sleep(900);
await page.selectOption('#gamefilter', grp[0]); await sleep(2200); await glow('#gamefilter', false);
await uncap();
// una base: quién manda y cuántos puntos
const ringed = await page.locator('.pin[style*="box-shadow"], .emo[style*="box-shadow"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).filter((p) => p.x > 30 && p.x < 400 && p.y > 170 && p.y < 700 && !(p.x > 225 && p.y > 140 && p.y < 650)));
if (ringed.length) { await cap('Check in on the spot to score points', 700); await tapXY(ringed[0].x, ringed[0].y, 2300); await uncap(); }

// 5) cierre
await closePanel();
await card('<div class="logo">🪑</div><h1>Poyo</h1><p>Sit. Review. Conquer.</p><div class="url">poyo-megc.onrender.com</div>', true, 3000);
const dur = (Date.now() - t0) / 1000;
await cdp.send('Page.stopScreencast'); recording = false;
await browser.close();

fs.writeFileSync(path.join(FRAMES, 'stamps.json'), JSON.stringify(stamps));
console.log(`${stamps.length} fotogramas en ${dur.toFixed(1)} s (${(stamps.length / dur).toFixed(1)} fps) → ${FRAMES}`);
