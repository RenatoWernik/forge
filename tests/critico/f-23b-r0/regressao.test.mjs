// F-23b, regra da barra de regressão do corpo da #78: «os runtimes falsos antigos, que nunca pedem repro:, recebem undefined nessa
// chamada. Isso mantém os bloqueantes (falha fechada) e o desfecho desses ataques fica igual.» Oráculo: a implementação de referência é o
// gauntlet-build.js da BASE (merge-base com a origin/main), no mesmo runtime falso. Para planos ao acaso (semente fixa), o desfecho da peça
// (won, rounds, stopped, criterion, condition, blocked e as medidas de antes) é o da BASE: (1) com o crítico e o dev antigos (sem os campos do
// F-23a nem class) e o repro a responder undefined ou "ok"; (2) com os campos novos e o repro a reproduzir tudo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, srcBase, contract, baseArgs, runWf, scenario, resultOf, outcome, why, rng, randomPlan, allReproduced } from './helpers.mjs';

const p = contract('pa', 9101);
const SHAPES = [
  ['antigo, repro → undefined', { old: true, repro: () => undefined }],
  ['antigo, repro → "ok"', { old: true, repro: () => 'ok' }],
  ['novo, repro reproduz tudo', { repro: (r, _, run) => allReproduced(r, run) }],
];
const withClass = (plan) => plan.map((x) => (x.blocking ? { ...x, blocking: x.blocking.map(([c, m = 2, cat = m === 1 ? 'regression' : 'criterion']) => [c, m, cat, 'probe-c' + c]) } : x));

for (const mode of ['rigorous', 'accelerated']) {
  for (const [what, shape] of SHAPES) {
    test(`regressão [guarda] (${mode}, ${what}): o desfecho é o da BASE em 60 planos ao acaso, sem erro`, async () => {
      for (let seed = 1; seed <= 60; seed++) {
        const plan = randomPlan(rng(3000 + seed));
        const ref = await runWf(srcBase(), baseArgs([p], { mode }), scenario(p, { critic: (r) => plan[r - 1] || {}, old: shape.old }));
        assert.ok(resultOf(ref), 'a BASE não correu: ' + why(ref));
        const cplan = shape.old ? plan : withClass(plan);
        const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, { critic: (r) => cplan[r - 1] || {}, ...shape }));
        assert.equal(run.err, undefined, `semente ${seed}: ` + why(run));
        assert.deepEqual(outcome(resultOf(run)), outcome(resultOf(ref)), `${mode}, ${what}, semente ${seed}, plano ${JSON.stringify(plan)}: ${why(run)}`);
      }
    });
  }
}