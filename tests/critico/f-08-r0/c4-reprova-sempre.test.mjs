// F-08, critério 4: um «reprova sempre» reprova em qualquer ronda e em qualquer modo. Oráculo: o corpus de vereditos simulados,
// 6 categorias (segredo, segurança, perda de dados, alarme falso, regressão, critério sem evidência) × rondas 1 e 2 × 2 modos = 24.
// O «reprova sempre» chega como bloqueante de materialidade 1 com a categoria, num critério NÃO central (C1), para que só a
// categoria o faça reprovar na R2 do acelerado.
// Guardas (já passam na base, que reprova qualquer bloqueante e corre sem limite): a R1 nos dois modos e a R2 do rigoroso, 18 casos.
// Os 6 casos da R2 do acelerado são os que atacam. O teste da contagem do corpus também é guarda.
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, MODES, ALWAYS, stopReason, contract, baseArgs, runWf, scenario, resultOf, devCount, why, fail } from './helpers.mjs';

const CASES = [];
for (const [cat] of ALWAYS) for (const round of [1, 2]) for (const mode of MODES) CASES.push([cat, round, mode]);

test('C4: o corpus tem 24 casos (6 categorias × 2 rondas × 2 modos)', () => {
  assert.equal(CASES.length, 24);
  assert.equal(new Set(CASES.map((c) => c.join())).size, 24);
});

for (const [cat, round, mode] of CASES) {
  test(`C4: «reprova sempre» ${cat} na ronda ${round}, modo ${mode} → reprova`, async () => {
    const p = contract('pa', 9101, { central: [2] });
    // Para chegar à R2, a R1 reprova o C2 (central); a falha do caso é sempre no C1, por isso nunca é «o mesmo critério 2×»
    const plan = round === 1 ? [fail(1, 1, cat)] : [fail(2, 2), fail(1, 1, cat)];
    const run = await runWf(BUILD, baseArgs([p], { mode }), scenario([p], { pa: plan }));
    const r = resultOf(run, p.id);
    assert.ok(r, 'sem resultado: ' + why(run, p.id));
    const devs = devCount(run, p);
    // reprovar na ronda N = a peça não ganha na ronda N: ou há mais uma ronda (que aprova), ou a peça para sem ganhar
    if (round === 1 || mode === 'rigorous') {
      assert.equal(devs, round + 1, `a ronda ${round} reprovou, por isso há a ronda ${round + 1}: ${why(run, p.id)}`);
      assert.ok(r.won === true && !stopReason(r), `a ronda ${round + 1} limpa aprova: ${why(run, p.id)}`);
    } else {
      assert.equal(devs, 2, 'acelerado: sem ronda 3');
      assert.notEqual(r.won, true, 'o «reprova sempre» na R2 do acelerado não passa para seguimento: ' + why(run, p.id));
      assert.equal(stopReason(r), 'maxRounds', 'resposta 4: a peça reprovada na R2 do acelerado para com maxRounds: ' + why(run, p.id));
    }
  });
}
