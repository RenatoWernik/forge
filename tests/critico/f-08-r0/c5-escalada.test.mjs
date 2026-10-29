// F-08, critério 5: quando se cumpre uma condição de `escalation`, o workflow devolve { id, stopped: "escalate", condition, metrics },
// com metrics = { rounds, sameCriterionFailures, attacksRedOnDelivery, minutesWithoutProgress }. Os limiares e os interruptores vêm
// de `args.escalation` (o forge.json), nunca do código. A decisão de escalar é do orquestrador: depois do "escalate" não há mais
// rondas e nenhum agente corre com um modelo fora de args.models.
// Respostas da #9 que este ficheiro aplica:
//   - 2: o "redesign" ganha ao "escalate" (o caso do sameCriterionFailures 2× está no c1);
//   - 5: os sinais nunca vêm do dev. Os ataques a vermelho calculam-se do resultado POR ATAQUE que o crítico corre na entrega
//     (`passesOnDelivery`), sem confiar num booleano; o visual vem do juiz (o crítico). Cada sinal tem o caso positivo (vindo
//     de onde deve), o contra-caso com a condição desligada e a armadilha do dev a alegar o sinal (o workflow ignora-o).
//   - P7: os minutos entram em `args.vida: { <agente>: { minutos, vida } }`, calculado pelo orquestrador com o leitor do F-10;
//   - P8: a peça leva `redesigns` (inteiro ≥ 0); o "escalate" por sameCriterionFailures só acontece com `redesigns ≥ 1`;
//   - P9: attacksRedOnDelivery dá "escalate", como no critério 5.
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

// ---- P8: a escalada por sameCriterionFailures só depois de um redesenho (redesigns ≥ 1 na peça)
test('C5 (P8): peça com redesigns 1 e sameCriterionFailures 2 → C1 reprovado na R1 e na R2 devolve "escalate", não "redesign"', async () => {
  for (const mode of ['rigorous', 'accelerated']) {
    const p = contract('pa', 9101, { central: [1], redesigns: 1 });
    const run = await runWf(BUILD, baseArgs([p], { mode, esc: { sameCriterionFailures: 2 } }), scenario([p], { pa: [fail(1), fail(1)] }));
    const { mt } = escalateOk(run, p, 'sameCriterionFailures', 2);
    assert.equal(mt.sameCriterionFailures, 2, mode);
  }
});
test('C5 (P8, contra-caso): a mesma peça com redesigns 0 → "redesign" (a 1.ª suspeita é a especificação)', async () => {
  const p = contract('pa', 9101, { central: [1], redesigns: 0 });
  const run = await runWf(BUILD, baseArgs([p], { esc: { sameCriterionFailures: 2 } }), scenario([p], { pa: [fail(1), fail(1)] }));
  const r = resultOf(run, p.id);
  assert.equal(stopReason(r), 'redesign', why(run, p.id));
  assert.equal(devCount(run, p), 2);
});

// ---- P7: os minutos vêm de args.vida (o orquestrador calcula-os com o leitor do F-10); o workflow só os lê
const vida = (p, minutos, estado) => Object.fromEntries([p.id, p.title, `dev-${p.id}`, `critic-${p.id}`, `b-1-${p.id}-r1`].map((k) => [k, { minutos, vida: estado }]));
test('C5 (P7): args.vida com 45 minutos sem progresso e minutesWithoutProgress 30 → "escalate" por minutos, com metrics.minutesWithoutProgress ≥ 30, sem passar da R1', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 30 }, vida: vida(p, 45, 'parado') }), scenario([p], { pa: [fail(1), fail(2)] }));
  const { mt } = escalateOk(run, p, 'minutesWithoutProgress');
  assert.ok(devCount(run, p) <= 1, 'escalou tarde: ' + devCount(run, p) + ' rondas');
  assert.ok(Number.isFinite(mt.minutesWithoutProgress) && mt.minutesWithoutProgress >= 30, 'metrics.minutesWithoutProgress: ' + JSON.stringify(mt));
});
test('C5 (P7, contra-caso): args.vida com 5 minutos (abaixo de 30) → não escala por minutos e o plano ganha na R3', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 30 }, vida: vida(p, 5, 'ativo') }), scenario([p], { pa: [fail(1), fail(2)] }));
  const r = notEscalatedBy(run, p, 'minutesWithoutProgress');
  assert.ok(r.won === true && devCount(run, p) === 3, why(run, p.id));
});
test('C5 (P7, limiar dos args): o mesmo args.vida de 45 minutos com minutesWithoutProgress 60 → não escala por minutos', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { esc: { minutesWithoutProgress: 60 }, vida: vida(p, 45, 'parado') }), scenario([p], { pa: [fail(1), fail(2)] }));
  notEscalatedBy(run, p, 'minutesWithoutProgress');
});
