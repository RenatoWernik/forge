// F-09 critério 3: uma regressão devolve {regressions:[{piece, test, output}]} com a peça que a causou, identificada pelos owns
// dos ficheiros do teste que falha ou pelo diff. Oráculo: REGRESSION_CASES (corpus.mjs): nenhuma, uma de uma peça, duas de peças
// diferentes, e uma ao lado de um flaky. Cada caso corre com o tester a dizer a verdade nos rótulos e a mentir neles: o workflow
// atribui a peça a partir dos ficheiros declarados, nunca do rótulo `piece` do tester.
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, MODES, runWf, batchArgs, pieces, fakeImpl, declared, regsOf, flakyOf, pairs, approved, show } from './helpers.mjs';
import { REGRESSION_CASES } from './corpus.mjs';

for (const mode of MODES) {
  for (const [name, failures, want] of REGRESSION_CASES) {
    for (const lie of [false, true]) {
      test(`C3 ${mode}: ${name}${lie ? ' (tester a mentir nos rótulos)' : ''}`, async () => {
        const run = await runWf(BATCH, batchArgs(pieces(3), { mode }), fakeImpl({ answer: () => declared(failures, { lie }) }));
        assert.ok(!run.err, show(run));
        assert.ok(Array.isArray(regsOf(run.out)), 'o retorno não tem regressions: ' + show(run));
        assert.deepEqual([...new Set(pairs(run.out))], want.regs, 'peça|teste das regressões');
        assert.deepEqual([...new Set(flakyOf(run.out))].sort(), want.flaky, 'flaky');
        assert.equal(approved(run), want.approved, 'veredito do lote: ' + show(run));
        for (const r of regsOf(run.out)) {
          assert.equal(typeof r.output, 'string', 'regressão sem output');
          assert.ok(r.output.includes(`MARK<${r.test}>`), `o output da regressão de «${r.test}» não é o que o tester declarou: ${r.output}`);
        }
      });
    }
  }
}
