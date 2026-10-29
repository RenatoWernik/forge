// F-09 critério 4, com as respostas R3 e R6: a classe de cada falha (a regressão do diff, b já na main, c flaky) sai só dos DADOS
// declarados (falhas por execução, ficheiros tocados, repetição isolada, prova na main), nunca dos rótulos do tester. Só c não
// reprova o lote. Oráculo: FLAKY_CASES (corpus.mjs), os 4 casos do contrato (o 3.º partido pela prova na main: falha igual → b,
// não falha → a, sem prova → a), 2 variantes («pelo diff» e no E2E) e os 4 casos da R6 (falha em todas as execuções e passa
// isolado: c, b ou a conforme a main). Cada caso corre com o tester a dizer a verdade e a mentir nos rótulos (class, flaky, piece,
// batch, regressions, verdict, passed).
// Propriedade: 200 lotes gerados com a semente 20261029 (gerador genBatch, nos dois modos; inclui testes que tocam em 2 peças), com a
// classe da função classFor (a regra escrita na LEITURA DO CONTRATO de helpers.mjs).
// Determinismo: o mesmo lote com as declarações por outra ordem dá o mesmo resultado.
// Depende do F-08: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, MODES, runWf, batchArgs, pieces, fakeImpl, declared, batchOf, classesOf, verdictOf, pairs, show, rng, genBatch, expected } from './helpers.mjs';
import { FLAKY_CASES } from './corpus.mjs';

const result = (run) => ({ classes: classesOf(run.out), regs: pairs(run.out), verdict: verdictOf(run) });

for (const mode of MODES) {
  for (const [name, failures, want] of FLAKY_CASES) {
    for (const lie of [false, true]) {
      test(`C4 ${mode}: caso ${name}${lie ? ' (tester a mentir nos rótulos)' : ''}`, async () => {
        const run = await runWf(BATCH, batchArgs(pieces(3), { mode }), fakeImpl({ answer: () => declared(failures, { lie }) }));
        assert.ok(!run.err && batchOf(run.out), show(run));
        const v = result(run);
        assert.deepEqual(v.classes, want.classes, 'classes: ' + show(run));
        if (want.regs) assert.deepEqual(v.regs, want.regs, 'regressões: ' + show(run));
        if (want.verdict) assert.equal(v.verdict, want.verdict, 'veredito do lote: ' + show(run));
      });
    }
  }
}

test('C4 propriedade: 200 lotes gerados (semente 20261029, 100 por modo), com o tester a mentir em metade, dão as classes, as regressões e o veredito do contrato', async () => {
  const r = rng(20261029), bad = [];
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const mode = MODES[i % 2], { ps, failures } = genBatch(r, mode), lie = i % 4 >= 2;
    total += failures.length;
    const want = expected(failures);
    const run = await runWf(BATCH, batchArgs(ps, { mode }), fakeImpl({ answer: () => declared(failures, { lie }) }));
    if (run.err || !batchOf(run.out)) { bad.push(`#${i}: ${show(run)}`); continue; }
    const v = result(run);
    const loose = failures.filter((f) => f.cls === 'a' && !f.owners.length).map((f) => f.test);
    const regs = v.regs.filter((p) => !loose.includes(p.slice(p.indexOf('|') + 1)));
    const sorted = (o) => JSON.stringify(Object.entries(o).sort());
    if (sorted(v.classes) !== sorted(want.classes)) bad.push(`#${i} ${mode}${lie ? ' (mente)' : ''}: classes ${JSON.stringify(v.classes)} ≠ ${JSON.stringify(want.classes)}`);
    else if (JSON.stringify(regs) !== JSON.stringify(want.regs)) bad.push(`#${i}: regressões ${JSON.stringify(v.regs)} ≠ ${JSON.stringify(want.regs)}`);
    else if (want.verdict && v.verdict !== want.verdict) bad.push(`#${i}: veredito ${v.verdict} ≠ ${want.verdict}`);
  }
  assert.ok(total >= 300, 'o gerador produziu poucas falhas: ' + total);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} de 200 lotes errados`);
});

test('C4 determinismo: as mesmas falhas declaradas por outra ordem (execuções, repetições isoladas e prova na main invertidas) dão o mesmo resultado', async () => {
  const r = rng(77), diffs = [];
  const norm = (run) => JSON.stringify({ ...result(run), classes: Object.entries(classesOf(run.out)).sort() });
  for (let i = 0; i < 40; i++) {
    const { ps, failures } = genBatch(r, 'accelerated');
    const a = declared(failures), b = declared([...failures].reverse());
    b.runs.reverse(); b.isolated.reverse(); b.main.reverse();
    const [x, y] = [await runWf(BATCH, batchArgs(ps, { mode: 'accelerated' }), fakeImpl({ answer: a })), await runWf(BATCH, batchArgs(ps, { mode: 'accelerated' }), fakeImpl({ answer: b }))];
    if (x.err || y.err || norm(x) !== norm(y)) diffs.push(`#${i}: ${show(x)} ≠ ${show(y)}`);
  }
  assert.deepEqual(diffs.slice(0, 3), [], `${diffs.length} de 40`);
});

test('C4 controlo do oráculo: o tester falso declara as falhas e a prova na main onde o corpus diz', () => {
  const d = declared(FLAKY_CASES[0][1]);
  assert.deepEqual(d.runs.map((x) => x.kind), ['suite', 'suite', 'e2e', 'e2e', 'e2e']);
  assert.deepEqual(d.runs.map((x) => x.failures.length), [0, 1, 0, 0, 0]);
  assert.deepEqual(d.isolated.map((x) => x.passed), [true]);
  assert.deepEqual(d.main, []);
  assert.deepEqual(declared(FLAKY_CASES[2][1]).main.map((x) => x.results), [[false, false]]);
  assert.deepEqual(declared(FLAKY_CASES[8][1]).main.map((x) => x.results), [[true, false, true]]);
  assert.equal(pieces(3).flatMap((p) => p.owns).some((f) => FLAKY_CASES[0][1][0].files.includes(f)), false, 'o caso 1 toca num ficheiro do lote');
});
