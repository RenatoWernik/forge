// DEPENDE DO F-05 (#6): na main 0a35bee o templates/FRAMEWORK.md ainda cita mattpocock-skills:resolving-merge-conflicts, que
// a v1.3.0 removeu; estes ataques só podem ficar verdes depois de o F-05 entrar na main e de o dev fazer merge dela.
//
// F-15a critério 1 (superfície fechada): cada nome que templates/** cita existe na surface da componente certa, e a surface
// não inventa nomes que o upstream (a fixture gravada) não tem. As regexes do crítico são independentes das do dev e só apanham
// formas inequívocas (helpers.mjs › cited): mattpocock-skills:<x>, speckit-<x> (menos o marcador `speckit-x`), ponytail-<x>,
// `graphify <sub>` e `ai-memory <sub>` em code spans e nas chamadas do check.cjs, e as flags dos code spans `specify init ...`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { COMPAT, FIXTURE, entries, readJson, cited, hasName, surfaceNames } from './helpers.mjs';

const ALVO = { 'mattpocock-skills': 'mattpocock-skills', 'spec-kit': 'spec-kit', 'spec-kit-flags': 'spec-kit', ponytail: 'ponytail', graphify: 'graphify', 'ai-memory': 'ai-memory' };

test('C1 (F-05): os templates citam nomes de todas as famílias (controlo das regexes do crítico)', () => {
  const c = cited();
  for (const k of Object.keys(ALVO)) assert.ok(c[k].length > 0, 'nenhum nome extraído para ' + k);
  assert.ok(c['mattpocock-skills'].includes('tdd') && c['spec-kit'].includes('converge') && c.graphify.includes('query'), 'extração incompleta');
});

test('C1 (F-05): cada nome que templates/** cita existe na surface da componente certa', () => {
  assert.ok(existsSync(COMPAT), 'falta compat.json');
  const e = entries(readJson(COMPAT));
  const c = cited();
  const faltam = [];
  for (const [k, id] of Object.entries(ALVO)) for (const n of c[k]) if (!hasName(e[id], n)) faltam.push(`${id} ← ${k === 'spec-kit-flags' ? 'specify init ' : ''}${n}`);
  if (!hasName(e.ponytail, 'ponytail')) faltam.push('ponytail ← ponytail');
  assert.deepEqual(faltam, []);
});

test('C1 (F-05): nenhum template cita mattpocock-skills:resolving-merge-conflicts (removida na 1.3.0)', () => {
  assert.ok(!cited()['mattpocock-skills'].includes('resolving-merge-conflicts'), 'o F-05 ainda não entrou: FRAMEWORK.md cita resolving-merge-conflicts');
});

// Superfície fechada contra o upstream: cada nome da surface aparece na fixture gravada nas versões verificadas
const PREFIXOS = [/^\/?mattpocock-skills:/, /^\//, /^speckit[-.]/, /^specify init /, /^graphify /, /^ai-memory /];
const raiz = (s) => PREFIXOS.reduce((a, re) => a.replace(re, ''), s).trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
test('C1: a surface não inventa nomes — cada nome da surface de mattpocock-skills, spec-kit, ponytail e graphify aparece na fixture do upstream', () => {
  assert.ok(existsSync(FIXTURE), 'falta a fixture ' + FIXTURE);
  const fx = readFileSync(FIXTURE, 'utf8');
  const e = entries(readJson(COMPAT));
  const inventados = [];
  for (const id of ['mattpocock-skills', 'spec-kit', 'ponytail', 'graphify']) {
    for (const s of surfaceNames(e[id])) {
      const n = raiz(s);
      if (!n) continue;
      if (!new RegExp(`(^|[^A-Za-z0-9-])${esc(n)}($|[^A-Za-z0-9-])`).test(fx)) inventados.push(`${id}: ${s}`);
    }
  }
  assert.deepEqual(inventados, []);
});

test('C1: a surface do mattpocock-skills não tem resolving-merge-conflicts e a do spec-kit não tem taskstoissues', () => {
  const e = entries(readJson(COMPAT));
  assert.ok(!hasName(e['mattpocock-skills'], 'resolving-merge-conflicts'), 'surface com uma skill removida na 1.3.0');
  assert.ok(!hasName(e['spec-kit'], 'taskstoissues'), 'surface com um comando que o forge não usa (obsoleto desde a 1.1.0)');
});
