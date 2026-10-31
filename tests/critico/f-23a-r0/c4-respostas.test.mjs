// F-23a, C4 (D3): o dev responde a cada achado. Oráculos do corpo da #77 (linhas da simulação, com a marca REASON-CONTESTED-1 no reason):
// a marca aparece em `results[].contested`; a marca não aparece em nenhum prompt de crítico; a resposta em falta dá o WARNING; e a linha
// `briefs` do check.cjs exige `contested` no dev.md. Também o que o critério fixa por escrito: o id estável F<ronda>-<n> mostrado ao dev
// da ronda seguinte, o campo `responses` do BUILD, e o crítico sem o `reason` nem o `answer` do dev (a lista `blocking` segue como hoje).
// Ver a PERGUNTA na #77 sobre o valor de `contested[].round` (a ronda do achado ou a da resposta): até à resposta, só se exige um inteiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { srcNow, contract, baseArgs, runWf, scenario, resultOf, why, devCalls, criticCalls, read, H, D, LOG_NO_ANSWER, generate, corpusAnswers, check, state, fails, replaceIn } from './helpers.mjs';

const p = contract('pa', 9101);
const MARK = 'REASON-CONTESTED-1';
// R1 reprova com 2 bloqueantes (C1 e C3), a R2 com 1 (C2), a R3 ganha
const PLAN = [{ blocking: [[1], [3]] }, { blocking: [[2]] }, {}];
const ANSWERS = {
  contested: { 2: [{ finding: 'F1-1', answer: 'contested', reason: MARK }, { finding: 'F1-2', answer: 'fixed' }], 3: [{ finding: 'F2-1', answer: 'fixed' }] },
  allContested: { 2: [{ finding: 'F1-1', answer: 'contested', reason: MARK }, { finding: 'F1-2', answer: 'contested', reason: MARK + '-B' }], 3: [{ finding: 'F2-1', answer: 'contested', reason: MARK + '-C' }] },
  allFixed: { 2: [{ finding: 'F1-1', answer: 'fixed' }, { finding: 'F1-2', answer: 'fixed' }], 3: [{ finding: 'F2-1', answer: 'fixed' }] },
  missing: { 2: [{ finding: 'F1-1', answer: 'fixed' }], 3: [{ finding: 'F2-1', answer: 'fixed' }] },
};
const go = (answers, plan = PLAN) => runWf(srcNow(), baseArgs([p]), scenario(p, {
  dev: (r) => ({ head: H(r), diffHash: D(r), responses: answers[r] || [] }),
  critic: (r) => ({ ...(plan[r - 1] || {}), sha: H(r), preExisting: [] }),
}));

test('C4 [ataque]: cada bloqueante ganha o id F<ronda>-<n> e o dev da ronda seguinte recebe-o com o achado; o dev da R1 não recebe nenhum', async () => {
  const run = await go(ANSWERS.contested);
  const ds = devCalls(run);
  assert.equal(ds.length, 3, why(run));
  assert.doesNotMatch(ds[0].prompt, /\bF\d+-\d+\b/, 'o dev da R1 recebeu um id de achado');
  for (const t of ['F1-1', 'F1-2', 'REPRO-r1-C1', 'REPRO-r1-C3']) assert.ok(ds[1].prompt.includes(t), `o dev da R2 não recebeu ${t}`);
  assert.doesNotMatch(ds[1].prompt, /\bF1-3\b/, 'o dev da R2 recebeu um F1-3 (a R1 só tem 2 bloqueantes)');
  for (const t of ['F2-1', 'REPRO-r2-C2']) assert.ok(ds[2].prompt.includes(t), `o dev da R3 não recebeu ${t}`);
});

test('C4 [ataque]: o BUILD exige responses, uma lista de {finding, answer: "fixed" | "contested", reason?}', async () => {
  const run = await go(ANSWERS.contested);
  const s = devCalls(run)[0]?.opts.schema || {};
  assert.ok((s.required || []).includes('responses'), 'BUILD.required sem responses: ' + JSON.stringify(s.required));
  const rs = s.properties?.responses || {};
  assert.equal(rs.type, 'array', 'responses não é uma lista');
  for (const k of ['finding', 'answer', 'reason']) assert.ok(rs.items?.properties?.[k], `responses.items sem ${k}`);
  for (const k of ['finding', 'answer']) assert.ok((rs.items?.required || []).includes(k), `responses.items.required sem ${k}`);
  assert.deepEqual([...(rs.items.properties.answer.enum || [])].sort(), ['contested', 'fixed'], 'answer.enum');
});

test('C4 [ataque]: um achado contestado chega a results[].contested com o finding, o reason (a marca), o criterion e a round; o "fixed" não', async () => {
  const run = await go(ANSWERS.contested);
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.won, true, why(run));
  assert.ok(Array.isArray(r.contested), 'results[].contested não é uma lista: ' + why(run));
  assert.equal(r.contested.length, 1, 'contested: ' + JSON.stringify(r.contested));
  const [c] = r.contested;
  assert.equal(c.finding, 'F1-1');
  assert.equal(c.reason, MARK);
  assert.ok(['C1', 'c1'].includes(String(c.criterion)), 'criterion: ' + JSON.stringify(c));
  assert.ok(Number.isInteger(c.round) && [1, 2].includes(c.round), 'round: ' + JSON.stringify(c));
});

test('C4 [guarda]: o crítico nunca recebe o reason nem o answer do dev: os prompts do crítico são os mesmos com tudo contestado, tudo corrigido ou sem respostas', async () => {
  const runs = await Promise.all([ANSWERS.allContested, ANSWERS.allFixed, {}].map((a) => go(a)));
  const prompts = runs.map((run) => criticCalls(run).map((c) => c.prompt));
  assert.equal(prompts[0].length, 3, why(runs[0]));
  for (const ps of prompts) for (const t of ps) assert.ok(!t.includes(MARK), 'a marca do reason chegou ao crítico');
  assert.deepEqual(prompts[1], prompts[0], 'o prompt do crítico muda com as respostas do dev (tudo corrigido vs tudo contestado)');
  assert.deepEqual(prompts[2], prompts[0], 'o prompt do crítico muda com as respostas do dev (sem respostas vs tudo contestado)');
  // a lista blocking anterior segue como hoje, só com o texto do crítico
  assert.ok(prompts[0][1].includes('REPRO-r1-C1') && prompts[0][1].includes('REPRO-r1-C3'), 'o crítico da R2 não recebeu os bloqueantes da R1');
});

test('C4 [ataque]: um achado da ronda anterior sem resposta dá o WARNING literal, e um respondido não', async () => {
  const run = await go(ANSWERS.missing);
  assert.ok(run.logs.includes(LOG_NO_ANSWER('pa', 2, 'F1-2')), `falta «${LOG_NO_ANSWER('pa', 2, 'F1-2')}»: ` + JSON.stringify(run.logs));
  assert.ok(!run.logs.some((l) => /no answer to F1-1\b/.test(l) || /no answer to F2-1\b/.test(l)), 'WARNING para um achado respondido: ' + JSON.stringify(run.logs));
});

test('C4 [guarda]: na R1 (responses []) e com tudo respondido não há WARNING de resposta em falta', async () => {
  const run = await go(ANSWERS.allFixed);
  assert.equal(resultOf(run)?.won, true, why(run));
  assert.deepEqual(run.logs.filter((l) => /no answer to/.test(l)), []);
});

test('C4 [ataque]: o dev.md diz para responder a cada achado com fixed ou contested e o motivo', () => {
  const t = read('templates/.claude/briefs/dev.md');
  assert.match(t, /\bfixed\b/, 'o dev.md não tem "fixed"');
  assert.match(t, /\bcontested\b/, 'o dev.md não tem "contested"');
});

test('C4 [ataque]: a linha briefs exige contested no dev.md: tirá-lo de um projeto gerado faz falhar a linha', async () => {
  const dest = await generate(corpusAnswers('en-plain-published'));
  const pre = check(dest);
  assert.equal(state(pre.out, 'briefs'), 'ok', 'a linha briefs falha sem mutação: ' + fails(pre.out));
  assert.ok(replaceIn(join(dest, '.claude/briefs/dev.md'), 'contested', 'disputed'), 'o dev.md gerado não tem contested');
  const post = check(dest);
  assert.equal(state(post.out, 'briefs'), 'FAIL', 'sem contested no dev.md a linha briefs não falha: ' + fails(post.out));
  assert.equal(post.status, 1);
});