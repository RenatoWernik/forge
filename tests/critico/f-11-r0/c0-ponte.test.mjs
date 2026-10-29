// F-11: pré-condições dos ataques. A ponte existe, exporta o que os ataques usam, e não tem lógica:
// só importa do pacote (fora de tests/) e adapta a forma, para o resultado ser o do mod e não o da ponte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { ROOT, PONTE, api } from './helpers.mjs';

const FUNCOES = ['dados', 'iniciar', 'pulso', 'portas'];

test('C0: a ponte tests/ponte/f-11.mjs exporta dados, iniciar, pulso, portas, modulo e modulos, e os ficheiros existem no pacote', async () => {
  const u = await api();
  for (const f of FUNCOES) assert.equal(typeof u[f], 'function', 'falta a função ' + f);
  assert.equal(typeof u.modulo, 'string', 'falta o caminho modulo');
  assert.ok(Array.isArray(u.modulos) && u.modulos.length > 0, 'falta a lista modulos');
  for (const f of [u.modulo, ...u.modulos]) {
    assert.ok(isAbsolute(f) && existsSync(f), 'não existe: ' + f);
    const rel = relative(ROOT, f);
    assert.ok(!rel.startsWith('..') && !rel.startsWith('tests'), f + ' está fora do pacote ou em tests/');
  }
  assert.ok(u.modulos.map((f) => resolve(f)).includes(resolve(u.modulo)), 'modulos não inclui o módulo de hooks');
});

test('C0: a ponte não tem lógica (sem ciclos, condições, comparações com números, fs, JSON.parse nem relógio) e só importa do pacote', () => {
  assert.ok(existsSync(PONTE), 'ponte em falta');
  const src = readFileSync(PONTE, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const proibido = [/\bfor\s*\(/, /\bwhile\s*\(/, /\bif\s*\(/, /\bswitch\s*\(/, /\?[^.?]/, /JSON\.parse/, /node:fs/, /readFile|writeFile|statSync|\bstat\(/, /Date\.now|new Date/, /[<>]=?\s*\d/, /\.(reduce|filter|sort|replace|match|test)\(/];
  for (const re of proibido) assert.doesNotMatch(src, re, 'a ponte tem lógica: ' + re);
  const specs = [...src.matchAll(/\b(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
  assert.ok(specs.length > 0, 'a ponte não importa nada do pacote');
  for (const s of specs) {
    if (s === 'node:path' || s === 'node:url') continue;
    assert.ok(s.startsWith('.'), 'import fora do pacote: ' + s);
    assert.ok(!relative(ROOT, resolve(dirname(PONTE), s)).startsWith('tests'), 'a ponte importa de tests/: ' + s);
  }
});
