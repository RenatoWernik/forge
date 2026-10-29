// F-08, critério 5: quando se cumpre uma condição de `escalation`, o workflow devolve { id, stopped: "escalate", condition, metrics },
// com metrics = { rounds, sameCriterionFailures, attacksRedOnDelivery, minutesWithoutProgress }. Os limiares e os interruptores vêm
// de `args.escalation` (o forge.json), nunca do código. A decisão de escalar é do orquestrador: depois do "escalate" não há mais
// rondas e nenhum agente corre com um modelo fora de args.models.
// Respostas da #9 que este ficheiro aplica:
//   - 2: o "redesign" ganha ao "escalate" (o caso do sameCriterionFailures 2× está no c1);
//   - 5: os sinais nunca vêm do dev. Os ataques a vermelho calculam-se do resultado POR ATAQUE que o crítico corre na entrega
//     (`passesOnDelivery`), sem confiar num booleano; o visual vem do juiz (o crítico). Cada sinal tem o caso positivo (vindo
//     de onde deve), o contra-caso com a condição desligada e a armadilha do dev a alegar o sinal (o workflow ignora-o).
// LACUNAS (perguntas na #9, sem ataque positivo até à resposta): o canal pelo qual a vida do leitor do F-10 chega ao workflow
// (minutesWithoutProgress) e o que é «depois do redesenho» para a escalada por sameCriterionFailures.
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, METRICS, PROBE, stopReason, fieldOf, contract, baseArgs, runWf, scenario, resultOf, devCount, roleOf, why, fail } from './helpers.mjs';

const escalateOk = (run, p, condition, rounds) => {
  const r = resultOf(run, p.id);
  assert.ok(r, 'sem resultado: ' + why(run, p.id));
  assert.equal(stopReason(r), 'escalate', why(run, p.id));
  assert.equal(fieldOf(r, 'condition'), condition, why(run, p.id));
  assert.notEqual(r.won, true);
  const mt = fieldOf(r, 'metrics');
  assert.ok(mt && typeof mt === 'object', 'sem metrics: ' + why(run, p.id));
  for (const m of METRICS) assert.ok(m in mt, `metrics.${m} em falta: ${JSON.stringify(mt)}`);
  assert.equal(mt.rounds, devCount(run, p), 'metrics.rounds = as rondas que correram');
  if (rounds !== undefined) assert.equal(devCount(run, p), rounds, 'depois do "escalate" não há mais rondas');
  // o workflow só devolve as medidas: nenhum agente fora dos modelos pedidos, e o dev nunca muda de modelo
  assert.ok(run.calls.every((c) => roleOf(c.opts)), 'agent() com um modelo fora de args.models: ' + JSON.stringify(run.calls.filter((c) => !roleOf(c.opts)).map((c) => c.opts)));
  const devRoles = new Set(run.calls.map((c) => roleOf(c.opts)).filter((x) => /^developer/.test(x || '')));
  assert.ok(devRoles.size <= 1, 'o workflow trocou o modelo do dev: ' + [...devRoles]);
  return { r, mt };
};
const notEscalatedBy = (run, p, condition) => {
  const r = resultOf(run, p.id);
  assert.ok(r, 'sem resultado: ' + why(run, p.id));
  assert.ok(!(stopReason(r) === 'escalate' && fieldOf(r, 'condition') === condition), `escalou por ${condition} sem razão: ${why(run, p.id)}`);
  return r;
};

// ---- attacksRedOnDelivery: do resultado por ataque que o crítico corre na entrega
test('C5: attacksRedOnDelivery ligado → o crítico corre os ataques na entrega da R1, um está a vermelho, e o workflow devolve "escalate", sem R2', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: true } }), scenario([p], {}, { red: (id, round) => round === 1 }));
  const { mt } = escalateOk(run, p, 'attacksRedOnDelivery', 1);
  assert.ok(mt.attacksRedOnDelivery === 1 || mt.attacksRedOnDelivery === true, 'metrics.attacksRedOnDelivery (1 ataque a vermelho): ' + JSON.stringify(mt));
});
test('C5 (resposta 5): os campos-resumo do crítico dizem «tudo verde», mas a lista por ataque tem um vermelho → o workflow calcula da lista e escala', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: true } }), scenario([p], {}, { red: (id, round) => round === 1, liar: true }));
  escalateOk(run, p, 'attacksRedOnDelivery', 1);
});
test('C5 (resposta 5): o DEV alega um ataque a vermelho, mas o crítico corre-os todos a verde → não escala e a peça ganha na R1', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: true } }), scenario([p], {}, { dev: () => ({ red: true }) }));
  const r = notEscalatedBy(run, p, 'attacksRedOnDelivery');
  assert.ok(r.won === true && devCount(run, p) === 1, why(run, p.id));
});
test('C5 (contra-caso): attacksRedOnDelivery desligado → a mesma entrega não escala por essa condição', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: false } }), scenario([p], {}, { red: (id, round) => round === 1 }));
  notEscalatedBy(run, p, 'attacksRedOnDelivery');
});

// ---- visualBelowReference: do juiz (o crítico)
test('C5: visualBelowReference ligado → o crítico declara o visual abaixo da referência na R1 e o workflow devolve "escalate"', async () => {
  const p = contract('pa', 9101, { ui: true });
  const run = await runWf(BUILD, baseArgs([p], { esc: { visualBelowReference: true } }), scenario([p], { pa: [{ ...fail(1), visual: true }] }));
  escalateOk(run, p, 'visualBelowReference', 1);
  assert.ok(run.calls.filter((c) => /^developer/.test(roleOf(c.opts) || '')).every((c) => roleOf(c.opts) === 'developerUi'), 'peça ui: os devs no developerUi');
});
test('C5 (resposta 5): o DEV alega o visual abaixo da referência e o crítico não → não escala por essa condição', async () => {
  const p = contract('pa', 9101, { ui: true });
  const run = await runWf(BUILD, baseArgs([p], { esc: { visualBelowReference: true } }), scenario([p], { pa: [fail(1)] }, { dev: () => ({ visual: true }) }));
  const r = notEscalatedBy(run, p, 'visualBelowReference');
  assert.ok(r.won === true && devCount(run, p) === 2, why(run, p.id));
});
test('C5 (contra-caso): visualBelowReference desligado → o mesmo veredito não escala por essa condição', async () => {
  const p = contract('pa', 9101, { ui: true });
  const run = await runWf(BUILD, baseArgs([p], { esc: { visualBelowReference: false } }), scenario([p], { pa: [{ ...fail(1), visual: true }] }));
  notEscalatedBy(run, p, 'visualBelowReference');
});

// ---- minutesWithoutProgress: nunca do dev (o caso positivo espera a resposta sobre o canal da vida do F-10)
test('C5 (resposta 5): o DEV alega 5000 minutos sem progresso (campos de minutos e carimbos de hora) → não escala por minutos', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 30 } }), scenario([p], { pa: [fail(1), fail(2)] }, { dev: (id, round) => ({ minutes: 5000 * round }) }));
  const r = notEscalatedBy(run, p, 'minutesWithoutProgress');
  assert.ok(r.won === true && devCount(run, p) === 3, why(run, p.id));
});
test('C5 (contra-caso): minutesWithoutProgress 9999 → o mesmo plano ganha na R3, sem escalar', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 9999 } }), scenario([p], { pa: [fail(1), fail(2)] }, { minutesPerRound: 45 }));
  notEscalatedBy(run, p, 'minutesWithoutProgress');
  assert.equal(resultOf(run, p.id).won, true, why(run, p.id));
});

test('C5: os casos usam as 4 condições do forge.json, e os modelos de sonda são os de args.models', () => {
  assert.deepEqual(Object.keys(baseArgs([]).escalation).sort(), ['attacksRedOnDelivery', 'minutesWithoutProgress', 'sameCriterionFailures', 'visualBelowReference']);
  assert.deepEqual(baseArgs([]).models, PROBE);
});
