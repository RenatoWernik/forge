// F-08, devolução da R1 do crítico (#9): (1) um ataque da Ronda −1 sem `passesOnDelivery` booleano no relatório do crítico deixa a peça
// bloqueada com { reason: "gaps" } e nunca ganha (falha fechado, como o passesOnBase do F-07); (2) o `panel:verdict` só é gravado depois de
// decidida a escalada e nunca diz «won/ganhou/ok» quando a peça escala ou fica bloqueada; (3) no rigoroso, o mesmo critério reprovado pela
// 3.ª vez dá `contract` (decisão do orquestrador: 2.ª reprovação, redesenho; 3.ª, contrato reescrito).
// Classes: a lista de ataques em falta, parcial, com valor não booleano, com ids estranhos; todas as condições de escalada; os dois modos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, stopReason, contract, baseArgs, runWf, scenario, resultOf, devCount, roleOf, why, fail } from './helpers.mjs';

const p = contract('pa', 9101);
const A1 = 'pa-a1', G1 = 'pa-g1';
// O crítico falso de `scenario`, com a lista de ataques do veredito trocada por `attacks`
const withAttacks = (pieces, plan, attacks, over = {}) => {
  const base = scenario(pieces, plan, over);
  return (prompt, opts, run) => {
    const x = base(prompt, opts, run);
    return roleOf(opts) === 'critic' && x && typeof x === 'object' ? { ...x, attacks } : x;
  };
};
const ids = (list) => list.map((id) => ({ id, passesOnDelivery: true }));

for (const [name, attacks] of [
  ['lista vazia', []],
  ['só um dos dois ataques', ids([A1])],
  ['só o outro', ids([G1])],
  ['passesOnDelivery como texto «true»', [{ id: A1, passesOnDelivery: 'true' }, { id: G1, passesOnDelivery: true }]],
  ['passesOnDelivery como texto «false»', [{ id: A1, passesOnDelivery: 'false' }, { id: G1, passesOnDelivery: true }]],
  ['passesOnDelivery como número', [{ id: A1, passesOnDelivery: 1 }, { id: G1, passesOnDelivery: true }]],
  ['passesOnDelivery em falta', [{ id: A1 }, { id: G1, passesOnDelivery: true }]],
  ['só ids de outra peça', ids(['zz-a1', 'zz-g1'])],
]) {
  for (const mode of ['rigorous', 'accelerated']) {
    test(`C9 (${mode}): o crítico devolve ${name} → a peça fica bloqueada com gaps, não ganha e o painel não diz «won»`, async () => {
      const run = await runWf(BUILD, baseArgs([p], { mode }), withAttacks([p], {}, attacks));
      const r = resultOf(run, p.id);
      assert.ok(r, 'sem resultado: ' + why(run, p.id));
      assert.notEqual(r.won, true, 'ganhou sem todos os ataques medidos: ' + why(run, p.id));
      assert.equal(r.blocked?.reason, 'gaps', JSON.stringify(r.blocked) + ' ' + why(run, p.id));
      assert.ok(Array.isArray(r.blocked.gaps) && r.blocked.gaps.length >= 1 && r.blocked.gaps.every((g) => typeof g === 'string'), JSON.stringify(r.blocked));
      assert.equal(devCount(run, p), 1, 'depois de bloqueada não há mais rondas');
      const panel = run.calls.filter((c) => c.opts.label?.startsWith('panel:verdict'));
      assert.ok(panel.every((c) => !/"status":"won"|"verdict":"ganhou"|"kind":"ok"/.test(c.prompt)), 'o painel diz «won» numa peça bloqueada');
    });
  }
}

test('C9: um id estranho (de outra peça) a vermelho ao lado dos dois ataques medidos não conta: a peça ganha', async () => {
  const run = await runWf(BUILD, baseArgs([p]), withAttacks([p], {}, [...ids([A1, G1]), { id: 'zz', passesOnDelivery: false }]));
  assert.equal(resultOf(run, p.id).won, true, why(run, p.id));
});

test('C9: com o interruptor attacksRedOnDelivery desligado, um ataque em falta continua a bloquear (a medida falta, não é a escalada)', async () => {
  const run = await runWf(BUILD, baseArgs([p], { esc: { attacksRedOnDelivery: false } }), withAttacks([p], {}, ids([A1])));
  assert.equal(resultOf(run, p.id).blocked?.reason, 'gaps', why(run, p.id));
});

// O painel: o veredito é gravado depois da decisão e reflete-a
const panelOf = (run) => run.calls.filter((c) => c.opts.label?.startsWith('panel:verdict'));
for (const [name, esc, plan, over] of [
  ['ataque a vermelho', { attacksRedOnDelivery: true }, {}, { red: () => true }],
  ['visual abaixo da referência', { visualBelowReference: true }, { pa: [{ ...fail(1), visual: true }] }, {}],
]) {
  test(`C9: escalada por ${name} → o painel regista a ronda como perdida, nunca «won/ganhou/ok»`, async () => {
    const q = contract('pa', 9101, { ui: true });
    const run = await runWf(BUILD, baseArgs([q], { esc }), scenario([q], plan, over));
    const r = resultOf(run, q.id);
    assert.equal(stopReason(r), 'escalate', why(run, q.id));
    const pn = panelOf(run);
    assert.equal(pn.length, 1, 'um veredito na R1');
    assert.ok(/"status":"building"/.test(pn[0].prompt) && /"verdict":"perdeu"/.test(pn[0].prompt) && /"kind":"fail"/.test(pn[0].prompt), 'o painel não reflete a escalada: ' + pn[0].prompt.split('\n').filter((l) => l.includes('pieces/') || l.includes('events/')).join(' | '));
    assert.ok(!/"status":"won"|"verdict":"ganhou"|"kind":"ok"/.test(pn[0].prompt));
  });
}
test('C9 (guarda): uma peça que ganha continua a ser gravada como ganha, com o veredito depois do crítico', async () => {
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], {}));
  assert.equal(resultOf(run, p.id).won, true);
  const labels = run.calls.map((c) => c.opts.label);
  assert.ok(labels.indexOf('panel:verdict:pa:r1') > labels.indexOf('critic:pa:r1'));
  assert.ok(/"status":"won"/.test(panelOf(run)[0].prompt) && /"verdict":"ganhou"/.test(panelOf(run)[0].prompt));
});

// contract ganha ao redesign na 3.ª reprovação do rigoroso
test('C9: rigoroso, C1 reprovado nas rondas 1 e 3 e C2 na 2 → "contract" (a 3.ª reprovação), nunca "redesign", sem ronda 4', async () => {
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1), fail(2), fail(1)] }));
  const r = resultOf(run, p.id);
  assert.equal(stopReason(r), 'contract', why(run, p.id));
  assert.equal(r.criterion, undefined);
  assert.equal(devCount(run, p), 3);
  assert.equal(r.metrics.rounds, 3);
  assert.equal(r.metrics.sameCriterionFailures, 2);
});
test('C9: rigoroso, o mesmo critério reprovado nas rondas 1, 2 e 3 → "redesign" na R2 (2.ª reprovação), e a R3 nunca corre', async () => {
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1), fail(1), fail(1)] }));
  assert.equal(stopReason(resultOf(run, p.id)), 'redesign');
  assert.equal(devCount(run, p), 2);
});
test('C9: rigoroso, vários critérios repetidos até à R3 (gerador: C1/C2 em todas as ordens) → sempre "contract" na R3', async () => {
  const seqs = [[1, 2, 1], [1, 2, 2], [2, 1, 1], [2, 1, 2], [1, 3, 3], [3, 1, 3]];
  for (const s of seqs) {
    const q = contract('pa', 9101);
    const run = await runWf(BUILD, baseArgs([q]), scenario([q], { pa: s.map((k) => fail(k)) }));
    const r = resultOf(run, q.id);
    // um critério repetido em rondas seguidas (1,1 ou 2,2 ou 3,3 na R2) dá redesign na R2; só os repetidos na R3 dão contract
    const secondRoundRepeat = s[0] === s[1];
    assert.equal(stopReason(r), secondRoundRepeat ? 'redesign' : 'contract', JSON.stringify(s) + ' ' + why(run, q.id));
    assert.equal(devCount(run, q), secondRoundRepeat ? 2 : 3, JSON.stringify(s));
  }
});
test('C9: acelerado, o mesmo critério central reprovado nas rondas 1 e 2 continua a dar "redesign" (o contract só existe no rigoroso)', async () => {
  const q = contract('pa', 9101, { central: [1] });
  const run = await runWf(BUILD, baseArgs([q], { mode: 'accelerated' }), scenario([q], { pa: [fail(1), fail(1)] }));
  assert.equal(stopReason(resultOf(run, q.id)), 'redesign', why(run, q.id));
});
