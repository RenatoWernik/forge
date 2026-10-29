// F-08, critério 2: no modo rigoroso, a 3.ª reprovação, seja de que tipo for, devolve { id, stopped: "contract", metrics } e não
// lança a ronda 4. Oráculo: a simulação, com reprovações de critérios diferentes nas rondas 1, 2 e 3, e um gerador com semente
// que varia os tipos de reprovação (bloqueante de materialidade 1, 2 ou 3, testes a falhar, comparação perdida).
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, METRICS, ALWAYS, stopReason, fieldOf, contract, baseArgs, runWf, scenario, resultOf, devCount, criticCount, why, fail, rng, pick, shuffle } from './helpers.mjs';

const contractOk = (run, p, msg, same) => {
  const r = resultOf(run, p.id);
  assert.ok(r, 'sem resultado da peça: ' + msg + ' ' + why(run, p.id));
  assert.equal(stopReason(r), 'contract', msg + ' ' + why(run, p.id));
  assert.notEqual(r.won, true, msg);
  assert.equal(devCount(run, p), 3, 'devs lançados (a ronda 4 não pode existir): ' + msg);
  assert.equal(criticCount(run, p), 3, 'críticos lançados: ' + msg);
  const mt = fieldOf(r, 'metrics');
  assert.ok(mt && typeof mt === 'object', 'sem metrics: ' + msg);
  for (const m of METRICS) assert.ok(m in mt, `metrics.${m} em falta (${msg})`);
  assert.equal(mt.rounds, 3, 'metrics.rounds: ' + msg);
  if (same !== undefined) assert.equal(mt.sameCriterionFailures, same, 'metrics.sameCriterionFailures: ' + msg);
};

test('C2: C1, C2 e C3 reprovados nas rondas 1, 2 e 3 → stopped "contract", sem ronda 4, metrics.rounds 3 e sameCriterionFailures 1', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1), fail(2), fail(3)] }));
  contractOk(run, p, 'C1, C2, C3', 1);
});

test('C2: três reprovações de tipos diferentes (testes a falhar, comparação perdida, «reprova sempre» de regressão) → "contract"', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [{ testsPass: false }, { lost: true }, fail(4, 1, 'regression')] }));
  contractOk(run, p, 'testsPass false, lost, regressão');
});

test('C2 (gerador, semente 2026, 30 casos): 3 reprovações sem repetir critério → "contract" na ronda 3, nunca ronda 4', async () => {
  const r = rng(2026);
  const kinds = [(k) => fail(k, 2), (k) => fail(k, 3), (k) => fail(k, 1, pick(r, ALWAYS)[0]), () => ({ testsPass: false }), () => ({ lost: true })];
  for (let i = 0; i < 30; i++) {
    const ks = shuffle(r, [1, 2, 3, 4]).slice(0, 3);
    const plan = ks.map((k) => pick(r, kinds)(k));
    const p = contract('pg' + i, 9200 + i);
    const run = await runWf(BUILD, baseArgs([p]), scenario([p], { ['pg' + i]: plan }));
    contractOk(run, p, `caso ${i}: ${JSON.stringify(plan)}`);
  }
});

// Guarda (já passa na base, que corre sem limite): o rigoroso tem 3 rondas, por isso 2 reprovações de critérios diferentes e a
// aprovação na ronda 3 ganham na ronda 3, sem "contract" nem "redesign"
test('C2 (guarda): rigoroso, C1 e C2 reprovados nas rondas 1 e 2 e aprovação na 3 → ganha na ronda 3', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1), fail(2)] }));
  const r = resultOf(run, p.id);
  assert.ok(r && r.won === true && !stopReason(r), why(run, p.id));
  assert.equal(devCount(run, p), 3);
});
