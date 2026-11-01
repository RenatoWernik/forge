// F-23a, regra geral e barra de regressão do corpo da #77: os runtimes falsos dos ataques antigos (f-07, f-08, f-09) não mandam os campos
// novos; um campo ausente conta como vazio, nunca lança erro e nunca muda o desfecho. Oráculo: a implementação de referência é o
// gauntlet-build.js da BASE, no mesmo runtime falso. Para planos ao acaso (semente fixa), o desfecho da peça (won, rounds, stopped,
// criterion, condition, blocked, metrics) é o mesmo da BASE (1) sem nenhum campo novo e (2) com os campos novos neutros (o sha do commit
// entregue, um diff novo a cada ronda, sem pré-existentes nem seguimentos, cada achado respondido «fixed»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, srcBase, contract, baseArgs, runWf, scenario, fresh, planned, resultOf, outcome, sameOutcome, why, rng, randomPlan } from './helpers.mjs';

const p = contract('pa', 9101);

for (const mode of ['rigorous', 'accelerated']) {
  for (const [what, shape] of [['sem campos novos (os runtimes falsos antigos)', planned], ['com os campos novos neutros', fresh]]) {
    test(`regra geral [guarda] (${mode}): ${what}, o desfecho é o da BASE em 60 planos ao acaso, sem erro`, async () => {
      for (let seed = 1; seed <= 60; seed++) {
        const plan = randomPlan(rng(1000 + seed));
        const ref = await runWf(srcBase(), baseArgs([p], { mode }), scenario(p, planned(plan)));
        assert.ok(resultOf(ref), 'a BASE não correu: ' + why(ref));
        const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, shape(plan)));
        assert.equal(run.err, undefined, `semente ${seed}: ` + why(run));
        sameOutcome(resultOf(run), resultOf(ref), `${mode}, semente ${seed}, plano ${JSON.stringify(plan)}: ${why(run)}`);
      }
    });
  }
}