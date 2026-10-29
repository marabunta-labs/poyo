// Cada texto pasado por t('…') en public/ y cada mensaje de error del servidor debe tener su traducción al inglés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = { document: { documentElement: {}, querySelectorAll: () => [], getElementById: () => null, title: '' }, navigator: { language: 'es' }, localStorage: { getItem: () => null }, location: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/i18n.js', 'utf8') + ';this.DICT = DICT;', ctx);
const en = ctx.DICT.en;
const literal = /\bt\('((?:[^'\\\n]|\\.)*)'/g;

test('los t() del cliente están traducidos', () => {
  const missing = [];
  for (const f of ['public/app.js']) for (const [, key] of fs.readFileSync(f, 'utf8').matchAll(literal)) if (!(key in en)) missing.push(key);
  assert.deepEqual([...new Set(missing)], []);
});
test('los mensajes de error del servidor están traducidos', () => {
  const missing = [];
  for (const [, key] of fs.readFileSync('server.js', 'utf8').matchAll(/fail\(\d+, '((?:[^'\\\n]|\\.)*)'/g)) if (!(key in en)) missing.push(key);
  assert.deepEqual([...new Set(missing)], []);
});
