// V-02 (#126) C3 (M4): o corpus histórico de scripts/corpus/afetadas/ (cada caso { commit, ficheiros, devem_incluir }) passa todo, e numa
// cópia temporária retirar o f-02-r0 das regras que casam com os ficheiros do caso do F-22a (a regra das mutações e do seed) faz o lint
// falhar NESSE caso. Os casos do ticket: o F-22a (`seed`, F-28) inclui f-02-r0 e scripts; o F-24 inclui o f-24-r0, que ficou vermelho na main
// desde o merge do F-24 (RESPOSTA na #75, 2026-11-01 05:08); um diff só em README.md inclui o f-01-r0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REL_CORPUS, REL_MAPA, lerJson, lerMapa, nomesManifesto, regrasDe, nomes, afetadasAqui, gitOk, git, linhas, copiaRepo, commitaTudo,
  lintEm, resumo, limpa } from './helpers.mjs';

after(limpa);

const casos = () => readdirSync(join(ROOT, REL_CORPUS)).filter((n) => n.endsWith('.json')).sort().map((nome) => ({ nome, ...lerJson(join(ROOT, REL_CORPUS, nome)) }));
const doCommit = (c) => casos().find((x) => x.commit === c);
const F22A = '8ff53ac', F24 = 'af08eb2';

test('guarda: o corpus tem ≥ 3 casos, cada um só com { commit, ficheiros, devem_incluir }, e os três do ticket', () => {
  const cs = casos();
  assert.ok(cs.length >= 3, `só ${cs.length} casos`);
  for (const c of cs) {
    const { nome, ...resto } = c;
    assert.deepEqual(Object.keys(resto).sort(), ['commit', 'devem_incluir', 'ficheiros'], nome);
    assert.ok(c.commit === null || /^[0-9a-f]{7,40}$/.test(c.commit), `${nome}: commit`);
    for (const k of ['ficheiros', 'devem_incluir']) assert.ok(Array.isArray(c[k]) && c[k].length > 0 && c[k].every((x) => typeof x === 'string' && x), `${nome}: ${k}`);
  }
  const inclui = (c, ss) => ss.every((s) => c?.devem_incluir.includes(s));
  assert.ok(inclui(doCommit(F22A), ['f-02-r0', 'scripts']), 'o caso do F-22a inclui f-02-r0 e scripts');
  assert.ok(inclui(doCommit(F24), ['f-24-r0']), 'o caso do F-24 inclui f-24-r0');
  assert.ok(cs.some((c) => c.ficheiros.length === 1 && c.ficheiros[0] === 'README.md' && inclui(c, ['f-01-r0'])), 'o caso README.md → f-01-r0');
});

test('guarda: os ficheiros de cada caso com commit são ficheiros desse commit, e os nomes de devem_incluir existem no manifesto', () => {
  const todas = new Set(nomesManifesto());
  for (const c of casos()) {
    assert.deepEqual(c.devem_incluir.filter((s) => !todas.has(s)), [], `${c.nome}: suítes fora do manifesto`);
    if (c.commit === null) continue;
    const r = git(ROOT, 'cat-file', '-e', `${c.commit}^{commit}`);
    assert.equal(r.status, 0, `${c.nome}: o commit não existe no histórico`);
    const doC = new Set(linhas(gitOk(ROOT, 'diff-tree', '--no-commit-id', '--name-only', '-r', c.commit)));
    assert.deepEqual(c.ficheiros.filter((f) => !doC.has(f)), [], `${c.nome}: ficheiros que não estão no commit`);
  }
});

test('C3 (M4): cada caso do corpus histórico tem as suítes de devem_incluir nas afetadas dos seus ficheiros', async () => {
  const todas = nomesManifesto(), faltam = [];
  for (const c of casos()) {
    const s = nomes(await afetadasAqui(c.ficheiros), todas);
    const f = c.devem_incluir.filter((x) => !s.has(x));
    if (f.length) faltam.push(`${c.nome}: faltam ${f.join(', ')}`);
  }
  assert.deepEqual(faltam, []);
});

test('C3 (M4): numa cópia, sem o f-02-r0 nas regras que casam com os ficheiros do caso do F-22a, o lint falha nesse caso', () => {
  const d = copiaRepo(), caso = doCommit(F22A);
  assert.ok(caso, 'falta o caso do F-22a');
  const mapa = lerMapa(d);
  const alvo = new Set(caso.ficheiros.flatMap((f) => regrasDe(mapa, f)));
  assert.deepEqual([...alvo].filter((r) => r.suites.includes('*')).map((r) => r.caminhos), [], 'uma regra "*" traz o f-02-r0 ao caso: o M4 não o pode perder');
  const tiradas = [...alvo].filter((r) => r.suites.includes('f-02-r0'));
  assert.ok(tiradas.length > 0, 'nenhuma regra que casa com o caso tem o f-02-r0 (a regra das mutações)');
  for (const r of tiradas) r.suites = r.suites.filter((s) => s !== 'f-02-r0');
  writeFileSync(join(d, REL_MAPA), JSON.stringify(mapa, null, 2) + '\n');
  commitaTudo(d, 'sem f-02-r0 nas mutações');
  const r = lintEm(d);
  assert.notEqual(r.status, 0, 'o lint passou sem o f-02-r0 na regra das mutações:\n' + resumo(r));
  const sinal = [caso.commit, caso.nome, caso.nome.replace(/\.json$/, '')];
  // só contam as linhas de falha (o «not ok» e a mensagem), não os títulos dos testes que passam nem os «# Subtest:»
  const falhas = r.out.split(/\r?\n/).filter((l) => !/^\s*(?:ok \d+ - |# Subtest: )/.test(l));
  assert.ok(sinal.some((x) => falhas.some((l) => l.includes(x))), `a falha não nomeia o caso (${sinal.join(' | ')}): falhou outra coisa, não o M4:\n` + resumo(r));
});