// F-23b, C2: as classes conhecidas e a classe de cada achado. Oráculos do corpo da #78 (as linhas da simulação, aqui no runtime falso):
// as classes aparecem nos dois prompts de crítico (Ronda −1 no gauntlet-attacks.js e crítico do build) e não no do dev; a recusa com
// `Bad Class` e com `"x y"`; metrics.classes conta as classes das rondas; sem knownClasses nada é recusado e os prompts dizem
// `No known classes yet.`. Também o que o critério fixa por escrito: blocking[].class obrigatório e kebab-case no schema do veredito, e o
// §10.1 do FRAMEWORK com `node .claude/learn.mjs classes --ref <integration branch>`.
// «o workflow recusa» vale para os dois workflows, gauntlet-build e gauntlet-attacks (resposta 4 do orquestrador na #78).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, attacksNow, contract, baseArgs, runWf, scenario, resultOf, why, devCalls, criticCalls, allReproduced, attacksImpl, plain, KNOWN, KEBAB, s101 } from './helpers.mjs';

const p = contract('pa', 9101);
const NAMES = KNOWN.map((k) => k.class);
const NONE = 'No known classes yet.';
const build = (over = {}, plan = [{}], repro = (r, _, run) => allReproduced(r, run)) => runWf(srcNow(), baseArgs([p], over), scenario(p, { critic: (r) => plan[r - 1] || {}, repro }));
const attacks = (over = {}) => runWf(attacksNow(), baseArgs([p], over), attacksImpl);
const atkCritic = (run) => run.calls.filter((c) => /^attacks:/.test(String(c.opts.label)));

test('C2 [ataque]: com knownClasses, os nomes das classes chegam ao crítico da Ronda −1 (com a instrução de atacar primeiro as conhecidas) e ao crítico do build', async () => {
  const a = await attacks({ knownClasses: KNOWN });
  const ac = atkCritic(a);
  assert.equal(ac.length, 1, 'o gauntlet-attacks não chamou o crítico: ' + String(a.err?.message ?? ''));
  for (const n of NAMES) assert.ok(ac[0].prompt.includes(n), `o crítico da Ronda −1 não recebeu a classe ${n}`);
  assert.match(ac[0].prompt, /\bknown\b[^.\n]{0,20}\bclass/i, 'o prompt da Ronda −1 não fala das classes conhecidas');
  assert.match(ac[0].prompt, /\bfirst\b|primeiro/i, 'o prompt da Ronda −1 não manda atacar primeiro as classes conhecidas');
  const b = await build({ knownClasses: KNOWN }, [{ blocking: [[1, 2, 'criterion', 'port-race-probe']] }, {}]);
  const cs = criticCalls(b);
  assert.equal(cs.length, 2, why(b));
  for (const c of cs) for (const n of NAMES) assert.ok(c.prompt.includes(n), `o crítico do build não recebeu a classe ${n}`);
});

test('C2 [ataque]: as classes conhecidas não chegam ao prompt do dev', async () => {
  const b = await build({ knownClasses: KNOWN }, [{ blocking: [[1, 2, 'criterion', 'brand-new-class']] }, {}]);
  const ds = devCalls(b);
  assert.equal(ds.length, 2, why(b));
  for (const d of ds) for (const n of NAMES) assert.ok(!d.prompt.includes(n), `o dev recebeu a classe conhecida ${n}`);
  // e o crítico recebe-as (para o teste não passar com um workflow que as ignora)
  assert.ok(criticCalls(b).every((c) => NAMES.every((n) => c.prompt.includes(n))), 'o crítico do build não recebeu as classes');
});

test('C2 [ataque]: sem knownClasses nada é recusado e os dois prompts de crítico dizem «No known classes yet.»', async () => {
  const a = await attacks();
  assert.equal(a.err, undefined, String(a.err?.message ?? ''));
  assert.ok(atkCritic(a)[0]?.prompt.includes(NONE), `o crítico da Ronda −1 não recebeu «${NONE}»`);
  const b = await build();
  assert.equal(resultOf(b)?.won, true, why(b));
  assert.ok(criticCalls(b).length > 0 && criticCalls(b).every((c) => c.prompt.includes(NONE)), `o crítico do build não recebeu «${NONE}»`);
});

test('C2 [guarda]: knownClasses válidas (kebab-case) não são recusadas: os dois workflows correm', async () => {
  const a = await attacks({ knownClasses: KNOWN });
  assert.equal(a.err, undefined, String(a.err?.message ?? ''));
  assert.equal(atkCritic(a).length, 1);
  const b = await build({ knownClasses: KNOWN });
  assert.equal(b.err, undefined, why(b));
  assert.equal(resultOf(b)?.won, true, why(b));
});

for (const bad of ['Bad Class', 'x y']) {
  test(`C2 [ataque]: uma class «${bad}» (não kebab-case) é recusada com «incomplete args: knownClasses: ...» antes de qualquer agente, nos dois workflows`, async () => {
    const kc = [KNOWN[0], { class: bad, entries: ['E-009'], strongest: 'text' }];
    for (const [what, src] of [['gauntlet-build', srcNow()], ['gauntlet-attacks', attacksNow()]]) {
      let n = 0;
      const run = await runWf(src, baseArgs([p], { knownClasses: kc }), () => { n++; return 'ok'; });
      assert.equal(n, 0, `${what}: ${n} agente(s) lançado(s) antes da recusa`);
      assert.ok(String(run.err?.message ?? '').includes('incomplete args: knownClasses: '), `${what}: a recusa não diz «incomplete args: knownClasses: »: ` + String(run.err?.message ?? 'sem erro').slice(0, 300));
    }
  });
}

test('C2 [ataque]: cada item de blocking do schema do veredito exige class, kebab-case', async () => {
  const b = await build();
  const s = criticCalls(b)[0]?.opts.schema?.properties?.blocking?.items || {};
  assert.ok((s.required || []).includes('class'), 'blocking.items.required sem class: ' + JSON.stringify(s.required));
  assert.equal(s.properties?.class?.type, 'string', 'blocking.items.properties.class não é string');
  assert.equal(s.properties.class.pattern, KEBAB.source, 'blocking.items.properties.class.pattern não é o kebab-case do contrato');
});

test('C2 [ataque]: o resultado traz metrics.classes, que conta as classes dos bloqueantes das rondas; uma peça sem bloqueantes dá {}', async () => {
  const plan = [{ blocking: [[1, 2, 'criterion', 'alpha-one'], [3, 2, 'criterion', 'beta-two']] }, { blocking: [[2, 2, 'criterion', 'alpha-one']] }, {}];
  const b = await build({ knownClasses: KNOWN }, plan);
  const r = resultOf(b);
  assert.equal(r?.won, true, why(b));
  assert.equal(r.rounds, 3, why(b));
  assert.deepEqual(plain(r.metrics?.classes), { 'alpha-one': 2, 'beta-two': 1 }, 'metrics.classes: ' + JSON.stringify(r.metrics));
  const w = resultOf(await build());
  assert.deepEqual(plain(w?.metrics?.classes), {}, 'metrics.classes sem bloqueantes: ' + JSON.stringify(w?.metrics));
});

test('C2 [ataque]: o §10.1 do FRAMEWORK diz que o orquestrador lê a lista com node .claude/learn.mjs classes --ref <integration branch>, nunca da worktree de uma peça nem da memória', () => {
  const s = s101();
  assert.ok(s.length > 100, 'não encontrei o «### 10.1» no FRAMEWORK.md');
  assert.ok(s.includes('node .claude/learn.mjs classes --ref'), '§10.1 sem «node .claude/learn.mjs classes --ref»');
  assert.match(s, /integration branch/i, '§10.1 sem a branch de integração');
  assert.match(s, /\bnever\b[^\n]*\bworktree\b/i, '§10.1 não diz «nunca da worktree»');
  assert.match(s, /\bworktree\b[^\n]*\bmemory\b|\bmemory\b[^\n]*\bworktree\b/i, '§10.1 não diz «nem da memória»');
});