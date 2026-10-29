// F-08, critério 3: no modo acelerado nunca há ronda 3; na R2, uma falha que não é «reprova sempre» nem critério marcado
// `central: true` passa para `followUps` e não reprova. Oráculo: a tabela literal de 8 casos (tipo de falha × ronda 1 ou 2) e um
// gerador com semente (nunca há ronda 3, em nenhum plano).
// Guardas (já passam na base, que reprova qualquer bloqueante na R1): os 4 casos da R1 da tabela.
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, ALWAYS, contract, baseArgs, runWf, scenario, resultOf, devCount, criticCount, why, fail, failMany, repro, rng, pick } from './helpers.mjs';

// Os 4 tipos de falha, sempre no critério C1 (central só no tipo «central»)
const TYPES = {
  always: { central: [], v: (r) => fail(1, 1, 'secret') },
  central: { central: [1], v: () => fail(1, 2) },
  'non-central, materiality 2': { central: [], v: () => fail(1, 2) },
  'non-central, materiality 3': { central: [], v: () => fail(1, 3) },
};
// A tabela literal: [tipo, ronda, reprova?]. Na R1 tudo o que é bloqueante reprova; na R2 só o «reprova sempre» e o central.
const TABLE = [
  ['always', 1, true], ['always', 2, true],
  ['central', 1, true], ['central', 2, true],
  ['non-central, materiality 2', 1, true], ['non-central, materiality 2', 2, false],
  ['non-central, materiality 3', 1, true], ['non-central, materiality 3', 2, false],
];

for (const [type, round, reproves] of TABLE) {
  test(`C3 (acelerado): falha ${type} na ronda ${round} → ${reproves ? 'reprova' : 'passa para followUps e não reprova'}`, async () => {
    // Para chegar à R2, a R1 reprova o C2 (central, por isso reprova sempre na R1 e nunca colide com o C1)
    const p = contract('pa', 9101, { central: [...TYPES[type].central, 2] });
    const plan = round === 1 ? [TYPES[type].v()] : [fail(2, 2), TYPES[type].v()];
    const run = await runWf(BUILD, baseArgs([p], { mode: 'accelerated' }), scenario([p], { pa: plan }));
    const r = resultOf(run, p.id);
    assert.ok(r, 'sem resultado: ' + why(run, p.id));
    assert.ok(devCount(run, p) <= 2 && criticCount(run, p) <= 2, `ronda 3 no acelerado: ${devCount(run, p)} devs, ${criticCount(run, p)} críticos`);
    if (round === 1) {
      // reprova na R1: há R2, e a R2 limpa aprova
      assert.equal(devCount(run, p), 2, 'a R1 reprovou, por isso há uma R2: ' + why(run, p.id));
      assert.ok(r.won === true && !r.stopped, 'a R2 limpa aprova: ' + why(run, p.id));
    } else if (reproves) {
      assert.notEqual(r.won, true, 'a falha da R2 reprova: ' + why(run, p.id));
      assert.ok(r.stopped, 'a peça reprovada na R2 do acelerado para com um stopped: ' + why(run, p.id));
    } else {
      assert.ok(r.won === true && !r.stopped, 'a falha da R2 não reprova: ' + why(run, p.id));
      assert.equal(devCount(run, p), 2);
      assert.ok(Array.isArray(r.followUps), 'followUps tem de ser uma lista: ' + why(run, p.id));
      assert.ok(JSON.stringify(r.followUps).includes(repro(2, 1)), `a falha da R2 (${repro(2, 1)}) está em followUps: ${JSON.stringify(r.followUps)}`);
    }
  });
}

test('C3 (acelerado): na R2, um «reprova sempre» e uma falha não central juntos reprovam (a não central não esconde a outra)', async () => {
  const p = contract('pa', 9101, { central: [2] });
  const run = await runWf(BUILD, baseArgs([p], { mode: 'accelerated' }), scenario([p], { pa: [fail(2, 2), failMany([1, 3], [3, 1, 'security'])] }));
  const r = resultOf(run, p.id);
  assert.ok(r && r.won !== true && r.stopped, why(run, p.id));
  assert.ok(devCount(run, p) <= 2);
});

// Gerador: cada ronda aprova ou falha 1 ou 2 critérios com tipos aleatórios; a R2 nunca repete um critério da R1 (a regra do
// REDESENHO fica no c1). Modelo de referência: ganha se a R1 aprova, ou se a R2 só tem falhas não centrais e não «reprova sempre».
test('C3 (gerador, semente 303, 60 planos): no acelerado nunca há ronda 3 e a vitória segue o modelo de referência', async () => {
  const r = rng(303);
  for (let i = 0; i < 60; i++) {
    const central = [1, 2, 3, 4].filter(() => r() < 0.4);
    const draw = (pool) => {
      if (r() < 0.25 || !pool.length) return { v: undefined, demotable: true };
      const ks = pool.filter(() => r() < 0.5).slice(0, 2);
      if (!ks.length) ks.push(pick(r, pool));
      const bs = ks.map((k) => { const mat = pick(r, [1, 2, 3]); return [k, mat, mat === 1 ? pick(r, ALWAYS)[0] : undefined]; });
      return { v: failMany(...bs), ks, demotable: bs.every(([k, mat]) => mat !== 1 && !central.includes(k)) };
    };
    const d1 = draw([1, 2, 3, 4]);
    const d2 = d1.v ? draw([1, 2, 3, 4].filter((k) => !d1.ks.includes(k))) : { v: undefined, demotable: true };
    const p = contract('pg' + i, 9200 + i, { central });
    const run = await runWf(BUILD, baseArgs([p], { mode: 'accelerated' }), scenario([p], { ['pg' + i]: [d1.v, d2.v] }));
    const res = resultOf(run, p.id);
    const expected = !d1.v || d2.demotable;
    const msg = `plano ${i}: central ${JSON.stringify(central)}, R1 ${JSON.stringify(d1.v)}, R2 ${JSON.stringify(d2.v)} ${why(run, p.id)}`;
    assert.ok(devCount(run, p) <= 2 && criticCount(run, p) <= 2, 'ronda 3 no acelerado: ' + msg);
    assert.ok(res, 'sem resultado: ' + msg);
    assert.equal(res.won === true, expected, 'vitória: ' + msg);
  }
});
