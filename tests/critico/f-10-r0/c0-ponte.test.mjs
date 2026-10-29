// F-10: pré-condições dos ataques. A ponte existe, exporta tudo o que os ataques usam, e não tem lógica:
// só importa do pacote (fora de tests/) e adapta a forma, para o resultado ser o do pacote e não o da ponte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { ROOT, PONTE, api } from './helpers.mjs';

const FUNCOES = ['validar', 'ler', 'contagens', 'percentagem', 'objetivo', 'agentes', 'argsTicket', 'argsAgente', 'argsRemoverAgente', 'argsObjetivo'];
const CAMINHOS = ['utilitario', 'leitorFonte', 'leitorNoProjeto'];

test('C0: a ponte tests/ponte/f-10.mjs exporta as funções e os caminhos que os ataques usam', async () => {
  const u = await api();
  for (const f of FUNCOES) assert.equal(typeof u[f], 'function', 'falta a função ' + f);
  for (const c of CAMINHOS) assert.equal(typeof u[c], 'string', 'falta o caminho ' + c);
  assert.ok(existsSync(u.utilitario), 'o utilitário não existe: ' + u.utilitario);
  assert.ok(existsSync(u.leitorFonte), 'a fonte do leitor não existe: ' + u.leitorFonte);
  for (const c of ['utilitario', 'leitorFonte']) assert.ok(!relative(ROOT, u[c]).startsWith('tests'), c + ' está em tests/, não no pacote');
});

test('C0: a ponte não tem lógica (sem ciclos, condições, comparações com números, fs, JSON.parse nem relógio) e só importa do pacote', () => {
  assert.ok(existsSync(PONTE), 'ponte em falta');
  const src = readFileSync(PONTE, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const proibido = [/\bfor\s*\(/, /\bwhile\s*\(/, /\bif\s*\(/, /\bswitch\s*\(/, /JSON\.parse/, /node:fs/, /readFile|writeFile|statSync|\bstat\(/, /Date\.now|new Date/, /[<>]=?\s*\d/, /\.(reduce|filter|sort)\(/];
  for (const re of proibido) assert.doesNotMatch(src, re, 'a ponte tem lógica: ' + re);
  const specs = [...src.matchAll(/\b(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
  assert.ok(specs.length > 0, 'a ponte não importa nada do pacote');
  for (const s of specs) {
    if (s === 'node:path' || s === 'node:url') continue;
    assert.ok(s.startsWith('.'), 'import fora do pacote: ' + s);
    assert.ok(!relative(ROOT, resolve(dirname(PONTE), s)).startsWith('tests'), 'a ponte importa de tests/: ' + s);
  }
});
