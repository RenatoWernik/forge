// Ataques do brief da Ronda −1 que entraram no contrato pela emenda R7 do orquestrador (#10, 2026-10-29): a prova na main para (b),
// a issue `flaky` obrigatória para (c), a deteção de portas fixas repetidas e os comandos de ≤ 540 s. Eram `todo`; agora contam.
// (O nome do ficheiro fica: os ataques não se apagam nem se renomeiam.) As lições vêm do lote 2 do E3-10 da Guilda (#103 a #105).
// Oráculo de cada um: o literal no prompt do tester, mais um caso do tester falso. A lógica das classes com a prova na main está no
// c4 (casos 3 e R6) e no c7 (mutações da prova na main).
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, runWf, batchArgs, pieces, fakeImpl, declared, testerCalls, approved, classesOf, show } from './helpers.mjs';
import { FAIL } from './corpus.mjs';

const go = async (answer) => {
  const run = await runWf(BATCH, batchArgs(pieces(2)), fakeImpl({ answer }));
  assert.ok(!run.err && testerCalls(run).length >= 1, show(run));
  return { run, tester: testerCalls(run).map((c) => c.prompt).join('\n'), all: run.calls.map((c) => c.prompt).join('\n') };
};
const oneLine = (text, ...res) => text.split(/\r?\n/).some((l) => res.every((re) => re.test(l)));

test('X1 classe (b): o prompt do tester manda correr na main cada teste que falhou e declarar o resultado; sem essa prova, uma falha estável fora do diff nunca é b', async () => {
  const { tester } = await go(() => declared([FAIL.coreEstavelSemMain]));
  assert.ok(oneLine(tester, /\bmain\b/i, /\b(run|rerun|corr\w*|repet\w*)\b/i), 'o prompt não manda correr as falhas na main');
  const { run } = await go(() => declared([FAIL.coreEstavelSemMain]));
  assert.notEqual(classesOf(run.out)[FAIL.coreEstavelSemMain.test], 'b', 'b sem prova na main');
});

test('X2 classe (c): um lote com um flaky manda abrir uma issue com a label `flaky` (numa linha de um prompt do lote)', async () => {
  const { run, all } = await go(() => declared([FAIL.coreIntermitente]));
  assert.equal(classesOf(run.out)[FAIL.coreIntermitente.test], 'c', show(run));
  assert.ok(oneLine(all, /\bissues?\b/i, /\bflaky\b/), 'nenhum prompt manda abrir a issue flaky');
});

test('X3 portas fixas: o prompt do tester manda procurar portas fixas repetidas entre testes (EADDRINUSE), e duas falhas com EADDRINUSE na mesma porta em testes diferentes aparecem no retorno com a porta', async () => {
  const f = (name, file) => ({ test: `${file} > ${name}`, files: [file], suite: [1], isolated: true, cls: 'c', owners: [] });
  const answer = () => { const d = declared([f('x', 'tests/core.test.mjs'), f('y', 'tests/other.test.mjs')]); d.runs[0].failures.forEach((x) => { x.output = 'Error: listen EADDRINUSE: address already in use :::4807'; }); return d; };
  const { run, tester } = await go(answer);
  assert.ok(/EADDRINUSE|fixed ports?|porta(s)? fixa/i.test(tester), 'o prompt não fala de portas fixas');
  assert.match(JSON.stringify(run.out), /4807/, 'o retorno não aponta a porta repetida');
});

test('X4 ≤ 540 s: o prompt do tester manda partir os comandos para que cada um corra em primeiro plano em 540 s (9 min) ou menos', async () => {
  const { tester } = await go(() => declared([]));
  assert.ok(oneLine(tester, /\b540\b|\b9 ?min/i), 'o prompt não tem o limite de 540 s');
  assert.match(tester, /foreground|primeiro plano/i, 'o prompt não manda correr em primeiro plano');
});

test('X5 rótulos (R1): um tester que escreve batch.verdict "fail", passed:false e approved:false não reprova um lote limpo', async () => {
  const { run } = await go(() => ({ ...declared([]), batch: { verdict: 'fail', failures: [] }, passed: false, approved: false }));
  assert.ok(approved(run), show(run));
});
