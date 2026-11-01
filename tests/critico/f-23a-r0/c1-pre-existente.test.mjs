// F-23a, C1 (D1): PRÉ-EXISTENTE. Oráculos do corpo da #77: um veredito que ganharia, com 2 `preExisting`, continua a ganhar e os 2
// aparecem em `followUps` com `kind: "pre-existing"` e a `round`; a linha `briefs` do check.cjs exige `PRE-EXISTING` no critic.md e uma
// mutação que o tira faz falhar essa linha. Também o que o critério fixa por escrito: o schema VERDICT exige `preExisting: [{description, blame}]`,
// o critic.md tem a secção literal no formato do veredito e a regra do git blame, e o prompt do crítico manda preenchê-lo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { srcNow, srcBase, contract, baseArgs, runWf, scenario, fresh, resultOf, outcome, sameOutcome, why, criticCalls, read, verdictBlock, PRE_LINE, H, D, rng, randomPlan, generate, corpusAnswers, check, state, fails, replaceIn, mutations } from './helpers.mjs';

const p = contract('pa', 9101);
const PRE = (r) => [{ description: `PRE-r${r}-1 C1 the parser drops a trailing comma`, blame: `${'a'.repeat(40)} src/a.js:${10 + r}` }, { description: `PRE-r${r}-2 C2 the header is not escaped`, blame: `${'b'.repeat(40)} src/h.js:${20 + r}` }];
const preOf = (r) => (Array.isArray(r?.followUps) ? Array.from(r.followUps) : []) /* Array.from: o resultado vem de outro realm (vm) */.filter((f) => f && f.kind === 'pre-existing');
const key = (f) => `${f.round}|${f.description}|${f.blame}`;

test('C1 [ataque]: o schema VERDICT exige preExisting, uma lista de {description, blame} com os dois campos obrigatórios', async () => {
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, fresh()));
  const c = criticCalls(run)[0];
  assert.ok(c, 'o crítico não correu: ' + why(run));
  const s = c.opts.schema || {};
  assert.ok((s.required || []).includes('preExisting'), 'VERDICT.required sem preExisting: ' + JSON.stringify(s.required));
  const pe = s.properties?.preExisting || {};
  assert.equal(pe.type, 'array', 'preExisting não é uma lista: ' + JSON.stringify(pe).slice(0, 300));
  for (const k of ['description', 'blame']) {
    assert.ok(pe.items?.properties?.[k], `preExisting.items sem ${k}`);
    assert.ok((pe.items?.required || []).includes(k), `preExisting.items.required sem ${k}`);
  }
});

for (const mode of ['rigorous', 'accelerated']) {
  test(`C1 [ataque] (${mode}): um veredito que ganharia, com 2 preExisting, continua a ganhar na R1 e os 2 vão para followUps com kind "pre-existing", a round e o próprio item`, async () => {
    const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, fresh([{ preExisting: PRE(1) }])));
    const r = resultOf(run);
    assert.ok(r, why(run));
    assert.equal(r.won, true, 'os PRE-EXISTING bloquearam: ' + why(run));
    assert.equal(r.rounds, 1, why(run));
    assert.deepEqual(preOf(r).map(key).sort(), PRE(1).map((x) => key({ ...x, round: 1 })).sort(), 'followUps: ' + JSON.stringify(r.followUps));
  });
}

test('C1 [ataque] (rigorous): os preExisting de cada ronda entram em followUps com a sua round e nunca contam como critério falhado', async () => {
  // R1 falha C1 e R2 falha C2 (critérios diferentes: sem redesenho), a R3 ganha; os PRE-EXISTING citam C1 e C2 no texto, em todas as rondas
  const plan = [{ blocking: [[1]], preExisting: PRE(1) }, { blocking: [[2]], preExisting: PRE(2) }, { preExisting: PRE(3) }];
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, fresh(plan)));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.won, true, why(run));
  assert.equal(r.rounds, 3, why(run));
  assert.equal(r.metrics?.sameCriterionFailures, 1, 'um PRE-EXISTING contou como critério falhado: ' + JSON.stringify(r.metrics));
  assert.deepEqual(preOf(r).map(key).sort(), [1, 2, 3].flatMap((n) => PRE(n).map((x) => key({ ...x, round: n }))).sort(), 'followUps: ' + JSON.stringify(r.followUps));
});

test('C1 [guarda, propriedade]: os preExisting nunca mudam o desfecho; 40 planos ao acaso por modo, iguais ao gauntlet-build da BASE sem eles', async () => {
  for (const mode of ['rigorous', 'accelerated']) {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = randomPlan(rng(seed));
      const ref = resultOf(await runWf(srcBase(), baseArgs([p], { mode }), scenario(p, { critic: (r) => plan[r - 1] || {} })));
      const withPre = plan.map((v, i) => ({ ...v, preExisting: PRE(i + 1) }));
      const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, fresh(withPre)));
      sameOutcome(resultOf(run), ref, `${mode}, semente ${seed}, plano ${JSON.stringify(plan)}: ${why(run)}`);
    }
  }
});

test('C1 [ataque]: o prompt do crítico do build manda preencher preExisting com a linha do git blame', async () => {
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, fresh([{ blocking: [[1]] }])));
  const cs = criticCalls(run);
  assert.ok(cs.length >= 2, 'o crítico não correu duas rondas: ' + why(run));
  for (const c of cs) {
    assert.match(c.prompt, /preExisting|PRE-EXISTING/, 'o prompt do crítico não fala de preExisting');
    assert.match(c.prompt, /git blame/, 'o prompt do crítico não fala do git blame');
  }
});

test('C1 [ataque]: o critic.md tem a secção PRE-EXISTING no formato do veredito e a regra do git blame fora do bloco', () => {
  const t = read('templates/.claude/briefs/critic.md');
  const block = verdictBlock(t);
  assert.ok(block.includes('FOLLOW-UP'), 'o bloco do veredito perdeu a secção FOLLOW-UP (a linha briefs lê-a): ' + block);
  assert.ok(block.split(/\r?\n/).some((l) => l.trim() === PRE_LINE), `o bloco do veredito não tem a linha «${PRE_LINE}»: ` + block);
  const prose = t.replace(/^```[\s\S]*?^```/gm, ' ');
  assert.ok(prose.split(/\r?\n/).some((l) => l.includes('PRE-EXISTING') && l.includes('git blame')), 'falta, fora do bloco, a regra que diz que um defeito datado pelo git blame de antes da base é PRE-EXISTING');
});

test('C1 [ataque]: a linha briefs exige PRE-EXISTING no critic.md: tirá-lo de um projeto gerado faz falhar a linha, e há no corpus uma mutação que o faz', async () => {
  const dest = await generate(corpusAnswers('en-plain-published'));
  const pre = check(dest);
  assert.equal(state(pre.out, 'briefs'), 'ok', 'a linha briefs falha sem mutação: ' + fails(pre.out));
  assert.ok(replaceIn(join(dest, '.claude/briefs/critic.md'), 'PRE-EXISTING', 'PRE-EXIST1NG'), 'o critic.md gerado não tem PRE-EXISTING');
  const post = check(dest);
  assert.equal(state(post.out, 'briefs'), 'FAIL', 'sem PRE-EXISTING no critic.md a linha briefs não falha: ' + fails(post.out));
  assert.equal(post.status, 1);
  const ms = mutations().filter((m) => m.file === '.claude/briefs/critic.md' && String(m.find).includes('PRE-EXISTING') && !String(m.replace).includes('PRE-EXISTING') && m.line === 'briefs');
  assert.ok(ms.length >= 1, 'sem mutação do corpus que tire PRE-EXISTING do critic.md (linha briefs): ' + JSON.stringify(mutations().map((m) => [m.name, m.file, m.line])));
});