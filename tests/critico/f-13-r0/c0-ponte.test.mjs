// F-13: pré-condições dos ataques. A ponte existe, exporta o que os ataques usam e não tem lógica; e o corpus de comandos
// cumpre o tamanho pedido, sem repetidos, e contém, literalmente, as listas do contrato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { ROOT, PONTE, api, QUAIS, gerar, hooksDe } from './helpers.mjs';
import { MATAR_BLOQUEIA, MATAR_PASSA, TESTES, FUNDO_PASSA } from './corpus-comandos.mjs';

test('C0: a ponte tests/ponte/f-13.mjs exporta scripts, eventoVigia, relogio e nomesNoEnv com a forma do topo de helpers.mjs', async () => {
  const u = await api();
  for (const q of QUAIS) {
    assert.equal(typeof u.scripts?.[q], 'string', 'scripts.' + q);
    assert.ok(!isAbsolute(u.scripts[q]) && !u.scripts[q].includes('..'), 'scripts.' + q + ' tem de ser relativo ao projeto: ' + u.scripts[q]);
    assert.equal(typeof u.nomesNoEnv?.[q], 'string', 'nomesNoEnv.' + q);
  }
  assert.equal(new Set(QUAIS.map((q) => u.scripts[q])).size, 3, 'os três scripts são ficheiros distintos');
  const nomes = QUAIS.map((q) => u.nomesNoEnv[q]);
  for (const a of nomes) for (const b of nomes) if (a !== b) assert.ok(!a.includes(b), `nomesNoEnv: «${b}» está dentro de «${a}»`);
  assert.equal(typeof u.eventoVigia, 'string');
  assert.equal(typeof u.relogio, 'function');
  const env = u.relogio(1234567890123);
  assert.ok(env && typeof env === 'object' && Object.keys(env).length > 0, 'relogio(ms) devolve as variáveis de ambiente');
  for (const v of Object.values(env)) assert.equal(typeof v, 'string');
});

test('C0: os três scripts existem num projeto gerado com os três hooks', async () => {
  const u = await api();
  const proj = await gerar(hooksDe(true, true, true));
  for (const q of QUAIS) assert.ok(existsSync(resolve(proj, u.scripts[q])), 'falta ' + u.scripts[q] + ' no projeto gerado');
});

test('C0: a ponte não tem lógica (sem ciclos, condições, comparações com números, fs, JSON.parse nem relógio) e só importa do pacote', () => {
  assert.ok(existsSync(PONTE), 'ponte em falta');
  const src = readFileSync(PONTE, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const proibido = [/\bfor\s*\(/, /\bwhile\s*\(/, /\bif\s*\(/, /\bswitch\s*\(/, /\?[^?.:]*:/, /JSON\.parse/, /node:fs/, /readFile|writeFile|statSync|\bstat\(/, /Date\.now|new Date/, /[<>]=?\s*\d/, /\.(reduce|filter|sort|map)\(/];
  for (const re of proibido) assert.doesNotMatch(src, re, 'a ponte tem lógica: ' + re);
  const specs = [...src.matchAll(/\b(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
  for (const s of specs) {
    if (s === 'node:path' || s === 'node:url') continue;
    assert.ok(s.startsWith('.'), 'import fora do pacote: ' + s);
    assert.ok(!relative(ROOT, resolve(dirname(PONTE), s)).startsWith('tests'), 'a ponte importa de tests/: ' + s);
  }
});

test('C0: o corpus de comandos tem ≥ 60 a bloquear e ≥ 60 a passar por hook, sem repetidos, e contém as listas do contrato', () => {
  const CONTRATO = {
    matarBloqueia: ['taskkill /IM node.exe', 'taskkill /F /IM node.exe', 'taskkill /im node.exe /t', 'killall node', 'pkill node', 'pkill -f node', 'Stop-Process -Name node', 'Get-Process node | Stop-Process', 'kill $(pgrep node)'],
    matarPassa: ['taskkill /PID 1234', 'taskkill /F /PID 1234', 'kill 1234', 'Stop-Process -Id 1234', 'node --version', 'git log'],
    testes: ['npm test', 'npm run test', 'pnpm test', 'yarn test', 'npx vitest', 'vitest run', 'npx playwright test', 'pytest', 'node --test', 'go test ./...', 'cargo test', 'dotnet test'],
    fundoPassa: ['npm run dev', 'node server.js'],
  };
  const listas = { matarBloqueia: MATAR_BLOQUEIA, matarPassa: MATAR_PASSA, testes: TESTES, fundoPassa: FUNDO_PASSA };
  for (const [k, l] of Object.entries(listas)) {
    assert.equal(new Set(l).size, l.length, k + ': repetidos');
    for (const c of CONTRATO[k]) assert.ok(l.includes(c), k + ': falta o caso do contrato ' + c);
  }
  assert.ok(MATAR_BLOQUEIA.length >= 60 && MATAR_PASSA.length >= 60, `matar: ${MATAR_BLOQUEIA.length} a bloquear, ${MATAR_PASSA.length} a passar`);
  // o hook 2 passa os TESTES em primeiro plano (false e ausente) e o FUNDO_PASSA em segundo plano
  assert.ok(TESTES.length >= 60 && 2 * TESTES.length + FUNDO_PASSA.length >= 60, `fundo: ${TESTES.length} a bloquear`);
  for (const c of MATAR_BLOQUEIA) assert.ok(!MATAR_PASSA.includes(c), 'na lista a bloquear e na lista a passar: ' + c);
  for (const c of TESTES) assert.ok(!FUNDO_PASSA.includes(c), 'na lista a bloquear e na lista a passar: ' + c);
});
