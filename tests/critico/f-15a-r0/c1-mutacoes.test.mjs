// DEPENDE DO F-05 (#6): a pré-condição (o scripts/compat.test.mjs passa numa cópia limpa) só pode ficar verde depois de o
// F-05 tirar resolving-merge-conflicts do templates/FRAMEWORK.md e de o dev fazer merge da main.
//
// F-15a critério 1 (oráculo do dev): o scripts/compat.test.mjs tem de ficar VERMELHO em cada mutação, numa cópia do pacote.
// As 3 primeiras são as obrigatórias do contrato; as outras cobrem as outras famílias de nomes, os ficheiros .js/.cjs dos
// templates, a componente errada, a surface aberta ao upstream e o verifiedWith.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, COMPAT_TEST, copyPackage, runNodeTest, edit, readJson, entries, mapSurfaceArrays } from './helpers.mjs';

const precondition = () => {
  assert.ok(existsSync(join(ROOT, COMPAT_TEST)), 'falta ' + COMPAT_TEST);
  const clean = runNodeTest(copyPackage(), COMPAT_TEST);
  assert.equal(clean.status, 0, 'pré-condição: o compat.test.mjs tem de passar numa cópia limpa\n' + clean.out.slice(-2000));
};
// Uma só vez por ficheiro; se falhar, todos os testes falham com o mesmo erro (nunca passam por o compat.test.mjs não existir)
let pre;
const once = () => {
  if (pre === undefined) { try { precondition(); pre = null; } catch (e) { pre = e; } }
  if (pre) throw pre;
};

const append = (rel, line) => (dir) => edit(dir, rel, (t) => t + (t.endsWith('\n') ? '' : '\n') + line + '\n');
const compatEdit = (f) => (dir) => {
  const file = join(dir, 'compat.json');
  const j = readJson(file);
  f(entries(j), j);
  writeFileSync(file, JSON.stringify(j, null, 2));
};
const red = (nome, ...muts) => {
  const dir = copyPackage();
  for (const m of muts) m(dir);
  const r = runNodeTest(dir, COMPAT_TEST);
  assert.notEqual(r.status, 0, `o compat.test.mjs aceitou a mutação: ${nome}\n` + r.out.slice(-1200));
};
const green = (nome, ...muts) => {
  const dir = copyPackage();
  for (const m of muts) m(dir);
  const r = runNodeTest(dir, COMPAT_TEST);
  assert.equal(r.status, 0, `o compat.test.mjs recusou uma mutação que tem de aceitar: ${nome}\n` + r.out.slice(-1200));
};
const tira = (alvo) => (arr) => arr.filter((s) => !(s === alvo || new RegExp(`[:\\-./ ]${alvo}$`).test(s)));

test('M1 (contrato): um template que cita mattpocock-skills:resolving-merge-conflicts dá vermelho', () => {
  once();
  red('FRAMEWORK.md cita resolving-merge-conflicts', append('templates/FRAMEWORK.md', '- Merge: `mattpocock-skills:resolving-merge-conflicts`.'));
});

test('M2 (contrato): um template que cita speckit-taskstoissues dá vermelho', () => {
  once();
  red('FRAMEWORK.md cita /speckit-taskstoissues', append('templates/FRAMEWORK.md', '- Issues: `/speckit-taskstoissues`.'));
});

test('M3 (contrato): tirar converge da surface do spec-kit dá vermelho', () => {
  once();
  red('surface do spec-kit sem converge', compatEdit((e) => assert.ok(mapSurfaceArrays(e['spec-kit']?.surface, tira('converge')) > 0, 'converge não encontrado na surface do spec-kit')));
});

test('M4: `graphify <sub>` inexistente num code span de um template dá vermelho', () => {
  once();
  red('CLAUDE.md cita graphify frobnicate', append('templates/CLAUDE.md', 'Run `graphify frobnicate .` after each commit.'));
});

test('M5: ponytail-<x> inexistente num ficheiro .js dos templates dá vermelho', () => {
  once();
  red('gauntlet-ponytail.js cita ponytail-frobnicate', append('templates/.claude/workflows/gauntlet-ponytail.js', "// then run the ponytail-frobnicate skill"));
});

test('M6: `ai-memory <sub>` inexistente num code span dá vermelho', () => {
  once();
  red('FRAMEWORK.md cita ai-memory frobnicate', append('templates/FRAMEWORK.md', '- Before a release: `ai-memory frobnicate --all`.'));
});

test('M7: uma flag inexistente do `specify init` dá vermelho', () => {
  once();
  red('BOOTSTRAP.md cita specify init --frobnicate', append('templates/BOOTSTRAP.md', 'If asked: `specify init --here --frobnicate`.'));
});

test('M8: mattpocock-skills:<x> inexistente num ficheiro .cjs dos templates dá vermelho', () => {
  once();
  red('check.cjs cita mattpocock-skills:frobnicate', append('templates/.claude/check.cjs', '// see mattpocock-skills:frobnicate'));
});

test('M9: surface aberta — acrescentar resolving-merge-conflicts ao template E à surface dá vermelho (não existe no upstream v1.3.2)', () => {
  once();
  red(
    'template + surface com resolving-merge-conflicts',
    append('templates/FRAMEWORK.md', '- Merge: `mattpocock-skills:resolving-merge-conflicts`.'),
    compatEdit((e) => assert.ok(mapSurfaceArrays(e['mattpocock-skills']?.surface, (a) => {
      const t = a.find((s) => s === 'tdd' || /[:\-./ ]tdd$/.test(s));
      return t ? [...a, t.replace(/tdd$/, 'resolving-merge-conflicts')] : a;
    }) > 0, 'tdd não encontrado na surface do mattpocock-skills')),
  );
});

test('M10: componente errada — mover grilling da surface do mattpocock-skills para a do ponytail dá vermelho', () => {
  once();
  red('grilling na componente errada', compatEdit((e) => {
    let movido;
    assert.ok(mapSurfaceArrays(e['mattpocock-skills']?.surface, (a) => { movido ??= a.find((s) => s === 'grilling' || /[:\-./ ]grilling$/.test(s)); return tira('grilling')(a); }) > 0, 'grilling não encontrado');
    assert.ok(mapSurfaceArrays(e.ponytail?.surface, (a) => (a.some((s) => /review$/.test(s)) ? [...a, movido] : a)) > 0, 'lista de skills do ponytail não encontrada');
  }));
});

// P3: o que só as secções «Do not run» e «Do not use» citam não pode bloquear o teste (é proibido, não usado)
const proibidas = (dir) => edit(dir, 'templates/FRAMEWORK.md', (t) => {
  const ls = t.split('\n');
  const run = ls.findIndex((l) => /^Do not run:/.test(l));
  const use = ls.findIndex((l) => /^Do not use:/.test(l));
  assert.ok(run >= 0 && use >= 0, 'o FRAMEWORK.md deixou de ter as secções «Do not run:» e «Do not use:»');
  ls[run] = ls[run].replace(/\r?$/, '; `ai-memory frobnicate`; `graphify frobnicate`; `specify init --frobnicate`');
  const item = ls.findIndex((l, i) => i > use && /^- /.test(l));
  assert.ok(item > use, 'a secção «Do not use:» não tem itens');
  ls.splice(item + 1, 0, '- `mattpocock-skills:frobnicate`, `/speckit-frobnicate`, `ponytail-frobnicate`: never.');
  return ls.join('\n');
});
test('M12 (P3): nomes que só as secções «Do not run» e «Do not use» citam NÃO dão vermelho (o compat.test.mjs continua verde)', () => {
  once();
  green('nomes inexistentes só nas secções proibidas do FRAMEWORK.md', proibidas);
});

test('M13 (P3): o mesmo nome fora da secção proibida continua a dar vermelho', () => {
  once();
  red('nomes inexistentes nas secções proibidas e também num parágrafo normal', proibidas, append('templates/FRAMEWORK.md', 'Then run `graphify frobnicate .`.'));
});

test('M11: tirar uma entrada (graphify-skill) ou mudar um verifiedWith (mattpocock-skills 1.3.1) dá vermelho', () => {
  once();
  red('sem graphify-skill', compatEdit((e) => { delete e['graphify-skill']; }));
  red('mattpocock verifiedWith 1.3.1', compatEdit((e) => { e['mattpocock-skills'].verifiedWith = String(e['mattpocock-skills'].verifiedWith).replace('1.3.2', '1.3.1'); }));
});
