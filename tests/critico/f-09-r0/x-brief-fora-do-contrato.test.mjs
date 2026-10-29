// Ataques pedidos no brief da Ronda −1 que a #10 NÃO tem nos critérios (as lições do lote 2 do E3-10 da Guilda: #103 a #105).
// Ficam como `todo` até o orquestrador decidir (PERGUNTA 7): emenda na #10 → o `todo` sai e o ataque passa a contar; sem emenda →
// viram uma issue `seguimento`. Não reprovam o F-09 enquanto forem `todo` (o contrato ganha ao ataque).
// Oráculo de cada um: o literal no prompt do tester, mais um caso do tester falso.
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, runWf, batchArgs, pieces, fakeImpl, declared, testerCalls, approved, show } from './helpers.mjs';
import { FAIL } from './corpus.mjs';

const prompts = async (failures = []) => {
  const run = await runWf(BATCH, batchArgs(pieces(2)), fakeImpl({ answer: () => declared(failures) }));
  assert.ok(!run.err && testerCalls(run).length >= 1, show(run));
  return { run, text: testerCalls(run).map((c) => c.prompt).join('\n') };
};
const oneLine = (text, ...res) => text.split(/\r?\n/).some((l) => res.every((re) => re.test(l)));

test('X1 classe (b): o prompt do tester manda provar na main uma falha estável fora do diff (correr o teste na main), e o retorno do caso 3 pede essa prova', { todo: 'PERGUNTA 7a: fora dos critérios da #10' }, async () => {
  const { run, text } = await prompts([FAIL.coreEstavel]);
  assert.ok(oneLine(text, /\bmain\b/i, /\b(run|rerun|corr\w*|repet\w*)\b/i), 'o prompt não manda correr a falha na main');
  assert.match(JSON.stringify(run.out), /\bmain\b/i, 'o retorno do caso 3 não fala da prova na main');
});

test('X2 classe (c): o prompt do tester manda abrir uma issue com a label `flaky` para cada flaky', { todo: 'PERGUNTA 7b: a #10 diz «vira flaky», não diz quem abre a issue' }, async () => {
  const { text } = await prompts([FAIL.coreIntermitente]);
  assert.ok(oneLine(text, /\bissue\b/i, /\bflaky\b/), 'o prompt não manda abrir a issue flaky');
});

test('X3 portas fixas: o prompt do tester manda procurar portas fixas repetidas entre testes (EADDRINUSE), e duas falhas com EADDRINUSE na mesma porta em testes diferentes aparecem no retorno com a porta', { todo: 'PERGUNTA 7c: fora dos critérios da #10' }, async () => {
  const f = (name, file) => ({ test: `${file} > ${name}`, files: [file], suite: [1], isolated: true });
  const answer = () => { const d = declared([f('x', 'tests/core.test.mjs'), f('y', 'tests/other.test.mjs')]); d.runs[0].failures.forEach((x) => { x.output = 'Error: listen EADDRINUSE: address already in use :::4807'; }); return d; };
  const run = await runWf(BATCH, batchArgs(pieces(2)), fakeImpl({ answer }));
  const text = testerCalls(run).map((c) => c.prompt).join('\n');
  assert.ok(/EADDRINUSE|fixed ports?|porta(s)? fixa/i.test(text), 'o prompt não fala de portas fixas');
  assert.match(JSON.stringify(run.out), /4807/, 'o retorno não aponta a porta repetida');
});

test('X4 ≤ 540 s: o prompt do tester manda partir os comandos para que cada um corra em primeiro plano em 540 s (9 min) ou menos', { todo: 'PERGUNTA 7d: fora dos critérios da #10 (FRAMEWORK 10.5 já o diz)' }, async () => {
  const { text } = await prompts();
  assert.ok(oneLine(text, /\b540\b|\b9 ?min/i), 'o prompt não tem o limite de 540 s');
  assert.match(text, /foreground|primeiro plano/i, 'o prompt não manda correr em primeiro plano');
});

test('X5 rótulos: o lote aprovado não depende de um campo de veredito que o tester escreve (passed:false do tester não reprova um lote limpo)', { todo: 'PERGUNTA 2: o campo do veredito' }, async () => {
  const run = await runWf(BATCH, batchArgs(pieces(2)), fakeImpl({ answer: () => ({ ...declared([]), passed: false, approved: false }) }));
  assert.ok(approved(run), show(run));
});
