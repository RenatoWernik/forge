// F-08, critério 5: quando se cumpre uma condição de `escalation`, o workflow devolve { id, stopped: "escalate", condition, metrics },
// com metrics = { rounds, sameCriterionFailures, attacksRedOnDelivery, minutesWithoutProgress }. Oráculo: um caso por condição
// (4 casos), mais o contra-caso de cada um com o limiar ou o interruptor do `args.escalation` desligado: os limiares vêm do
// forge.json (via args), nunca do código. A decisão de escalar é do orquestrador: depois do "escalate" não há mais rondas e
// nenhum agente corre com um modelo fora de args.models.
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, METRICS, PROBE, contract, baseArgs, runWf, scenario, resultOf, devCount, roleOf, why, fail } from './helpers.mjs';

const escalateOk = (run, p, condition, rounds) => {
  const r = resultOf(run, p.id);
  assert.ok(r, 'sem resultado: ' + why(run, p.id));
  assert.equal(r.stopped, 'escalate', why(run, p.id));
  assert.equal(r.condition, condition, why(run, p.id));
  assert.notEqual(r.won, true);
  assert.ok(r.metrics && typeof r.metrics === 'object', 'sem metrics: ' + why(run, p.id));
  for (const m of METRICS) assert.ok(m in r.metrics, `metrics.${m} em falta: ${JSON.stringify(r.metrics)}`);
  assert.equal(r.metrics.rounds, devCount(run, p), 'metrics.rounds = as rondas que correram');
  if (rounds !== undefined) assert.equal(devCount(run, p), rounds, 'depois do "escalate" não há mais rondas');
  // o workflow só devolve as medidas: nenhum agente fora dos modelos pedidos, os devs sempre no developer da peça
  assert.ok(run.calls.every((c) => roleOf(c.opts)), 'agent() com um modelo fora de args.models: ' + JSON.stringify(run.calls.filter((c) => !roleOf(c.opts)).map((c) => c.opts)));
  assert.ok(run.calls.filter((c) => /^developer/.test(roleOf(c.opts) || '')).every((c) => roleOf(c.opts) === 'developer'), 'o workflow trocou o modelo do dev');
  return r;
};
const notEscalated = (run, p, condition) => {
  const r = resultOf(run, p.id);
  assert.ok(r, 'sem resultado: ' + why(run, p.id));
  assert.ok(!(r.stopped === 'escalate' && r.condition === condition), `escalou por ${condition} com a condição desligada: ${why(run, p.id)}`);
};

test('C5: sameCriterionFailures com value 1 → C1 reprovado na R1 devolve "escalate" na R1, com metrics.sameCriterionFailures 1', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { sameCriterionFailures: 1 } }), scenario([p], { pa: [fail(1)] }));
  const r = escalateOk(run, p, 'sameCriterionFailures', 1);
  assert.equal(r.metrics.sameCriterionFailures, 1);
  assert.equal(r.metrics.rounds, 1);
});
test('C5 (contra-caso): sameCriterionFailures com value 9 → o mesmo plano ganha na R2, sem escalar', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { sameCriterionFailures: 9 } }), scenario([p], { pa: [fail(1)] }));
  notEscalated(run, p, 'sameCriterionFailures');
  assert.equal(resultOf(run, p.id).won, true, why(run, p.id));
});

test('C5: attacksRedOnDelivery ligado → a entrega da R1 com um ataque da Ronda −1 a vermelho devolve "escalate", sem R2', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: true } }), scenario([p], {}, { red: (id, round) => round === 1 }));
  const r = escalateOk(run, p, 'attacksRedOnDelivery', 1);
  assert.ok(r.metrics.attacksRedOnDelivery === true || r.metrics.attacksRedOnDelivery >= 1, 'metrics.attacksRedOnDelivery: ' + JSON.stringify(r.metrics));
});
test('C5 (contra-caso): attacksRedOnDelivery desligado → a mesma entrega não escala por essa condição', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: false } }), scenario([p], {}, { red: (id, round) => round === 1 }));
  notEscalated(run, p, 'attacksRedOnDelivery');
});

test('C5: minutesWithoutProgress 30 → rondas de 45 min a reprovar critérios diferentes devolvem "escalate" com metrics.minutesWithoutProgress ≥ 30', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 30 } }), scenario([p], { pa: [fail(1), fail(2)] }, { minutesPerRound: 45 }));
  const r = escalateOk(run, p, 'minutesWithoutProgress');
  assert.ok(devCount(run, p) <= 2, 'escalou tarde: ' + devCount(run, p) + ' rondas');
  assert.ok(Number.isFinite(r.metrics.minutesWithoutProgress) && r.metrics.minutesWithoutProgress >= 30, 'metrics.minutesWithoutProgress: ' + JSON.stringify(r.metrics));
});
test('C5 (contra-caso): minutesWithoutProgress 9999 → o mesmo plano ganha na R3, sem escalar', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 9999 } }), scenario([p], { pa: [fail(1), fail(2)] }, { minutesPerRound: 45 }));
  notEscalated(run, p, 'minutesWithoutProgress');
  assert.equal(resultOf(run, p.id).won, true, why(run, p.id));
});

test('C5: visualBelowReference ligado → o crítico declara o visual abaixo da referência na R1 e o workflow devolve "escalate"', async () => {
  const p = contract('pa', 9101, { ui: true });
  const run = await runWf(BUILD, baseArgs([p], { esc: { visualBelowReference: true } }), scenario([p], { pa: [{ ...fail(1), visual: true }] }));
  const r = resultOf(run, p.id);
  assert.ok(r && r.stopped === 'escalate' && r.condition === 'visualBelowReference', why(run, p.id));
  for (const m of METRICS) assert.ok(r.metrics && m in r.metrics, `metrics.${m} em falta`);
  assert.equal(devCount(run, p), 1, 'depois do "escalate" não há mais rondas');
  assert.ok(run.calls.filter((c) => /^developer/.test(roleOf(c.opts) || '')).every((c) => roleOf(c.opts) === 'developerUi'), 'peça ui: os devs no developerUi');
});
test('C5 (contra-caso): visualBelowReference desligado → o mesmo veredito não escala por essa condição', async () => {
  const p = contract('pa', 9101, { ui: true });
  const run = await runWf(BUILD, baseArgs([p], { esc: { visualBelowReference: false } }), scenario([p], { pa: [{ ...fail(1), visual: true }] }));
  notEscalated(run, p, 'visualBelowReference');
});

test('C5: os 4 casos usam as 4 condições do forge.json, e os modelos de sonda são os de args.models', () => {
  assert.deepEqual(Object.keys(baseArgs([]).escalation).sort(), ['attacksRedOnDelivery', 'minutesWithoutProgress', 'sameCriterionFailures', 'visualBelowReference']);
  assert.deepEqual(baseArgs([]).models, PROBE);
});
