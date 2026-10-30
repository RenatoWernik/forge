// Ponto juntado ao F-14 pelo orquestrador: o A4d do F-09 (#10, veredito R2 6518861306, «OUTRAS LACUNAS»). Hoje uma execução declarada
// com um comando que não é o testCommand (ou, no E2E, o e2eCommand) conta como execução do lote; tem de passar a recusar.
// Oráculo: no formato sem blocos (sem `pass`), 2 execuções da suíte com outro comando, ou 3 do E2E com outro comando, não chegam:
// veredito fail com reason runs, como o A4b. Guarda: os mesmos dados com os comandos certos aprovam. O comando com espaços nas pontas
// conta como o mesmo (B4 do F-09). Os blocos (`pass`) e o B13 ficam como estão: não são atacados aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, CMD, runWf, batchArgs, pieces, fakeImpl, verdictOf, reasonOf, show } from '../f-09-r0/helpers.mjs';

const run = (runs) => runWf(BATCH, batchArgs(pieces(3)), fakeImpl({ answer: () => ({ runs, isolated: [], main: [] }) }));
const S = (command) => ({ kind: 'suite', command, failures: [] });
const E = (command) => ({ kind: 'e2e', command, failures: [] });
const E2E3 = [1, 2, 3].map(() => E(CMD.e2e));

test('A4d guarda: 2 suítes com o testCommand e 3 E2E com o e2eCommand aprovam; com espaços nas pontas também', async () => {
  for (const sp of ['', '  ']) {
    const r = await run([S(sp + CMD.test + sp), S(CMD.test), ...E2E3]);
    assert.equal(verdictOf(r), 'pass', show(r));
  }
});

for (const [nome, outro] of [['outro comando', 'node --test tests/outra/*.test.mjs'], ['um prefixo do testCommand', CMD.test.split(' ').slice(0, 2).join(' ')], ['o e2eCommand no lugar da suíte', CMD.e2e]]) {
  test(`A4d: 2 execuções da suíte com ${nome} não contam como execuções: fail com reason runs`, async () => {
    const r = await run([S(outro), S(outro), ...E2E3]);
    assert.equal(verdictOf(r), 'fail', show(r));
    assert.equal(reasonOf(r), 'runs', show(r));
  });
}

test('A4d: uma das 2 suítes com outro comando deixa só 1 execução: fail com reason runs', async () => {
  const r = await run([S(CMD.test), S('node --test tests/outra/*.test.mjs'), ...E2E3]);
  assert.equal(reasonOf(r), 'runs', show(r));
});

test('A4d: 3 E2E com um comando que não é o e2eCommand não contam: fail com reason runs', async () => {
  const r = await run([S(CMD.test), S(CMD.test), ...[1, 2, 3].map(() => E('npx playwright test outro'))]);
  assert.equal(verdictOf(r), 'fail', show(r));
  assert.equal(reasonOf(r), 'runs', show(r));
});
