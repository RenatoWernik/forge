// F-09 critério 1: o lote recusa, antes de qualquer agent(), um tamanho acima do do modo (mais de 3 peças no rigorous, mais de 5 no
// accelerated). Oráculo: a tabela literal SIZES (3, 4, 5 e 6 peças × 2 modos = 8 casos). Recusa = zero agent() (nem tester nem
// painel) e nenhum retorno com `batch`; aceite = o tester corre e o lote dá um retorno com `batch` (R2).
// Mais: o limite vem do `mode` dos args, não de um número fixo (as mesmas 4 e 5 peças mudam de destino com o modo).
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, runWf, batchArgs, pieces, fakeImpl, testerCalls, refused, batchOf, show } from './helpers.mjs';
import { SIZES } from './corpus.mjs';

for (const [mode, k, ok] of SIZES) {
  test(`C1 ${mode}, ${k} peças → ${ok ? 'aceita e corre o tester' : 'recusa antes de qualquer agent()'}`, async () => {
    const run = await runWf(BATCH, batchArgs(pieces(k), { mode }), fakeImpl());
    if (ok) {
      assert.ok(!run.err, show(run));
      assert.ok(testerCalls(run).length >= 1, 'o tester não correu');
      assert.ok(batchOf(run.out), 'o retorno não tem batch: ' + show(run));
    } else {
      assert.ok(refused(run), `não recusou: ${run.calls.length} agent(); ${show(run)}`);
    }
  });
}

test('C1 o limite segue o mode dos args: 4 peças recusadas no rigorous e aceites no accelerated, com tudo o resto igual', async () => {
  const [r, a] = [await runWf(BATCH, batchArgs(pieces(4), { mode: 'rigorous' }), fakeImpl()), await runWf(BATCH, batchArgs(pieces(4), { mode: 'accelerated' }), fakeImpl())];
  assert.ok(refused(r), 'rigorous não recusou: ' + show(r));
  assert.ok(!a.err && testerCalls(a).length >= 1, 'accelerated não correu: ' + show(a));
});
