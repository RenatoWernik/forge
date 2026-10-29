// F-08, critério 1: o mesmo critério reprovado em duas rondas devolve { id, stopped: "redesign", criterion, metrics } e não lança a
// ronda seguinte, nos dois modos. Oráculo: a simulação (crítico falso que reprova C1 nas rondas 1 e 2) e um gerador com semente.
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, METRICS, MODES, ALWAYS, stopReason, fieldOf, repro, contract, baseArgs, runWf, scenario, resultOf, devCount, criticCount, sameCrit, why, fail, failMany, rng, pick, shuffle } from './helpers.mjs';

const redesignOk = (run, p, k, msg) => {
  const r = resultOf(run, p.id);
  assert.ok(r, 'sem resultado da peça: ' + msg + ' ' + why(run, p.id));
  assert.equal(stopReason(r), 'redesign', msg + ' ' + why(run, p.id));
  assert.ok(sameCrit(fieldOf(r, 'criterion'), k), `criterion devia ser C${k}: ${JSON.stringify(fieldOf(r, 'criterion'))} (${msg})`);
  assert.notEqual(r.won, true, 'uma peça parada para REDESENHO não ganhou: ' + msg);
  assert.equal(devCount(run, p), 2, 'devs lançados (a ronda 3 não pode existir): ' + msg);
  assert.equal(criticCount(run, p), 2, 'críticos lançados: ' + msg);
  const mt = fieldOf(r, 'metrics');
  assert.ok(mt && typeof mt === 'object', 'sem metrics: ' + msg);
  for (const m of METRICS) assert.ok(m in mt, `metrics.${m} em falta (${msg})`);
  assert.equal(mt.rounds, 2, 'metrics.rounds: ' + msg);
  assert.equal(mt.sameCriterionFailures, 2, 'metrics.sameCriterionFailures: ' + msg);
};

for (const mode of MODES) {
  // No acelerado, a R2 só reprova o «reprova sempre» e o critério central (critério 3): o C1 repetido é central
  test(`C1 (${mode}): C1 reprovado nas rondas 1 e 2 → stopped "redesign", criterion C1, sem ronda 3`, async () => {
    const p = contract('pa', 9101, { central: [1] });
    const run = await runWf(BUILD, baseArgs([p], { mode }), scenario([p], { pa: [fail(1), fail(1)] }));
    redesignOk(run, p, 1, mode);
  });

  test(`C1 (${mode}): o mesmo critério num «reprova sempre» (materialidade 1) nas rondas 1 e 2 → "redesign"`, async () => {
    const p = contract('pa', 9101);
    const run = await runWf(BUILD, baseArgs([p], { mode }), scenario([p], { pa: [fail(1, 1, 'no-evidence'), fail(1, 1, 'no-evidence')] }));
    redesignOk(run, p, 1, mode);
  });
}

test('C1 (rigorous): C1 não central, materialidade 2 e depois 3, nas rondas 1 e 2 → "redesign" C1', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1, 2), fail(1, 3)] }));
  redesignOk(run, p, 1, 'rigorous, materialidade 2 → 3');
});

// Gerador com semente: o critério repetido, a materialidade e o ruído (outros critérios na R1) variam; duas peças em paralelo
test('C1 (gerador, semente 808, 24 casos): o critério repetido nas rondas 1 e 2 é o que volta em "redesign", nos dois modos', async () => {
  const r = rng(808);
  for (let i = 0; i < 24; i++) {
    const mode = MODES[i % 2], k = 1 + Math.floor(r() * 4), others = shuffle(r, [1, 2, 3, 4].filter((x) => x !== k));
    const mat = mode === 'accelerated' ? pick(r, [1, 2, 3]) : pick(r, [2, 3]);
    const cat = mat === 1 ? pick(r, ALWAYS)[0] : undefined;
    const p = contract('pg' + i, 9200 + i, { central: mode === 'accelerated' ? [k] : [] });
    const q = contract('qg' + i, 9300 + i);
    const r1 = failMany([k, mat, cat], ...others.slice(0, Math.floor(r() * 3)).map((o) => [o, 2]));
    const run = await runWf(BUILD, baseArgs([p, q], { mode }), scenario([p, q], { ['pg' + i]: [r1, fail(k, mat, cat)] }));
    redesignOk(run, p, k, `caso ${i}: ${mode}, C${k}, materialidade ${mat}`);
    const rq = resultOf(run, q.id);
    assert.ok(rq && rq.won === true && devCount(run, q) === 1, `caso ${i}: a outra peça (sem falhas) ganha na ronda 1: ${why(run, q.id)}`);
  }
});

// Resposta 3 da #9: no acelerado, o mesmo critério NÃO central a falhar na R1 e na R2 vai para followUps e não bloqueia
test('C1 (accelerated, resposta 3): C1 não central reprovado nas rondas 1 e 2 → a R2 passa-o para followUps e a peça ganha, sem "redesign"', async () => {
  for (const mat of [2, 3]) {
    const p = contract('pa', 9101, { central: [2] });
    const run = await runWf(BUILD, baseArgs([p], { mode: 'accelerated' }), scenario([p], { pa: [fail(1, mat), fail(1, mat)] }));
    const r = resultOf(run, p.id);
    assert.ok(r && r.won === true && !stopReason(r), `materialidade ${mat}: ${why(run, p.id)}`);
    assert.equal(devCount(run, p), 2);
    assert.ok(JSON.stringify(r.followUps || null).includes(repro(2, 1)), `materialidade ${mat}: a falha da R2 está em followUps: ${JSON.stringify(r.followUps)}`);
  }
});

// Resposta 2 da #9: com a escalada do forge.json por defeito (sameCriterionFailures 2), o mesmo critério 2× dá "redesign", não "escalate"
test('C1 (resposta 2): com sameCriterionFailures 2, o mesmo critério reprovado 2× devolve "redesign" e nunca "escalate", nos dois modos', async () => {
  for (const mode of MODES) {
    const p = contract('pa', 9101, { central: [1] });
    const run = await runWf(BUILD, baseArgs([p], { mode, esc: { sameCriterionFailures: 2 } }), scenario([p], { pa: [fail(1), fail(1)] }));
    redesignOk(run, p, 1, mode + ', escalada por defeito');
    assert.equal(fieldOf(resultOf(run, p.id), 'condition'), undefined, 'um "redesign" não traz condição de escalada');
  }
});
