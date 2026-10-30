// F-09, Ronda 1 (falha 1, decisão do orquestrador): um comando partido em blocos (≤ 540 s) declara-se com `pass: 1..N` em cada entrada de
// `runs`. Uma execução completa é o conjunto dos blocos do mesmo `pass`; o número de execuções é o número de `pass` distintos com todos os
// blocos presentes; «falhou em todas as execuções» mede-se sobre as passagens do bloco onde o teste vive. Casos A4b e A4c do crítico, mais
// um gerador da classe «suíte em k blocos, k ∈ {1, 2, 3}». Adicionado pelo dev: os ataques anteriores não mudam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH, CMD, T, runWf, batchArgs, pieces, fakeImpl, classesOf, verdictOf, reasonOf, batchOf, show, rng, pick, classFor } from './helpers.mjs';

const ent = (kind, command, pass, failures = []) => ({ [T.kind]: kind, [T.command]: command, pass, [T.failures]: failures.map((f) => ({ [T.test]: f.test, [T.files]: f.files, [T.output]: `MARK<${f.test}> ${command} ${pass}` })) });
const E2E3 = [1, 2, 3].map((p) => ent('e2e', CMD.e2e, p));
const PF = ['tests/a.test.mjs', 'tests/b.test.mjs', 'tests/c.test.mjs']; // F-16 (#57): com 2+ blocos, cada um é o comando mais filtros que existem em args.projectFiles
const bl = (f) => `${CMD.test} ${f}`, A = bl(PF[0]), B = bl(PF[1]);
const go = (declaration, mode = 'rigorous') => runWf(BATCH, batchArgs(pieces(2), { mode, projectFiles: PF }), fakeImpl({ answer: () => declaration }));
const CORE = ['tests/core.test.mjs', 'src/core.js'];
const t1 = { test: 'tests/core.test.mjs > soma', files: CORE };
const proof = (isolated, main) => ({ [T.isolated]: [{ [T.test]: t1.test, [T.passed]: isolated, [T.output]: 'iso' }], [T.main]: main ? [{ [T.test]: t1.test, [T.results]: main, [T.output]: 'main' }] : [] });

test('C8 A4b: a suíte completa corrida UMA vez em 2 blocos (pass 1 nos dois) não é aprovada: fail com reason runs', async () => {
  const r = await go({ runs: [ent('suite', A, 1), ent('suite', B, 1), ...E2E3], isolated: [], main: [] });
  assert.equal(verdictOf(r), 'fail', show(r));
  assert.equal(reasonOf(r), 'runs', show(r));
  assert.equal(r.out.runs.suite, 1, show(r));
});

test('C8 a suíte em 2 blocos corrida 2× (pass 1 e 2, os dois blocos em cada) conta 2 execuções e aprova; uma passagem a que falta um bloco não conta', async () => {
  const ok = await go({ runs: [ent('suite', A, 1), ent('suite', B, 1), ent('suite', A, 2), ent('suite', B, 2), ...E2E3], isolated: [], main: [] });
  assert.equal(verdictOf(ok), 'pass', show(ok));
  assert.equal(ok.out.runs.suite, 2);
  const short = await go({ runs: [ent('suite', A, 1), ent('suite', B, 1), ent('suite', A, 2), ...E2E3], isolated: [], main: [] });
  assert.equal(reasonOf(short), 'runs', show(short));
  assert.equal(short.out.runs.suite, 1);
});

test('C8 A4c: falha em todas as passagens do bloco A, passa isolado e nunca falha na main, fora do diff → (a) e o lote falha (o caso da Guilda #103)', async () => {
  const r = await go({ runs: [ent('suite', A, 1, [t1]), ent('suite', B, 1), ent('suite', A, 2, [t1]), ent('suite', B, 2), ...E2E3], ...proof(true, [true, true]) });
  assert.equal(classesOf(r.out)[t1.test], 'a', show(r));
  assert.equal(verdictOf(r), 'fail', show(r));
});

test('C8 o mesmo teste a falhar só numa das 2 passagens do bloco A (intermitente) e a passar isolado → (c); com a main a falhar sempre e falhando em todas → (b)', async () => {
  const some = await go({ runs: [ent('suite', A, 1, [t1]), ent('suite', B, 1), ent('suite', A, 2), ent('suite', B, 2), ...E2E3], ...proof(true, [true, true]) });
  assert.equal(classesOf(some.out)[t1.test], 'c', show(some));
  assert.equal(verdictOf(some), 'pass', show(some));
  const b = await go({ runs: [ent('suite', A, 1, [t1]), ent('suite', B, 1), ent('suite', A, 2, [t1]), ent('suite', B, 2), ...E2E3], ...proof(true, [false, false]) });
  assert.equal(classesOf(b.out)[t1.test], 'b', show(b));
});

test('C8 propriedade: 90 lotes com a suíte em k ∈ {1, 2, 3} blocos e 2 passagens (semente 20261030), um teste fora do diff num bloco ao acaso, dão a classe do contrato e o veredito', async () => {
  const r = rng(20261030), bad = [];
  const tally = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 90; i++) {
    const k = 1 + (i % 3), blocks = k === 1 ? [CMD.test] : Array.from({ length: k }, (_, j) => bl(PF[j])), own = Math.floor(r() * k);
    const all = r() < 0.5, isolated = r() < 0.5, main = pick(r, [undefined, 'all', 'some', 'none']);
    const failIn = all ? [1, 2] : [pick(r, [1, 2])];
    const runs = [];
    for (const pass of [1, 2]) blocks.forEach((b, j) => runs.push(ent('suite', b, pass, j === own && failIn.includes(pass) ? [t1] : [])));
    const results = main === 'all' ? [false, false] : main === 'none' ? [true, true] : main === 'some' ? [true, false] : null;
    const run = await go({ runs: [...runs, ...E2E3], ...proof(isolated, results) }, i % 2 ? 'accelerated' : 'rigorous');
    const want = classFor({ owners: [], isolated, all, main });
    if (run.err || !batchOf(run.out)) { bad.push(`#${i}: ${show(run)}`); continue; }
    tally[k]++;
    if (classesOf(run.out)[t1.test] !== want || verdictOf(run) !== (want === 'a' ? 'fail' : 'pass') || run.out.runs.suite !== 2) bad.push(`#${i} k=${k} all=${all} isolated=${isolated} main=${main}: ${classesOf(run.out)[t1.test]} ≠ ${want}, runs.suite ${run.out.runs.suite}`);
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} de 90 lotes errados`);
  assert.deepEqual(tally, { 1: 30, 2: 30, 3: 30 });
});
