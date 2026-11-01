// F-21b, C1: `graph:update` no início de cada execução (decisão B2; resposta do orquestrador: UMA por execução de workflow).
// Oráculos do corpo da #74: o build, o batch e o ponytail fazem exatamente UMA chamada agent() com o label `graph:update` por execução,
// a primeira de todas (depois da validação dos args), com o modelo e o esforço de models.aux; o prompt tem
// `node "<root>/.claude/graph.mjs" update`, manda correr em primeiro plano e responder só com a última linha; uma resposta que não comece
// por `graph:` (incluindo null) só regista `WARNING graph:update: <resposta truncada a 100>` e os resultados não mudam; args inválidos
// continuam a lançar 0 agentes; o gauntlet-attacks não ganha a chamada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, srcBase, runWf, fake, plain, why, updates, refused, buildArgs, attacksArgs, ponyArgs, batchArgs, piece, unit, PROBE, LABEL, UPDATE_CMD, LOG_UPDATE } from './helpers.mjs';

// Execuções com várias peças, rondas e unidades: a chamada tem de ser UMA por execução, nunca uma por peça ou por ronda
const RUNS = {
  build: (o = {}) => [buildArgs([piece('pa'), piece('pb')], o), { winAt: 3 }],
  'build (parallel)': (o = {}) => [buildArgs([piece('pa'), piece('pb')], { parallel: true, ...o }), { winAt: 2 }],
  batch: (o = {}) => [batchArgs(o), {}],
  ponytail: (o = {}) => [ponyArgs([unit('u1'), unit('u2')], o), { ponyWinAt: 2 }],
};
const fileOf = (k) => k.split(' ')[0];
const go = (k, over = {}, f = {}) => { const [args, opts] = RUNS[k](over); return runWf(srcNow(fileOf(k) === 'ponytail' ? 'ponytail' : fileOf(k)), args, fake({ ...opts, ...f })); };

for (const k of Object.keys(RUNS)) {
  test(`C1 [ataque] (${k}): exatamente UMA chamada graph:update, a primeira de todas, com o modelo e o esforço de models.aux`, async () => {
    const run = await go(k);
    assert.equal(run.err, undefined, why(run));
    const u = updates(run);
    assert.equal(u.length, 1, `chamadas graph:update: ${u.length}; ${why(run)}`);
    assert.equal(run.calls[0].opts.label, LABEL, 'a primeira chamada não é graph:update: ' + why(run));
    assert.ok(run.calls.length > 2, 'a execução parou depois do graph:update: ' + why(run));
    assert.equal(u[0].opts.model, PROBE.aux.model, 'modelo do graph:update');
    assert.equal(u[0].opts.effort, PROBE.aux.effort, 'esforço do graph:update');
  });

  test(`C1 [ataque] (${k}): o prompt do graph:update tem node "<root>/.claude/graph.mjs" update, em primeiro plano, e pede só a última linha`, async () => {
    for (const root of ['/proj', 'E:/work/proj']) {
      const run = await go(k, { root });
      const [u] = updates(run);
      assert.ok(u, 'sem chamada graph:update: ' + why(run));
      assert.ok(u.prompt.includes(UPDATE_CMD(root)), `root ${root}: o prompt não tem ${UPDATE_CMD(root)}: ${u.prompt.slice(0, 600)}`);
      assert.match(u.prompt, /foreground/i, 'o prompt não manda correr em primeiro plano');
      assert.match(u.prompt, /\b(last|final) line\b/i, 'o prompt não pede só a última linha');
    }
  });

  test(`C1 [ataque] (${k}): uma resposta que não começa por graph: (null, texto, texto longo) só regista o WARNING literal truncado a 100, e os resultados não mudam`, async () => {
    const ref = await go(k, {}, { graph: 'graph: updated 42 nodes' });
    assert.equal(ref.err, undefined, why(ref));
    assert.ok(!ref.logs.some((l) => l.startsWith('WARNING graph:update')), 'WARNING com uma resposta graph: ' + JSON.stringify(ref.logs));
    const long = 'Error: ENOENT, no such file or directory, open graphify-out/graph.json; ' + 'x'.repeat(200) + 'TAIL';
    for (const resp of [null, 'ok', 'node: command not found', long]) {
      const run = await go(k, {}, { graph: resp });
      assert.equal(run.err, undefined, `resposta ${JSON.stringify(resp).slice(0, 40)}: a execução parou: ` + why(run));
      assert.ok(run.logs.includes(LOG_UPDATE(resp)), `resposta ${JSON.stringify(resp).slice(0, 40)}: falta o log «${LOG_UPDATE(resp).slice(0, 60)}...»: ${JSON.stringify(run.logs.filter((l) => l.includes('graph')))}`);
      assert.deepEqual(plain(run.out), plain(ref.out), `resposta ${JSON.stringify(resp).slice(0, 40)}: os resultados mudaram`);
      assert.equal(run.calls.length, ref.calls.length, 'a execução não continuou igual');
    }
  });
}

test('C1 [guarda]: o gauntlet-attacks não faz nenhuma chamada graph:update (uma ou várias peças, em série ou em paralelo)', async () => {
  for (const args of [attacksArgs([piece('pa')]), attacksArgs([piece('pa'), piece('pb')], { parallel: true })]) {
    const run = await runWf(srcNow('attacks'), args, fake());
    assert.equal(run.err, undefined, why(run));
    assert.ok(run.calls.length >= 2, why(run));
    assert.equal(updates(run).length, 0, 'o gauntlet-attacks ganhou a chamada graph:update');
  }
});

// Args inválidos, como a BASE os recusa: o graph:update nunca vem antes da validação (0 agentes)
const INVALID = {
  build: [
    buildArgs([piece('pa')], { root: undefined }), buildArgs([piece('pa')], { dashboardUrl: '' }), buildArgs([], {}), buildArgs([piece('pa')], { mode: 'fast' }),
    buildArgs([piece('pa')], { models: { ...PROBE, aux: { model: 'probe-aux', effort: 'huge' } } }), buildArgs([piece('pa', { objective: '' })]),
    buildArgs([piece('pa', { criteria: [{ text: 'It never fails', command: 'node t.mjs' }] })]), buildArgs([piece('pa', { ui: 'yes' })]),
  ],
  batch: [batchArgs({ testCommand: '' }), batchArgs({ mode: undefined }), batchArgs({ pieces: [1, 2, 3, 4].map((i) => ({ id: 'p' + i, title: 'P', owns: ['a' + i] })) }), batchArgs({ models: { ...PROBE, tester: {} } })],
  ponytail: [ponyArgs([unit('u1')], { testCommand: undefined }), ponyArgs([]), ponyArgs([unit('u1', { paths: [] })]), ponyArgs([unit('u1')], { root: '' })],
  attacks: [attacksArgs([piece('pa')], { root: undefined }), attacksArgs([piece('pa', { issue: 0 })])],
};
for (const [name, list] of Object.entries(INVALID)) {
  test(`C1 [guarda] (${name}): args inválidos continuam a lançar 0 agentes (nenhum graph:update antes da validação)`, async () => {
    for (const [i, args] of list.entries()) {
      const base = await runWf(srcBase(name), args, fake());
      assert.ok(refused(base), `controlo: a BASE não recusa o caso ${i}`);
      const run = await runWf(srcNow(name), args, fake());
      assert.ok(refused(run), `caso ${i}: ${run.calls.length} agentes (${run.calls.map((c) => c.opts.label).join()}); ${why(run)}`);
    }
  });
}