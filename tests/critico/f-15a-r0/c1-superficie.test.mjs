// DEPENDE DO F-05 (#6): na main 0a35bee o templates/FRAMEWORK.md ainda cita mattpocock-skills:resolving-merge-conflicts, que
// a v1.3.0 removeu; estes ataques só podem ficar verdes depois de o F-05 entrar na main e de o dev fazer merge dela.
//
// F-15a critério 1 (superfície fechada): cada nome que templates/** cita existe na surface da componente certa, e a surface
// não inventa nomes que o upstream (a fixture gravada) não tem. As regexes do crítico são independentes das do dev e só apanham
// formas inequívocas (helpers.mjs › cited): mattpocock-skills:<x>, speckit-<x> (menos o marcador `speckit-x`), ponytail-<x>,
// `graphify <sub>` e `ai-memory <sub>` em code spans e nas chamadas do check.cjs, e as flags dos code spans `specify init ...`;
// as skills ficam em surface.skills e os subcomandos e flags em surface.commands (P1). As secções «Do not run» e «Do not use»
// não contam, e o que só elas citam fica FORA da surface (P3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, COMPAT, FIXTURE, ALVO, entries, readJson, cited, forbiddenOnly, hasName, surfaceNames } from './helpers.mjs';

test('C1 (F-05): os templates citam nomes de todas as famílias (controlo das regexes do crítico)', () => {
  const c = cited();
  for (const k of Object.keys(ALVO)) assert.ok(c[k].length > 0, 'nenhum nome extraído para ' + k);
  assert.ok(c['mattpocock-skills'].includes('tdd') && c['spec-kit'].includes('converge') && c.graphify.includes('query'), 'extração incompleta');
});

test('C1 (F-05): cada nome que templates/** cita (fora das secções proibidas) existe na surface da componente certa, na lista certa (skills ou commands)', () => {
  assert.ok(existsSync(COMPAT), 'falta compat.json');
  const e = entries(readJson(COMPAT));
  const c = cited();
  const faltam = [];
  for (const [k, [id, lista]] of Object.entries(ALVO)) for (const n of c[k]) if (!hasName(e[id], n, lista)) faltam.push(`${id}.surface.${lista} ← ${k === 'spec-kit-flags' ? 'specify init ' : ''}${n}`);
  if (!hasName(e.ponytail, 'ponytail', 'skills')) faltam.push('ponytail.surface.skills ← ponytail');
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

// Um nome só «proibido» pode estar na surface se algum código do pacote o usar (F-20b: o memoria.mjs corre `ai-memory init`):
// um literal 'nome' num .mjs/.cjs/.js de scripts/ (fora dos testes e das fixtures) ou de templates/.
const codigo = (raiz) => {
  const out = [];
  const anda = (d) => {
    for (const x of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, x.name);
      if (x.isDirectory()) { if (x.name !== 'fixtures') anda(f); } else if (/\.(mjs|cjs|js)$/.test(x.name) && !/\.test\.mjs$/.test(x.name)) out.push(readFileSync(f, 'utf8'));
    }
  };
  for (const d of ['scripts', 'templates']) if (existsSync(join(raiz, d))) anda(join(raiz, d));
  return out;
};
const usadoPeloCodigo = (n, fontes) => fontes.some((t) => new RegExp(`['"\`]${n}['"\`]`).test(t));

test('C1 (P3): o que os templates citam só nas secções «Do not run» e «Do not use» e nenhum código usa fica fora da surface', () => {
  const e = entries(readJson(COMPAT));
  const proibidos = forbiddenOnly();
  const fontes = codigo(ROOT);
  const dentro = [];
  for (const [k, [id]] of Object.entries(ALVO)) for (const n of proibidos[k]) if (hasName(e[id], n) && !usadoPeloCodigo(n, fontes)) dentro.push(`${id} ← ${n}`);
  assert.deepEqual(dentro, []);
});

test('controlo (P3): as secções proibidas dos templates de hoje citam nomes que o oráculo exclui (graphify extract), e um nome fictício só proibido e sem uso em código seria apanhado', () => {
  const p = forbiddenOnly();
  assert.ok(p.graphify.includes('extract'), 'a deteção das secções proibidas deixou de apanhar o «Do not run»: ' + JSON.stringify(p));
  assert.ok(!cited().graphify.includes('extract'), 'graphify extract (só no «Do not run») entrou nos nomes citados');
  const raiz = mkdtempSync(join(tmpdir(), 'critico-f15a-p3-'));
  try {
    mkdirSync(join(raiz, 'templates'));
    writeFileSync(join(raiz, 'templates', 'x.md'), 'Do not run: `ai-memory frobnicate`.\n');
    const f = forbiddenOnly(raiz);
    assert.ok(f['ai-memory'].includes('frobnicate'), 'o nome fictício só proibido não foi apanhado: ' + JSON.stringify(f));
    assert.ok(!usadoPeloCodigo('frobnicate', codigo(ROOT)), 'o nome fictício aparece em código');
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});