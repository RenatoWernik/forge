// F-22c critério 4: o /forge:sync leva as lições do pacote (C7).
// Oráculos (corpo da #79): uma fixture de projeto com 2 entradas `package` e 1 `project`: a saída tem as 2 linhas e não tem a de `project`; sem
// learnings/, ou só com o README.md: `none`; o scripts/sync.test.mjs continua verde (barra de regressão).
// Atualização 1 (#75): só learnings/AAAA-MM.md é registo; o README.md não é, e o scaffold escreve-o sempre (um projeto acabado de gerar = «só com
// o README.md»).
// O que reprova: o sync a aplicar sem o sim, ou a listar entradas de âmbito `project`.
// LEITURA: a secção é a linha `learnings (scope package):` seguida das linhas `E-NNN <class> -> <PREVENTION-PATH>` (indentação livre), ou de
// `none` (na mesma linha ou na seguinte), no stdout ou no stderr do `node scripts/sync.mjs --project <p> --package <forge>`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SECAO_SYNC, projeto, apaga, escreve, entrada, ficheiro, sync, secaoSync, fotografia, texto } from './helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const novo = async () => { const P = await projeto(); lixo.push(P); return P; };
const esperaSecao = (r, itens) => {
  const s = secaoSync(r);
  assert.ok(s, `a saída do sync não tem a secção «${SECAO_SYNC}»:\n` + r.out.slice(-1500));
  assert.deepEqual([...s].sort(), [...itens].sort(), 'as linhas da secção ' + SECAO_SYNC);
  assert.equal(r.status, 0, 'o sync de um projeto sem alterações aos templates sai com 0:\n' + r.out.slice(-800));
};
// E-001 em setembro e E-002/E-003 em outubro: 2 package (camadas test e contract) e 1 project; ids de 1 a 3, classes distintas
const registoDoContrato = (P) => {
  escreve(P, 'learnings/2026-09.md', ficheiro('2026-09', [entrada(1, 'test', { DATE: '2026-09-20', 'REVIEW-BY': '2026-10-04', CLASS: 'porta-do-pacote', SCOPE: 'package' })]));
  escreve(P, 'learnings/2026-10.md', ficheiro('2026-10', [entrada(2, 'test', { CLASS: 'so-deste-projeto', SCOPE: 'project' }), entrada(3, 'contract', { CLASS: 'contrato-do-pacote', SCOPE: 'package' })]));
};
const LINHAS = ['E-001 porta-do-pacote -> tests/learn/porta.test.mjs', 'E-003 contrato-do-pacote -> docs/contrato-porta.md'];

test('C4 [ataque]: 2 entradas package e 1 project (em dois ficheiros do mês): a secção tem as 2 linhas E-NNN <class> -> <PREVENTION-PATH> e nada da de project', async () => {
  const P = await novo();
  registoDoContrato(P);
  const r = sync(P);
  esperaSecao(r, LINHAS);
  assert.doesNotMatch(r.out, /E-002|so-deste-projeto/, 'a entrada SCOPE: project aparece na saída do sync');
});

test('C4 [ataque]: só learnings/AAAA-MM.md é registo: uma entrada package no README.md ou noutro .md da pasta nunca entra na secção', async () => {
  const P = await novo();
  escreve(P, 'learnings/2026-10.md', ficheiro('2026-10', [entrada(1, 'contract', { CLASS: 'contrato-do-pacote', SCOPE: 'package' })]));
  const armadilha = (n, cls) => entrada(n, 'contract', { CLASS: cls, SCOPE: 'package', 'PREVENTION-PATH': 'docs/armadilha.md' });
  writeFileSync(join(P, 'learnings/README.md'), texto('templates/learnings/README.md') + '\nExample:\n\n' + armadilha('E-099', 'armadilha-readme'));
  escreve(P, 'learnings/rascunho.md', ficheiro('2026-10', [armadilha('E-098', 'armadilha-rascunho')]));
  escreve(P, 'learnings/2026-10.md.bak', ficheiro('2026-10', [armadilha('E-097', 'armadilha-bak')]));
  const r = sync(P);
  const s = secaoSync(r);
  assert.ok(s, `a saída do sync não tem a secção «${SECAO_SYNC}»:\n` + r.out.slice(-1500));
  assert.deepEqual(s, ['E-001 contrato-do-pacote -> docs/contrato-porta.md'], 'a secção leu um ficheiro que não é learnings/AAAA-MM.md');
});

test('C4 [ataque]: sem learnings/, a secção imprime none', async () => {
  const P = await novo();
  apaga(join(P, 'learnings'));
  esperaSecao(sync(P), ['none']);
});

test('C4 [ataque]: só com o learnings/README.md (o projeto acabado de gerar), a secção imprime none', async () => {
  const P = await novo();
  esperaSecao(sync(P), ['none']);
});

test('C4 [ataque]: só com entradas project, a secção imprime none', async () => {
  const P = await novo();
  escreve(P, 'learnings/2026-10.md', ficheiro('2026-10', [entrada(1, 'test', { CLASS: 'so-deste-projeto', SCOPE: 'project' })]));
  const r = sync(P);
  esperaSecao(r, ['none']);
  assert.doesNotMatch(r.out, /so-deste-projeto/, 'a entrada SCOPE: project aparece na saída do sync');
});

test('C4 [ataque]: o sync não aplica nada sem o sim: com as entradas package, nem o projeto nem o pacote mudam um byte', async () => {
  const P = await novo();
  registoDoContrato(P);
  const antes = [fotografia(P), fotografia(ROOT, ['templates', 'scripts', 'skills'])];
  const r = sync(P);
  esperaSecao(r, LINHAS);
  assert.deepEqual(fotografia(P), antes[0], 'o sync escreveu no projeto');
  assert.deepEqual(fotografia(ROOT, ['templates', 'scripts', 'skills']), antes[1], 'o sync escreveu no pacote');
});

test('C4 [ataque]: skills/sync/SKILL.md diz que as entradas de scope package se propõem com o patch e que o utilizador decide cada uma', () => {
  const ls = texto('skills/sync/SKILL.md').split('\n');
  const l = ls.filter((x) => /scope package|SCOPE: package|`package`/.test(x));
  assert.ok(l.length >= 1, 'a skill do sync não fala das entradas de scope package');
  assert.ok(l.some((x) => /\bpatch\b/i.test(x) && /\buser\b/i.test(x) && /\beach\b/i.test(x)), 'nenhuma linha da skill diz que as entradas package vão com o patch e que o utilizador decide cada uma:\n' + l.join('\n'));
});