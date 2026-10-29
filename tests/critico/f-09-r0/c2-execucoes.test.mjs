// F-09 critério 2: o tester corre a suíte completa 2× e o E2E 3×, com o testCommand e o e2eCommand dos args; sem e2eCommand, a
// parte do E2E fica «n/a». Oráculo: a contagem das execuções declaradas pelo tester falso e os dois comandos no prompt dele.
// Leitura (PERGUNTA 4): a contagem conta. Um tester que declara menos execuções do que as do contrato não dá um lote aprovado.
// O tester reconhece-se pelo par modelo/esforço de models.tester (sondas distintas por papel). Nos dois modos.
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, MODES, CMD, runWf, batchArgs, pieces, fakeImpl, declared, testerCalls, roleOf, approved, refused, show } from './helpers.mjs';

const go = (over, answer) => runWf(BATCH, batchArgs(pieces(2), over), fakeImpl({ answer }));
const prompts = (run) => testerCalls(run).map((c) => c.prompt).join('\n');

for (const mode of MODES) {
  test(`C2 ${mode}: o tester corre com models.tester e o prompt dele traz o testCommand e o e2eCommand dos args, literais`, async () => {
    const run = await go({ mode }, () => declared([]));
    assert.ok(!run.err, show(run));
    assert.ok(testerCalls(run).length >= 1, 'nenhum agent() com o modelo e o esforço de models.tester: ' + JSON.stringify(run.calls.map((c) => c.opts)));
    assert.ok(prompts(run).includes(CMD.test), 'o prompt do tester não traz o testCommand');
    assert.ok(prompts(run).includes(CMD.e2e), 'o prompt do tester não traz o e2eCommand');
    const outros = run.calls.filter((c) => !['tester', 'aux'].includes(roleOf(c)) && (c.prompt.includes(CMD.test) || c.prompt.includes(CMD.e2e)));
    assert.deepEqual(outros.map((c) => c.opts), [], 'os comandos foram para um agente que não é o tester');
  });

  test(`C2 ${mode}: o tester que declara a suíte 2× e o E2E 3×, sem falhas, dá um lote aprovado`, async () => {
    const run = await go({ mode }, () => declared([]));
    assert.ok(approved(run), show(run));
  });

  for (const [label, counts] of [['a suíte 1×', { suite: 1 }], ['o E2E 2×', { e2e: 2 }], ['nenhuma execução', { suite: 0, e2e: 0 }]]) {
    test(`C2 ${mode}: um tester que declara só ${label} não dá um lote aprovado`, async () => {
      const run = await go({ mode }, () => declared([], counts));
      assert.ok(!approved(run), 'aprovou um lote com execuções em falta: ' + show(run));
    });
  }

  test(`C2 ${mode}: sem e2eCommand, o E2E fica «n/a» (no retorno), nenhum prompt leva undefined ou null no lugar do comando, e a suíte 2× sem E2E aprova`, async () => {
    const args = batchArgs(pieces(2), { mode });
    delete args.e2eCommand;
    const run = await runWf(BATCH, args, fakeImpl({ answer: () => declared([], { e2e: 0 }) }));
    assert.ok(!run.err, show(run));
    assert.ok(prompts(run).includes(CMD.test), 'o prompt do tester não traz o testCommand');
    assert.ok(!/\bundefined\b|\bnull\b/.test(prompts(run)), 'o prompt do tester tem undefined ou null');
    assert.match(JSON.stringify(run.out), /n\/a/i, 'o retorno não diz «n/a» para o E2E');
    assert.ok(approved(run), show(run));
  });
}

test('C2 sem testCommand (o único comando obrigatório) o lote não lança nenhum agent()', async () => {
  for (const testCommand of [undefined, '', '   ']) {
    const run = await go({ testCommand }, () => declared([]));
    assert.ok(refused(run), `testCommand ${JSON.stringify(testCommand)}: ${run.calls.length} agent(); ${show(run)}`);
  }
});
