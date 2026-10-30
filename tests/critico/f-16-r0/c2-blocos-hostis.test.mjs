// F-16 critério 2 (ATAQUE: vermelho na base 712b690, que conta 2+ blocos distintos quaisquer que sejam os comandos; #56).
// Oráculo: o corpus fechado de corpus.mjs (34 blocos hostis). Cada um entra numa passagem ao lado de um bloco válido, em TODAS as
// passagens do tipo (2 da suíte, 3 do E2E), à frente e atrás do válido, na suíte e no E2E, nos dois modos: 34 × 2 × 2 × 2 = 272
// lotes. Em todos: batch.verdict 'fail', reason 'runs', e o tipo atacado com menos execuções do que as do modo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CMD, MODES, SUITE_RUNS, E2E_RUNS, lote, partido, SUITE2, E2E3, verdictOf, reasonOf, show } from './helpers.mjs';
import { HOSTIS, PAR, F } from './corpus.mjs';

const K = { suite: CMD.test, e2e: CMD.e2e };
const N = { suite: SUITE_RUNS, e2e: E2E_RUNS };

for (const kind of ['suite', 'e2e']) {
  test(`C2 [${kind}] corpus hostil: cada bloco, à frente ou atrás de um bloco válido, dá fail com reason runs (2 modos)`, async () => {
    const bad = [];
    for (const mode of MODES) {
      for (const [nome, gen] of HOSTIS) {
        const h = gen(K[kind], F[kind]), ok = PAR[kind](K[kind]);
        for (const blocks of [[ok, h], [h, ok]]) {
          const outro = kind === 'suite' ? E2E3() : SUITE2();
          const r = await lote([...partido(kind, blocks, N[kind]), ...outro], { mode });
          const runs = r.out?.runs?.[kind];
          if (verdictOf(r) !== 'fail' || reasonOf(r) !== 'runs' || !(runs < N[kind])) bad.push(`${mode} ${nome} ${JSON.stringify(blocks)}: ${verdictOf(r)}/${reasonOf(r)}, runs.${kind} ${runs}`);
        }
      }
    }
    assert.deepEqual(bad.slice(0, 8), [], `${bad.length} de ${MODES.length * HOSTIS.length * 2} lotes contaram um bloco hostil:\n`);
  });
}

// Os 3 casos exatos do #56 e do contrato, um a um, para a mensagem dizer qual caiu
test('C2 o repro do #56: echo a e echo b nas passagens 1 e 2 dão fail com reason runs', async () => {
  const r = await lote([...partido('suite', ['echo a', 'echo b'], 2), ...E2E3()]);
  assert.equal(verdictOf(r), 'fail', show(r));
  assert.equal(reasonOf(r), 'runs', show(r));
});

test('C2 dois blocos que começam pelo testCommand, mas com um filtro inexistente em cada: fail com reason runs', async () => {
  const r = await lote([...partido('suite', [`${CMD.test} tests/nada`, `${CMD.test} tests/coisa.test.mjs`], 2), ...E2E3()]);
  assert.equal(verdictOf(r), 'fail', show(r));
  assert.equal(reasonOf(r), 'runs', show(r));
});

test('C2 E2E: 3 passagens com echo a e echo b dão fail com reason runs, e a suíte certa não chega para aprovar', async () => {
  const r = await lote([...SUITE2(), ...partido('e2e', ['echo a', 'echo b'], 3)]);
  assert.equal(verdictOf(r), 'fail', show(r));
  assert.equal(reasonOf(r), 'runs', show(r));
});
