// F-08: a parte determinística do gauntlet-build (âmbito da #9): validação dos args novos, o schema do veredito no formato do brief,
// o dev escolhido pelo campo `ui` da peça, os prompts a apontar para os briefs e para a issue, e a retoma determinística.
// Oráculos: corpus finito de args inválidos; a lista literal das secções do veredito do brief (F-06: VERDICT, BLOCKING com a
// materialidade 1, 2 ou 3 e o repro, MINOR, BAR QUESTIONS, FOLLOW-UP); modelos de sonda distintos por papel.
// Depende do F-07: sim (args com o contrato da peça e a Ronda −1 em `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD, CONDITIONS, contract, baseArgs, escalation, runWf, scenario, resultOf, roleOf, why, fail, briefsIn, refusalText } from './helpers.mjs';

const p = contract('pa', 9101);
const refuses = async (args, field) => {
  let n = 0;
  const run = await runWf(BUILD, args, () => { n++; return 'ok'; });
  const msg = refusalText(run);
  assert.equal(n, 0, `${field}: gastou ${n} agentes antes de recusar`);
  assert.ok(run.err || run.out === undefined || /incomplete|invalid/i.test(msg), `${field}: não recusou: ${msg.slice(0, 300)}`);
  assert.match(msg, new RegExp(`\\b${field}\\b`), `${field}: a recusa não nomeia o campo: ${msg.slice(0, 300)}`);
};

test('C8: um mode em falta ou fora de rigorous e accelerated é recusado antes de qualquer agente, com o nome do campo', async () => {
  for (const mode of ['fast', 'turbo', 'Rigorous', 'rigoroso', 0, '']) await refuses(baseArgs([p], { mode }), 'mode');
  // resposta 1 da #9: sem mode, recusa (sem valor por omissão)
  const sem = baseArgs([p]); delete sem.mode;
  await refuses(sem, 'mode');
});

test('C8: uma escalation sem uma das 4 condições, ou com um valor do tipo errado, é recusada antes de qualquer agente', async () => {
  const bad = [
    undefined, {}, ...CONDITIONS.map((c) => { const e = escalation(); delete e[c]; return e; }),
    escalation({ sameCriterionFailures: 0 }), escalation({ sameCriterionFailures: '2' }), escalation({ minutesWithoutProgress: 1.5 }),
    escalation({ attacksRedOnDelivery: 'yes' }), escalation({ visualBelowReference: 1 }),
  ];
  for (const e of bad) await refuses({ ...baseArgs([p]), escalation: e }, 'escalation');
});

test('C8: o veredito do crítico tem o formato do brief: BLOCKING com o critério, a materialidade (só 1, 2 ou 3) e o repro, mais MINOR, BAR QUESTIONS e FOLLOW-UP', async () => {
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1)] }));
  const crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
  assert.ok(crit.length >= 1, 'sem crítico: ' + why(run, p.id));
  const s = crit[0].opts.schema;
  assert.equal(s?.type, 'object', 'schema do crítico sem raiz object');
  assert.ok((s.required || []).every((k) => k in (s.properties || {})), 'required fora de properties');
  const props = Object.entries(s.properties || {});
  const arr = (re) => props.find(([k, v]) => re.test(k) && v.type === 'array');
  const blocking = arr(/block|bloq/i);
  assert.ok(blocking, 'sem a lista BLOCKING: ' + JSON.stringify(Object.keys(s.properties)));
  assert.ok(s.required.includes(blocking[0]), 'a lista BLOCKING não é obrigatória');
  const it = blocking[1].items;
  assert.equal(it?.type, 'object', 'cada bloqueante é um objeto (critério, materialidade, repro)');
  const ip = Object.entries(it.properties || {});
  const mat = ip.find(([k]) => /material/i.test(k)), crt = ip.find(([k]) => !/material/i.test(k) && /crit/i.test(k)), rep = ip.find(([k]) => /repro/i.test(k));
  for (const [name, x] of [['materialidade', mat], ['critério', crt], ['repro', rep]]) {
    assert.ok(x, `o bloqueante não tem o campo ${name}: ${JSON.stringify(Object.keys(it.properties || {}))}`);
    assert.ok((it.required || []).includes(x[0]), `o campo ${x[0]} do bloqueante não é obrigatório`);
  }
  assert.deepEqual(Array.from(mat[1].enum || []).map((v) => Number(String(v).match(/\d/)?.[0])).sort(), [1, 2, 3], 'a materialidade é um enum com exatamente 1, 2 e 3: ' + JSON.stringify(mat[1]));
  for (const [name, re] of [['MINOR', /minor|menor/i], ['BAR QUESTIONS', /question|pergunt/i], ['FOLLOW-UP', /follow|seguim/i]]) assert.ok(arr(re), `sem a lista ${name}: ${JSON.stringify(Object.keys(s.properties))}`);
});

test('C8: a peça com ui:true corre com models.developerUi e a peça sem ui com models.developer; os críticos com models.critic', async () => {
  const ui = contract('pu', 9102, { ui: true }), lg = contract('pl', 9103), lf = contract('pf', 9104, { ui: false });
  const run = await runWf(BUILD, baseArgs([ui, lg, lf]), scenario([ui, lg, lf], { pu: [fail(1)], pl: [fail(1)], pf: [fail(1)] }));
  const devsOf = (q) => run.calls.filter((c) => /^developer/.test(roleOf(c.opts) || '') && c.prompt.includes(q.objective));
  for (const [q, want] of [[ui, 'developerUi'], [lg, 'developer'], [lf, 'developer']]) {
    assert.equal(devsOf(q).length, 2, `${q.id}: 2 rondas esperadas: ${why(run, q.id)}`);
    assert.ok(devsOf(q).every((c) => roleOf(c.opts) === want), `${q.id}: dev fora de models.${want}`);
  }
  assert.ok(run.calls.every((c) => roleOf(c.opts)), 'agente com modelo fora de args.models');
  assert.equal(run.calls.filter((c) => roleOf(c.opts) === 'critic').length, 6);
});

test('C8: os prompts do dev e do crítico apontam para o brief do papel (.claude/briefs/<papel>.md) e para a issue da peça (#<n>)', async () => {
  const run = await runWf(BUILD, baseArgs([p]), scenario([p], { pa: [fail(1)] }));
  const devs = run.calls.filter((c) => /^developer/.test(roleOf(c.opts) || '')), crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
  assert.ok(devs.length >= 2 && crit.length >= 2, why(run, p.id));
  for (const c of devs) {
    assert.ok(briefsIn(c.prompt).includes('dev'), 'o dev não aponta para o brief do dev: ' + c.prompt.slice(0, 200));
    assert.match(c.prompt, /#9101\b/, 'o dev não aponta para a issue #9101');
  }
  for (const c of crit) {
    assert.ok(briefsIn(c.prompt).includes('critic'), 'o crítico não aponta para o brief do crítico: ' + c.prompt.slice(0, 200));
    assert.match(c.prompt, /#9101\b/, 'o crítico não aponta para a issue #9101');
  }
});

// Guarda (já passa na base): sem relógio nem acaso, os mesmos args e respostas repetem exatamente as chamadas
test('C8 (guarda): retoma determinística: o mesmo cenário (REDESENHO no acelerado) repete exatamente os agent() (prompt e opts)', async () => {
  const q = contract('pa', 9101, { central: [1] });
  const go = () => runWf(BUILD, baseArgs([q], { mode: 'accelerated' }), scenario([q], { pa: [fail(1), fail(1)] }));
  const [a, b] = [await go(), await go()];
  assert.ok(a.calls.length >= 3, why(a, q.id));
  assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
  assert.equal(JSON.stringify(resultOf(a, q.id)), JSON.stringify(resultOf(b, q.id)));
});
