// F-25: pré-condições dos ataques. A ponte existe, dá painéis com as funções que os ataques usam e não tem lógica: só importa do
// pacote (fora de tests/) e adapta a forma. O mod exporta criarRelogio() (o nome que o contrato fixa) e o painel.tsx usa uma
// instância, liga os eventos do contrato e já não guarda o timer numa variável de módulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { ROOT, PONTE, api, modPainel } from './helpers.mjs';

test('C0: a ponte tests/ponte/f-25.mjs exporta criar(), e cada painel tem armar, vigiar, volta, evento e ecra', async () => {
  const u = await api();
  assert.equal(typeof u.criar, 'function', 'falta criar()');
  const p = u.criar();
  for (const f of ['armar', 'vigiar', 'volta', 'evento', 'ecra']) assert.equal(typeof p[f], 'function', 'falta painel.' + f);
  assert.notEqual(u.criar(), p, 'criar() tem de dar um painel novo a cada chamada');
});

test('C0: a ponte não tem lógica (sem ciclos, condições, comparações com números, fs, JSON.parse nem relógio) e só importa do pacote', () => {
  assert.ok(existsSync(PONTE), 'ponte em falta');
  const src = readFileSync(PONTE, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const proibido = [/\bfor\s*\(/, /\bwhile\s*\(/, /\bif\s*\(/, /\bswitch\s*\(/, /\?[^.?]/, /JSON\.parse/, /node:fs/, /readFile|writeFile|statSync|\bstat\(/, /Date\.now|new Date|setTimeout|setInterval/, /[<>]=?\s*\d/, /\.(reduce|filter|sort|replace|match|test|slice|map)\(/, /\bclock\b|\bsleep\b|\bevery\b/];
  for (const re of proibido) assert.doesNotMatch(src, re, 'a ponte tem lógica: ' + re);
  const specs = [...src.matchAll(/\b(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
  assert.ok(specs.length > 0, 'a ponte não importa nada do pacote');
  for (const s of specs) {
    if (s === 'node:path' || s === 'node:url') continue;
    assert.ok(s.startsWith('.'), 'import fora do pacote: ' + s);
    assert.ok(!relative(ROOT, resolve(dirname(PONTE), s)).startsWith('tests'), 'a ponte importa de tests/: ' + s);
  }
});

test('C3: scripts/mod-painel.mjs exporta criarRelogio(), que dá { armar, vigiar, volta } novos a cada chamada', async () => {
  const m = await modPainel();
  assert.equal(typeof m.criarRelogio, 'function', 'falta criarRelogio em scripts/mod-painel.mjs');
  const a = m.criarRelogio(), b = m.criarRelogio();
  for (const f of ['armar', 'vigiar', 'volta']) assert.equal(typeof a[f], 'function', 'falta ' + f);
  assert.notEqual(a.volta, b.volta, 'cada relógio tem o seu estado: duas instâncias não partilham a volta');
});

test('C3: hooks/painel.tsx usa uma instância de criarRelogio(), liga os eventos do contrato e não guarda o timer numa variável de módulo', () => {
  const src = readFileSync(join(ROOT, 'hooks/painel.tsx'), 'utf8');
  assert.match(src, /criarRelogio\s*\(/, 'o painel.tsx não cria o relógio com criarRelogio()');
  for (const ev of ['session.start', 'command.run', 'ui.close', 'ui.render', 'tool.call', 'turn.complete', 'prompt.submit', 'agent.spawn', 'session.measure'])
    assert.match(src, new RegExp(`\\bon\\(\\s*['"]${ev.replace('.', '\\.')}['"]`), 'o painel.tsx não liga o evento ' + ev);
  assert.doesNotMatch(src, /^\s*let\s+timer\b/m, 'o timer continua numa variável de módulo (o defeito de hoje)');
  assert.doesNotMatch(src, /timer\s*\?\?=\s*\$\.clock\.every/, 'o timer só se cria uma vez (o defeito de hoje)');
});