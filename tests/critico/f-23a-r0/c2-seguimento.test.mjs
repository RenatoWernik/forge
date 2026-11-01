// F-23a, C2 (D6): um só rótulo, e os `followUp` do crítico chegam ao orquestrador. Oráculos do corpo da #77 e da resposta do orquestrador
// (2026-10-31: o rótulo único é `seguimento`): uma contagem em `templates/**`, com o rótulo `` `follow-up` `` 0 vezes e `seguimento` presente
// no critic.md e no §5 Step 2 do FRAMEWORK; e os `followUp` das rondas 1 e 2 a chegar a `followUps` como { round, kind: "follow-up", description }
// no modo rigoroso e no acelerado. A secção `FOLLOW-UP` do veredito fica (a linha briefs lê-a): o `FOLLOW-UP` em maiúsculas não é o rótulo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, srcNow, contract, baseArgs, runWf, scenario, fresh, resultOf, why, read, step2, walk, rel } from './helpers.mjs';

const p = contract('pa', 9101);
const LABEL = '`follow-up`';
const fuOf = (r) => (Array.isArray(r?.followUps) ? Array.from(r.followUps) : []) /* Array.from: o resultado vem de outro realm (vm) */.filter((f) => f && f.kind === 'follow-up').map((f) => `${f.round}|${f.description}`).sort();

test('C2 [ataque]: nos templates, o rótulo `follow-up` aparece 0 vezes', () => {
  const hits = walk(join(ROOT, 'templates')).flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/).flatMap((l, i) => (l.includes(LABEL) ? [`${rel(f)}:${i + 1}: ${l.trim().slice(0, 120)}`] : [])));
  assert.deepEqual(hits, []);
});

test('C2 [ataque]: `seguimento` está no critic.md e no §5 Step 2 do FRAMEWORK', () => {
  assert.match(read('templates/.claude/briefs/critic.md'), /seguimento/, 'o critic.md não tem o rótulo seguimento');
  const s = step2();
  assert.ok(s.length > 200, 'não encontrei o §5 «### Step 2.» no FRAMEWORK.md');
  assert.match(s, /seguimento/, 'o Step 2 não tem o rótulo seguimento');
});

const FU = { 1: ['FU-r1-a the CSV export lacks a BOM'], 2: ['FU-r2-a the README example is stale', 'FU-r2-b C3 a slow query outside the bar'], 3: ['FU-r3-a the log line is too long'] };
const expected = (rounds) => rounds.flatMap((r) => FU[r].map((d) => `${r}|${d}`)).sort();

for (const mode of ['rigorous', 'accelerated']) {
  test(`C2 [ataque] (${mode}): os followUp do crítico das rondas 1 e 2 chegam a followUps como { round, kind: "follow-up", description }`, async () => {
    const plan = [{ blocking: [[1]], followUp: FU[1] }, { followUp: FU[2] }];
    const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, fresh(plan)));
    const r = resultOf(run);
    assert.ok(r, why(run));
    assert.equal(r.won, true, why(run));
    assert.deepEqual(fuOf(r), expected([1, 2]), 'followUps: ' + JSON.stringify(r.followUps));
  });
}

test('C2 [ataque] (rigorous): os followUp de cada uma das 3 rondas chegam a followUps, também nas rondas perdidas', async () => {
  const plan = [{ blocking: [[1]], followUp: FU[1] }, { lost: true, followUp: FU[2] }, { followUp: FU[3] }];
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, fresh(plan)));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.rounds, 3, why(run));
  assert.deepEqual(fuOf(r), expected([1, 2, 3]), 'followUps: ' + JSON.stringify(r.followUps));
});

test('C2 [ataque] (accelerated): os followUp da R1 e da R2 chegam a followUps também quando a peça para na R2 (maxRounds)', async () => {
  const plan = [{ blocking: [[1]], followUp: FU[1] }, { lost: true, followUp: FU[2] }];
  const run = await runWf(srcNow(), baseArgs([p], { mode: 'accelerated' }), scenario(p, fresh(plan)));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.won, false, why(run));
  assert.deepEqual(fuOf(r), expected([1, 2]), 'followUps: ' + JSON.stringify(r.followUps));
});