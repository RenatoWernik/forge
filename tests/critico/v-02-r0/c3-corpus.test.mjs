// V-02 (#126) C3 (M4): o corpus histórico de scripts/corpus/afetadas/ (cada caso { commit, ficheiros, devem_incluir }; o nome do caso é o
// do ficheiro) passa todo, com as provas negativas da RESPOSTA do orquestrador na #126 (P1):
// - `8ff53ac-minimo` (o padrão F-28: só o esquema do corpus, scripts/corpus-seed.mjs e as 2 mutações learnings-*.json do F-22a): numa
//   cópia, retirar o f-02-r0 da regra das mutações (as regras que casam com os ficheiros do caso) faz o lint falhar NESSE caso;
// - `8ff53ac-commit` (os 94 ficheiros reais do commit): retirar o f-02-r0 de TODAS as regras faz o lint falhar NESSE caso.
// Os dois incluem f-02-r0 e scripts. O F-24 inclui o f-24-r0, vermelho na main desde o merge do F-24 (RESPOSTA na #75, 2026-11-01 05:08);
// um diff só em README.md inclui o f-01-r0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REL_CORPUS, REL_MAPA, lerJson, lerMapa, nomesManifesto, regrasDe, nomes, afetadasAqui, gitOk, git, linhas, copiaRepo, commitaTudo,
  lintEm, resumo, limpa } from './helpers.mjs';

after(limpa);

const casos = () => readdirSync(join(ROOT, REL_CORPUS)).filter((n) => n.endsWith('.json')).sort().map((f) => ({ nome: f.replace(/\.json$/, ''), ...lerJson(join(ROOT, REL_CORPUS, f)) }));
const caso = (nome) => casos().find((x) => x.nome === nome);
const doCommit = (c) => linhas(gitOk(ROOT, 'diff-tree', '--no-commit-id', '--name-only', '-r', c));
const SEED = ['scripts/corpus-seed.mjs', 'scripts/corpus/mutations/learnings-entrada-malformada.json', 'scripts/corpus/mutations/learnings-linha-reescrita.json'];

test('guarda: o corpus tem ≥ 4 casos, cada um só com { commit, ficheiros, devem_incluir }, e os do ticket e da RESPOSTA P1', () => {
  const cs = casos();
  assert.ok(cs.length >= 4, `só ${cs.length} casos`);
  for (const c of cs) {
    const { nome, ...resto } = c;
    assert.deepEqual(Object.keys(resto).sort(), ['commit', 'devem_incluir', 'ficheiros'], nome);
    assert.ok(c.commit === null || /^[0-9a-f]{7,40}$/.test(c.commit), `${nome}: commit`);
    for (const k of ['ficheiros', 'devem_incluir']) assert.ok(Array.isArray(c[k]) && c[k].length > 0 && c[k].every((x) => typeof x === 'string' && x), `${nome}: ${k}`);
  }
  const inclui = (c, ss) => ss.every((s) => c?.devem_incluir.includes(s));
  const min = caso('8ff53ac-minimo'), com = caso('8ff53ac-commit');
  assert.ok(min && inclui(min, ['f-02-r0', 'scripts']), 'o caso 8ff53ac-minimo inclui f-02-r0 e scripts');
  assert.deepEqual([...min.ficheiros].sort(), [...SEED].sort(), '8ff53ac-minimo: o seed e as 2 mutações learnings-*.json');
  assert.ok(com && inclui(com, ['f-02-r0', 'scripts']), 'o caso 8ff53ac-commit inclui f-02-r0 e scripts');
  assert.equal(min.commit, com.commit);
  assert.deepEqual([...com.ficheiros].sort(), doCommit(com.commit).sort(), '8ff53ac-commit: os ficheiros reais do commit');
  assert.equal(com.ficheiros.length, 94);
  assert.ok(cs.some((c) => c.commit === 'af08eb2' && inclui(c, ['f-24-r0'])), 'o caso do F-24 inclui f-24-r0');
  assert.ok(cs.some((c) => c.ficheiros.length === 1 && c.ficheiros[0] === 'README.md' && inclui(c, ['f-01-r0'])), 'o caso README.md → f-01-r0');
});

test('guarda: os ficheiros de cada caso com commit são ficheiros desse commit, e os nomes de devem_incluir existem no manifesto', () => {
  const todas = new Set(nomesManifesto());
  for (const c of casos()) {
    assert.deepEqual(c.devem_incluir.filter((s) => !todas.has(s)), [], `${c.nome}: suítes fora do manifesto`);
    if (c.commit === null) continue;
    assert.equal(git(ROOT, 'cat-file', '-e', `${c.commit}^{commit}`).status, 0, `${c.nome}: o commit não existe no histórico`);
    const doC = new Set(doCommit(c.commit));
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

// numa cópia: tira o f-02-r0 das regras escolhidas, corre o lint e exige que ele falhe a nomear o caso (só contam as linhas de falha:
// o «not ok» e a mensagem, não os títulos dos testes que passam nem os «# Subtest:»)
function provaNegativa(nomeCaso, escolhe, oQue) {
  const d = copiaRepo(), c = caso(nomeCaso);
  assert.ok(c, `falta o caso ${nomeCaso}`);
  const mapa = lerMapa(d);
  const doCaso = new Set(c.ficheiros.flatMap((f) => regrasDe(mapa, f)));
  assert.deepEqual([...doCaso].filter((r) => r.suites.includes('*')).map((r) => r.caminhos.slice(0, 3)), [],
    `uma regra "*" casa com ${nomeCaso}: traz o f-02-r0 e o M4 não o pode perder`);
  const tiradas = escolhe(mapa, doCaso).filter((r) => r.suites.includes('f-02-r0'));
  assert.ok(tiradas.length > 0, `nenhuma regra (${oQue}) tem o f-02-r0`);
  for (const r of tiradas) r.suites = r.suites.filter((s) => s !== 'f-02-r0');
  writeFileSync(join(d, REL_MAPA), JSON.stringify(mapa, null, 2) + '\n');
  commitaTudo(d, `sem f-02-r0 (${oQue})`);
  const r = lintEm(d);
  assert.notEqual(r.status, 0, `o lint passou sem o f-02-r0 (${oQue}):\n` + resumo(r));
  const falhas = r.out.split(/\r?\n/).filter((l) => !/^\s*(?:ok \d+ - |# Subtest: )/.test(l));
  assert.ok(falhas.some((l) => l.includes(nomeCaso)), `a falha não nomeia o caso ${nomeCaso}: falhou outra coisa, não o M4:\n` + resumo(r));
}

test('C3 (M4): numa cópia, sem o f-02-r0 na regra das mutações, o lint falha no caso 8ff53ac-minimo', () => {
  provaNegativa('8ff53ac-minimo', (mapa, doCaso) => [...doCaso], 'a regra das mutações e do seed');
});

test('C3 (M4): numa cópia, sem o f-02-r0 em TODAS as regras, o lint falha no caso 8ff53ac-commit', () => {
  provaNegativa('8ff53ac-commit', (mapa) => mapa.regras, 'todas as regras');
});