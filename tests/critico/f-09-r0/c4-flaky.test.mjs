// F-09 critério 4: uma falha que passa numa repetição isolada e cujo teste não toca nos ficheiros do lote vira `flaky` e não
// reprova o lote. Oráculo: FLAKY_CASES (corpus.mjs), os 4 casos do contrato (só o 1.º é flaky) mais 2 variantes, cada um com o
// tester a dizer a verdade e a mentir nos rótulos (flaky, class, piece, regressions, passed): a classificação sai só dos DADOS
// das execuções (falhas, ficheiros tocados, repetição isolada).
// Propriedade: 200 lotes gerados com a semente 20261029 (gerador genBatch, nos dois modos), cada um com o veredito que a definição
// do contrato manda (função expected). Ficam de fora os casos que o contrato não fixa (PERGUNTAS 5 e 6).
// Determinismo: o mesmo lote com as falhas declaradas por outra ordem dá o mesmo veredito.
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, MODES, runWf, batchArgs, pieces, fakeImpl, declared, regsOf, flakyOf, pairs, approved, show, rng, genBatch, expected } from './helpers.mjs';
import { FLAKY_CASES } from './corpus.mjs';

const verdict = (run) => ({ flaky: [...new Set(flakyOf(run.out))].sort(), regs: [...new Set(pairs(run.out))], approved: approved(run) });

for (const mode of MODES) {
  for (const [name, failures, want] of FLAKY_CASES) {
    for (const lie of [false, true]) {
      test(`C4 ${mode}: caso ${name}${lie ? ' (tester a mentir nos rótulos)' : ''}`, async () => {
        const run = await runWf(BATCH, batchArgs(pieces(3), { mode }), fakeImpl({ answer: () => declared(failures, { lie }) }));
        assert.ok(!run.err && Array.isArray(regsOf(run.out)), show(run));
        const v = verdict(run);
        assert.deepEqual(v.flaky, want.flaky, 'flaky: ' + show(run));
        if (want.regs) assert.deepEqual(v.regs, want.regs, 'regressões: ' + show(run));
        assert.equal(v.approved, want.approved, 'veredito do lote: ' + show(run));
      });
    }
  }
}

test('C4 propriedade: 200 lotes gerados (semente 20261029, 100 por modo), com o tester a mentir em metade, dão o veredito da definição do contrato', async () => {
  const r = rng(20261029), bad = [];
  for (let i = 0; i < 200; i++) {
    const mode = MODES[i % 2], { ps, failures } = genBatch(r, mode), lie = i % 4 >= 2;
    const want = expected(failures);
    const run = await runWf(BATCH, batchArgs(ps, { mode }), fakeImpl({ answer: () => declared(failures, { lie }) }));
    if (run.err || !Array.isArray(regsOf(run.out))) { bad.push(`#${i}: ${show(run)}`); continue; }
    const v = verdict(run);
    const loose = failures.filter((f) => !f.truthFlaky && !f.owner).map((f) => f.test);
    const regsOwned = v.regs.filter((p) => !loose.includes(p.slice(p.indexOf('|') + 1)));
    if (JSON.stringify(v.flaky) !== JSON.stringify(want.flaky) || JSON.stringify(regsOwned) !== JSON.stringify(want.regs) || v.approved !== want.approved) {
      bad.push(`#${i} ${mode}${lie ? ' (mente)' : ''}: queria ${JSON.stringify(want)}, veio ${JSON.stringify(v)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} de 200 lotes com o veredito errado`);
});

test('C4 determinismo: as mesmas falhas declaradas por outra ordem (execuções e repetições isoladas invertidas) dão o mesmo veredito', async () => {
  const r = rng(77), diffs = [];
  for (let i = 0; i < 40; i++) {
    const { ps, failures } = genBatch(r, 'accelerated');
    const a = declared(failures), b = declared([...failures].reverse());
    b.runs.reverse(); b.isolated.reverse();
    const [x, y] = [await runWf(BATCH, batchArgs(ps, { mode: 'accelerated' }), fakeImpl({ answer: a })), await runWf(BATCH, batchArgs(ps, { mode: 'accelerated' }), fakeImpl({ answer: b }))];
    if (x.err || y.err || JSON.stringify(verdict(x)) !== JSON.stringify(verdict(y))) diffs.push(`#${i}: ${show(x)} ≠ ${show(y)}`);
  }
  assert.deepEqual(diffs.slice(0, 3), [], `${diffs.length} de 40`);
});

test('C4 controlo do oráculo: o tester falso declara as falhas onde o corpus diz (2 execuções da suíte, 3 do E2E, uma repetição isolada por teste)', () => {
  const d = declared(FLAKY_CASES[0][1]);
  assert.deepEqual(d.runs.map((x) => x.kind), ['suite', 'suite', 'e2e', 'e2e', 'e2e']);
  assert.deepEqual(d.runs.map((x) => x.failures.length), [0, 1, 0, 0, 0]);
  assert.deepEqual(d.isolated.map((x) => x.passed), [true]);
  assert.equal(pieces(3).flatMap((p) => p.owns).some((f) => FLAKY_CASES[0][1][0].files.includes(f)), false, 'o caso 1 toca num ficheiro do lote');
});
