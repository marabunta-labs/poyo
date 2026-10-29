// Supabase simulado SOLO para pruebas: acceso con contraseña, /auth/v1/user y Storage en memoria.
// uso: MOCK_USERS='{"lucia@test.local":"<uuid>"}' node test/mock-supabase.js   (contraseña de todos: secret1)
const http = require('node:http');
const users = JSON.parse(process.env.MOCK_USERS || '{}');
const files = new Map();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const userOf = (id, email) => ({ id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
// supabase-js sube los Blob como multipart/form-data: nos quedamos con el contenido del archivo.
const filePart = (raw, type = '') => {
  const m = /boundary=(.+)$/.exec(type); if (!m) return raw;
  const sep = Buffer.from('--' + m[1]); let pos = 0;
  while ((pos = raw.indexOf(sep, pos)) !== -1) {
    const head = raw.indexOf('\r\n\r\n', pos), next = raw.indexOf(sep, pos + sep.length);
    if (head === -1 || next === -1) break;
    if (/filename=/.test(raw.subarray(pos, head).toString('latin1'))) return raw.subarray(head + 4, next - 2);
    pos = next;
  }
  return raw;
};
const subOf = (req) => { try { return JSON.parse(Buffer.from((req.headers.authorization || '').split('.')[1], 'base64url')).sub; } catch { return null; } };
http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks);
  const json = (code, o) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname === '/auth/v1/token') {
    const { email, password } = JSON.parse(raw.toString());
    const id = users[email]; if (!id || password !== 'secret1') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
    return json(200, { access_token: jwt(id, email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + id, user: userOf(id, email) });
  }
  if (url.pathname === '/auth/v1/user') {
    const sub = subOf(req); const email = Object.keys(users).find((e) => users[e] === sub);
    return sub && email ? json(200, userOf(sub, email)) : json(401, { msg: 'bad jwt' });
  }
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204, cors); return res.end(); }
  const st = url.pathname.match(/^\/storage\/v1\/object\/(?:public\/)?poyo-photos\/(.+)$/);
  if (st && req.method === 'POST') { if (!subOf(req) || !st[1].startsWith(subOf(req) + '/')) return json(403, { error: 'Unauthorized' }); files.set(st[1], filePart(raw, req.headers['content-type'])); return json(200, { Key: 'poyo-photos/' + st[1] }); }
  if (st && req.method === 'GET') { const f = files.get(st[1]); res.writeHead(f ? 200 : 404, { ...cors, 'Content-Type': 'image/jpeg' }); return res.end(f); }
  json(404, { error: 'mock: ' + url.pathname });
}).listen(54401, () => console.log('mock supabase en 54401'));
