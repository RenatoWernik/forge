// F-23b, C1 (D2): o repro de cada bloqueante corre de novo, por outro agente (models.tester), antes de reprovar. Oráculos do corpo da #78
// (as linhas da simulação, aqui no runtime falso dos ataques): 2 bloqueantes de materialidade 2 e um não reproduzido → fica 1 e a métrica
// dá 1; os 2 não reproduzidos, com o vencedor certo e testsPass → a peça ganha; um de materialidade 1 não reproduzido continua a bloquear;
// uma resposta null do repro não muda nada; 0 chamadas repro: sem bloqueantes; o texto do dev (summary, reason) não chega ao prompt repro:;
// o repro corre com o modelo do tester. E uma implementação de referência para planos ao acaso: o gauntlet-build.js da BASE com o
// blocking de cada ronda já filtrado pelas regras do repro dá o mesmo desfecho («o won é calculado depois do repro, com as regras de hoje»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, srcBase, contract, baseArgs, runWf, scenario, resultOf, why, devCalls, criticCalls, testerCalls, reproCalls, answer, allReproduced, plain, inSlot, reproShape, PROBE, outcome, rng, randomPlan, randomRepro, reproOf, step2 } from './helpers.mjs';

const p = contract('pa', 9101);
const go = (plan, repro, { mode = 'rigorous', dev } = {}) => runWf(srcNow(), baseArgs([p], { mode }), scenario(p, { critic: (r) => plan[r - 1] || {}, repro, dev }));
// repro por ronda: oks[r] = os reproduced dos achados F<r>-1, F<r>-2, ... (uma ronda sem entrada responde tudo reproduzido)
const byRound = (oks) => (r, prompt, run) => (oks[r] ? answer(r, oks[r]) : allReproduced(r, run));
const nr = (r) => r?.metrics?.criticNotReproduced;

test('C1 [ataque]: um veredito com blocking faz UMA chamada repro:<id>:r<N>, com o modelo e o esforço de models.tester, depois do crítico e antes do registo do veredito', async () => {
  const run = await go([{ blocking: [[1], [3]] }, { blocking: [[2]] }, {}], byRound({}));
  assert.equal(resultOf(run)?.won, true, why(run));
  const rs = reproCalls(run);
  assert.deepEqual(rs.map((c) => c.opts.label), ['repro:pa:r1', 'repro:pa:r2'], 'rótulos repro: ' + JSON.stringify(run.calls.map((c) => c.opts.label)));
  for (const c of rs) assert.deepEqual([c.opts.model, c.opts.effort], [PROBE.tester.model, PROBE.tester.effort], 'o repro não corre com models.tester');
  assert.equal(testerCalls(run).length, 2, 'há chamadas com o modelo do tester que não são o repro');
  const at = (l) => run.calls.findIndex((c) => c.opts.label === l);
  for (const r of [1, 2]) {
    assert.ok(at(`critic:pa:r${r}`) < at(`repro:pa:r${r}`), `o repro da r${r} correu antes do crítico`);
    assert.ok(at(`repro:pa:r${r}`) < at(`panel:verdict:pa:r${r}`), `o veredito da r${r} foi registado antes do repro`);
    assert.ok(at(`repro:pa:r${r}`) < at(`build:pa:r${r + 1}`), `o dev da r${r + 1} correu antes do repro da r${r}`);
  }
});

test('C1 [guarda]: um veredito sem blocking não faz nenhuma chamada de repro (ganhou, perdeu a comparação, testes a falhar)', async () => {
  for (const plan of [[{}], [{ lost: true }, {}], [{ testsPass: false }, {}]]) {
    const run = await go(plan, () => { throw new Error('repro chamado sem bloqueantes'); });
    assert.ok(resultOf(run)?.won, why(run));
    assert.equal(testerCalls(run).length, 0, 'chamada com o modelo do tester sem bloqueantes: ' + JSON.stringify(plan));
    assert.equal(reproCalls(run).length, 0);
  }
});

test('C1 [ataque]: o prompt do repro recebe os pares {finding, repro} da ronda e nunca o description, a reason do dev, o summary, o biggestGap nem o reasoning', async () => {
  const MARK = 'REASON-CONTESTED-F23B';
  const run = await go([{ blocking: [[1], [3]] }, { blocking: [[2]] }, {}], byRound({}), {
    dev: (r) => (r === 2 ? { responses: [{ finding: 'F1-1', answer: 'contested', reason: MARK }, { finding: 'F1-2', answer: 'fixed' }] } : {}),
  });
  const [r1, r2] = reproCalls(run);
  assert.ok(r1 && r2, 'faltam as chamadas repro:pa:r1 e repro:pa:r2: ' + why(run));
  for (const t of ['F1-1', 'F1-2', 'REPRO-r1-C1', 'REPRO-r1-C3']) assert.ok(r1.prompt.includes(t), `repro:pa:r1 sem ${t}`);
  for (const t of ['F2-1', 'REPRO-r2-C2']) assert.ok(r2.prompt.includes(t), `repro:pa:r2 sem ${t}`);
  assert.ok(!r2.prompt.includes('REPRO-r1-'), 'repro:pa:r2 recebeu os repros da ronda 1');
  for (const [c, r] of [[r1, 1], [r2, 2]]) {
    for (const t of [`DESC-r${r}-`, MARK, 'DEV-NARRATIVE', 'GAP-r', 'CRITIC-REASONING']) assert.ok(!c.prompt.includes(t), `repro:pa:r${r} recebeu ${t}`);
  }
});

test('C1 [ataque]: o schema do repro declara a lista de {finding, reproduced: boolean, output} (na raiz, ou na única propriedade array de uma raiz object), com o comando em primeiro plano e a saída truncada a 2000', async () => {
  const run = await go([{ blocking: [[1]] }, {}], byRound({}));
  const c = reproCalls(run)[0];
  assert.ok(c, 'sem chamada repro: ' + why(run));
  const s = c.opts.schema || {};
  const { key, items } = reproShape(s);
  assert.ok(s.type === 'array' || (s.type === 'object' && key), 'o schema do repro não declara a lista (raiz array, ou raiz object com uma só propriedade array): ' + JSON.stringify(s).slice(0, 300));
  if (key) assert.ok((s.required || []).includes(key), `required sem ${key}`);
  assert.equal(items?.type, 'object', 'os itens da lista não são objetos');
  for (const k of ['finding', 'reproduced', 'output']) assert.ok(items.properties?.[k], `items sem ${k}`);
  assert.equal(items.properties.reproduced.type, 'boolean', 'reproduced não é boolean');
  for (const k of ['finding', 'reproduced']) assert.ok((items.required || []).includes(k), `items.required sem ${k}`);
  const text = c.prompt + JSON.stringify(s);
  assert.match(text, /\b2000\b/, 'nem o prompt nem o schema dizem que a saída se trunca a 2000');
  assert.match(text, /foreground|primeiro plano/i, 'nem o prompt nem o schema dizem para correr o comando em primeiro plano');
});

test('C1 [ataque]: 2 bloqueantes de materialidade 2 e um não reproduzido: fica 1 bloqueante (a ronda reprova) e metrics.criticNotReproduced dá 1', async () => {
  const run = await go([{ blocking: [[1], [3]] }, {}], byRound({ 1: [false, true] }));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.won, true, why(run));
  assert.equal(r.rounds, 2, 'com 1 bloqueante reproduzido a r1 não podia ganhar: ' + why(run));
  assert.equal(nr(r), 1, 'metrics.criticNotReproduced: ' + JSON.stringify(r.metrics));
});

test('C1 [ataque]: o não reproduzido sai do blocking para minor com notReproduced: true e deixa de contar como critério falhado', async () => {
  // R1 e R2 reprovam C1 e C3, com o C1 não reproduzido nas duas: só o C3 falha 2× → redesign com o C3 (se o C1 ficasse, seria o C1)
  const run = await go([{ blocking: [[1], [3]] }, { blocking: [[1], [3]] }, {}], byRound({ 1: [false, true], 2: [false, true] }));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.stopped, 'redesign', why(run));
  assert.equal(r.criterion, 'C3', 'o critério do redesign (o C1 não reproduzido contou como falhado?): ' + why(run));
  assert.equal(nr(r), 2, 'metrics.criticNotReproduced: ' + JSON.stringify(r.metrics));
  const lv = plain(r.lastVerdict) || {};
  assert.deepEqual((lv.blocking || []).map((b) => b.criterion), ['C3'], 'lastVerdict.blocking: ' + JSON.stringify(lv.blocking));
  const moved = (lv.minor || []).filter((m) => m && typeof m === 'object' && m.notReproduced === true);
  assert.equal(moved.length, 1, 'lastVerdict.minor sem o achado com notReproduced: true: ' + JSON.stringify(lv.minor));
  assert.ok(JSON.stringify(moved[0]).includes('REPRO-r2-C1'), 'o item movido para minor não é o C1 da r2: ' + JSON.stringify(moved[0]));
});

test('C1 [ataque]: os 2 bloqueantes não reproduzidos, com o vencedor certo e testsPass: a peça ganha na r1', async () => {
  const run = await go([{ blocking: [[1], [3]] }], byRound({ 1: [false, false] }));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.won, true, 'a peça não ganhou com os 2 bloqueantes não reproduzidos: ' + why(run));
  assert.equal(r.rounds, 1, why(run));
  assert.equal(nr(r), 2, 'metrics.criticNotReproduced: ' + JSON.stringify(r.metrics));
  assert.deepEqual(plain(r.lastVerdict?.blocking), [], 'lastVerdict.blocking: ' + JSON.stringify(r.lastVerdict?.blocking));
  assert.equal((r.lastVerdict?.minor || []).filter((m) => m && m.notReproduced === true).length, 2, 'minor: ' + JSON.stringify(r.lastVerdict?.minor));
});

test('C1 [ataque]: um bloqueante de materialidade 1 não reproduzido continua a bloquear, só com unconfirmed: true (e o de materialidade 2 ao lado sai)', async () => {
  const one = await go([{ blocking: [[1, 1, 'regression'], [3]] }, {}], byRound({ 1: [false, false] }));
  assert.equal(resultOf(one)?.rounds, 2, 'a r1 ganhou com um «reprova sempre» não reproduzido: ' + why(one));
  assert.equal(resultOf(one)?.won, true, why(one));
  const cats = [[1, 1, 'regression'], [2, 1, 'security'], [3, 1, 'data-loss']];
  const run = await go(cats.map((b) => ({ blocking: [b] })), byRound({ 1: [false], 2: [false], 3: [false] }));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(r.won, false, why(run));
  assert.equal(r.stopped, 'contract', 'três rondas com um «reprova sempre» não reproduzido: ' + why(run));
  const lv = r.lastVerdict?.blocking || [];
  assert.equal(lv.length, 1, 'lastVerdict.blocking: ' + JSON.stringify(lv));
  assert.equal(lv[0].criterion, 'C3');
  assert.equal(lv[0].unconfirmed, true, 'o bloqueante de materialidade 1 não reproduzido sem unconfirmed: true: ' + JSON.stringify(lv[0]));
});

test('C1 [ataque]: um bloqueante de materialidade 1 não reproduzido «só ganha unconfirmed»: não entra na métrica criticNotReproduced', async () => {
  const run = await go([{ blocking: [[1, 1, 'regression']] }, {}], byRound({ 1: [false] }));
  assert.equal(nr(resultOf(run)), 0, 'metrics.criticNotReproduced: ' + JSON.stringify(resultOf(run)?.metrics));
});

// Respostas do repro que não valem: em falta, não-array, ou sem um dos ids. Cada uma mantém TODOS os bloqueantes (falha fechada).
const INVALID = {
  null: () => null,
  undefined: () => undefined,
  'texto (o "ok" dos runtimes antigos)': () => 'ok',
  'objeto no lugar da lista': (r) => inSlot({ results: answer(r, [false, false]) }),
  'objeto sem a lista': () => ({}),
  'sem o id F1-2': (r) => answer(r, [false, false]).slice(0, 1),
  'ids de outra ronda': () => answer(9, [false, false]),
  'lista vazia': () => [],
};
test('C1 [guarda]: uma resposta do repro inválida (em falta, não-array, sem um dos ids) mantém todos os bloqueantes: a peça que ganharia sem eles não ganha', async () => {
  for (const [what, f] of Object.entries(INVALID)) {
    const run = await go([{ blocking: [[1], [3]] }, {}], (r) => f(r));
    const r = resultOf(run);
    assert.ok(r, `${what}: ` + why(run));
    assert.equal(r.rounds, 2, `${what}: a peça ganhou na r1 com uma resposta de repro inválida: ` + why(run));
    const c2 = criticCalls(run)[1]?.prompt || '';
    for (const t of ['REPRO-r1-C1', 'REPRO-r1-C3']) assert.ok(c2.includes(t), `${what}: o crítico da r2 não recebeu ${t} (o bloqueante caiu)`);
  }
});

test('C1 [ataque]: metrics.criticNotReproduced existe e dá 0 sem bloqueantes e com uma resposta de repro inválida', async () => {
  const none = await go([{}], () => null);
  assert.equal(nr(resultOf(none)), 0, 'sem bloqueantes: ' + JSON.stringify(resultOf(none)?.metrics));
  for (const [what, f] of Object.entries(INVALID)) {
    const run = await go([{ blocking: [[1], [3]] }, {}], (r) => f(r));
    assert.equal(nr(resultOf(run)), 0, `${what}: ` + JSON.stringify(resultOf(run)?.metrics));
  }
});

// Implementação de referência: a BASE (sem repro) com o blocking de cada ronda já filtrado pelas regras do C1.
const filtered = (plan, specs) => plan.map((x, i) => {
  const s = specs[i], b = x.blocking || [];
  if (!b.length || !s?.valid) return x;
  return { ...x, blocking: b.filter((it, k) => !(s.oks[k] === false && (it[1] ?? 2) !== 1)) };
});
for (const mode of ['rigorous', 'accelerated']) {
  test(`C1 [ataque] (${mode}): em 80 planos ao acaso, com respostas de repro válidas e inválidas, o desfecho é o da BASE com o blocking já filtrado, a métrica soma os que saíram e há um repro por ronda com bloqueantes`, async () => {
    for (let seed = 1; seed <= 80; seed++) {
      const r = rng(7000 + seed), plan = randomPlan(r), specs = plan.map((x) => randomRepro(r, (x.blocking || []).length));
      const exp = filtered(plan, specs);
      const ref = await runWf(srcBase(), baseArgs([p], { mode }), scenario(p, { critic: (n) => exp[n - 1] || {} }));
      const refR = resultOf(ref);
      assert.ok(refR, 'a BASE não correu: ' + why(ref));
      const run = await go(plan, (n) => reproOf(n, specs[n - 1], (plan[n - 1].blocking || []).length), { mode });
      const got = resultOf(run), msg = `${mode}, semente ${seed}, plano ${JSON.stringify(plan)}, repro ${JSON.stringify(specs)}: ${why(run)}`;
      assert.equal(run.err, undefined, msg);
      assert.deepEqual(outcome(got), outcome(refR), msg);
      const ran = plan.slice(0, refR.rounds);
      const want = ran.reduce((a, x, i) => a + (x.blocking || []).length - (exp[i].blocking || []).length, 0);
      assert.equal(nr(got), want, 'metrics.criticNotReproduced, ' + msg);
      assert.deepEqual(reproCalls(run).map((c) => c.opts.label), ran.flatMap((x, i) => ((x.blocking || []).length ? [`repro:pa:r${i + 1}`] : [])), 'chamadas repro:, ' + msg);
    }
  });
}

test('C1 [ataque]: o §5 Step 2 do FRAMEWORK diz que criticNotReproduced alimenta o gatilho noise do /forge:learn', () => {
  const s = step2();
  assert.ok(s.length > 200, 'não encontrei o §5 «### Step 2.» no FRAMEWORK.md');
  assert.match(s, /\bcriticNotReproduced\b/, 'Step 2 sem criticNotReproduced');
  assert.match(s, /\bnoise\b/, 'Step 2 sem o gatilho noise');
  assert.match(s, /\/forge:learn\b/, 'Step 2 sem /forge:learn');
});