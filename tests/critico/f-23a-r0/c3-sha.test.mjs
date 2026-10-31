// F-23a, C3 (D4): o veredito preso ao SHA, e sem crítico quando nada muda. Oráculos do corpo da #77 (linhas da simulação):
//   `sha` diferente: não ganha, com o WARNING; `diffHash` repetido na ronda 2: 0 chamadas `critic:p:r2`, com a ronda contada e o log();
//   `diffHash` ausente nas duas rondas: o crítico corre nas duas; o caminho normal: um crítico por ronda.
// Também o que o critério fixa por escrito: os schemas exigem head, diffHash e sha com os padrões literais, e o prompt do crítico diz o head declarado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, contract, baseArgs, runWf, scenario, fresh, resultOf, why, devCalls, criticCalls, labeled, H, D, LOG_SHA, LOG_SAME, SHA_RE, HASH_RE, rng } from './helpers.mjs';

const p = contract('pa', 9101);
const prop = (s, k) => s?.properties?.[k] || {};

test('C3 [ataque]: o schema BUILD exige head (^[0-9a-f]{40}$) e diffHash (^[0-9a-f]{64}$), e o VERDICT exige sha (^[0-9a-f]{40}$)', async () => {
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, fresh()));
  const b = devCalls(run)[0]?.opts.schema, v = criticCalls(run)[0]?.opts.schema;
  assert.ok(b && v, 'o dev ou o crítico não correram: ' + why(run));
  for (const [s, k, re, what] of [[b, 'head', SHA_RE, 'BUILD'], [b, 'diffHash', HASH_RE, 'BUILD'], [v, 'sha', SHA_RE, 'VERDICT']]) {
    assert.ok((s.required || []).includes(k), `${what}.required sem ${k}: ` + JSON.stringify(s.required));
    assert.equal(prop(s, k).type, 'string', `${what}.${k} não é string`);
    assert.equal(prop(s, k).pattern, re, `${what}.${k}.pattern`);
  }
});

test('C3 [ataque]: o prompt do crítico diz qual é o head declarado pelo dev dessa ronda, e que o sha se lê com git rev-parse HEAD', async () => {
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, fresh([{ blocking: [[1]] }])));
  const cs = criticCalls(run);
  assert.equal(cs.length, 2, why(run));
  cs.forEach((c, i) => {
    assert.ok(c.prompt.includes(H(i + 1)), `o prompt do crítico da R${i + 1} não traz o head ${H(i + 1)}`);
    if (i === 1) assert.ok(!c.prompt.includes(H(1)), 'o crítico da R2 recebeu o head da R1');
  });
  const s = cs[0].opts.schema;
  assert.match(cs[0].prompt + ' ' + String(prop(s, 'sha').description), /git rev-parse HEAD/, 'nem o prompt nem o schema dizem que o sha se lê com git rev-parse HEAD');
});

for (const mode of ['rigorous', 'accelerated']) {
  test(`C3 [ataque] (${mode}): um veredito que ganharia com um sha diferente do head não ganha, e o log() regista o WARNING literal`, async () => {
    const bad = 'e'.repeat(40);
    const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, { dev: (r) => ({ head: H(r), diffHash: D(r), responses: [] }), critic: () => ({ sha: bad, preExisting: [] }) }));
    const r = resultOf(run);
    assert.ok(r, why(run));
    assert.equal(r.won, false, 'ganhou com o veredito de outro commit: ' + why(run));
    assert.ok(run.logs.includes(LOG_SHA('pa', 1, bad, H(1))), `falta o log «${LOG_SHA('pa', 1, bad, H(1))}»: ` + JSON.stringify(run.logs));
  });

  test(`C3 [ataque, propriedade] (${mode}): uma ronda cujo sha não bate com o head nunca é a ronda que ganha (60 sementes)`, async () => {
    let tried = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = rng(seed), match = [0, 1, 2].map(() => g() < 0.5), fail = [0, 1, 2].map(() => g() < 0.35);
      if (!match[0] && !fail[0]) tried++;
      const run = await runWf(srcNow(), baseArgs([p], { mode }), scenario(p, {
        dev: (r) => ({ head: H(r), diffHash: D(r), responses: r < 2 || !fail[r - 2] ? [] : [{ finding: `F${r - 1}-1`, answer: 'fixed' }] }),
        critic: (r) => ({ sha: match[r - 1] ? H(r) : 'f'.repeat(40), preExisting: [], ...(fail[r - 1] ? { blocking: [[r]] } : {}) }),
      }));
      const r = resultOf(run);
      assert.ok(r, `semente ${seed}: ` + why(run));
      if (r.won) assert.ok(match[r.rounds - 1], `semente ${seed} (sha certo por ronda ${match}): ganhou na R${r.rounds} com o sha errado: ${why(run)}`);
    }
    assert.ok(tried >= 5, 'o gerador quase não produziu uma R1 aprovada com o sha errado: ' + tried);
  });
}

test('C3 [ataque] (rigorous): com o diffHash da R2 igual ao da R1, o crítico não corre na R2, a ronda conta como reprovada com o veredito anterior e o log() diz porquê', async () => {
  // R1 reprova no C1; a R2 entrega o mesmo diff: o C1 conta a 2.ª falha, por isso a peça para em redesign no C1
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, {
    dev: (r) => ({ head: H(r), diffHash: D(1), responses: r < 2 ? [] : [{ finding: 'F1-1', answer: 'fixed' }] }),
    critic: (r) => ({ sha: H(r), preExisting: [], blocking: [[1]] }),
  }));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(devCalls(run).length, 2, 'o dev da R2 não correu: ' + why(run));
  assert.equal(labeled(run, 'critic:pa:r2').length, 0, 'o crítico correu na R2 com o diff igual');
  assert.equal(criticCalls(run).length, 1, 'chamadas ao crítico: ' + criticCalls(run).map((c) => c.opts.label));
  assert.equal(r.won, false, why(run));
  assert.equal(r.rounds, 2, 'a ronda sem crítico não contou: ' + why(run));
  assert.equal(r.metrics?.sameCriterionFailures, 2, 'as contagens de critério não subiram como numa reprovação: ' + JSON.stringify(r.metrics));
  assert.equal(r.stopped, 'redesign', why(run));
  assert.ok(['C1', 'c1', 1].includes(r.criterion ?? r.stopped?.criterion), 'redesign sem o critério C1: ' + why(run));
  assert.ok(run.logs.includes(LOG_SAME('pa', 2)), `falta o log «${LOG_SAME('pa', 2)}»: ` + JSON.stringify(run.logs));
  const ver = labeled(run, 'panel:verdict:pa:r2');
  assert.equal(ver.length, 1, 'o painel não registou o veredito da R2');
  assert.ok(ver[0].prompt.includes('"verdict":"perdeu"'), 'o painel da R2 não regista a ronda como perdida');
});

test('C3 [ataque] (accelerated): com o diffHash da R2 igual ao da R1, 0 chamadas ao crítico na R2, a ronda contada, sem ganhar, o log(), e o bloqueante material mantido conta como falha (não vai para followUps)', async () => {
  const run = await runWf(srcNow(), baseArgs([p], { mode: 'accelerated' }), scenario(p, {
    dev: (r) => ({ head: H(r), diffHash: D(1), responses: r < 2 ? [] : [{ finding: 'F1-1', answer: 'fixed' }] }),
    critic: (r) => ({ sha: H(r), preExisting: [], blocking: [[1]] }),
  }));
  const r = resultOf(run);
  assert.ok(r, why(run));
  assert.equal(criticCalls(run).length, 1, 'chamadas ao crítico: ' + criticCalls(run).map((c) => c.opts.label));
  assert.equal(r.won, false, why(run));
  assert.equal(r.rounds, 2, why(run));
  assert.ok(run.logs.includes(LOG_SAME('pa', 2)), JSON.stringify(run.logs));
  // Resposta 2 do orquestrador na #77 (2026-10-31): um bloqueante material que o crítico mantém conta como falha em qualquer modo, e só os itens
  // não materiais vão para followUps; o modo muda só o limite de rondas e a escalada. Por isso a peça para (redesign ou escalate), nunca por maxRounds.
  assert.equal(r.metrics?.sameCriterionFailures, 2, 'o bloqueante mantido não contou como falha: ' + JSON.stringify(r.metrics));
  assert.ok(!Array.from(r.followUps || []).some((f) => JSON.stringify(f).includes('REPRO-r1-C1')), 'o bloqueante mantido foi para followUps: ' + JSON.stringify(r.followUps));
  const why2 = typeof r.stopped === 'object' && r.stopped ? r.stopped.reason : r.stopped;
  assert.ok(['redesign', 'escalate'].includes(why2), 'a peça não parou por redesign ou escalate: ' + why(run));
});

const criticRuns = async (dev, rounds = 3) => {
  const plan = Array.from({ length: rounds - 1 }, (_, i) => ({ blocking: [[i + 1]] }));
  const run = await runWf(srcNow(), baseArgs([p]), scenario(p, { dev, critic: (r) => ({ ...(plan[r - 1] || {}), sha: H(r), preExisting: [] }) }));
  return { run, r: resultOf(run) };
};

test('C3 [guarda]: sem diffHash nas rondas (o dev antigo), o crítico corre em todas', async () => {
  const { run, r } = await criticRuns(() => ({}));
  assert.equal(r?.won, true, why(run));
  assert.equal(criticCalls(run).length, 3, why(run));
});

test('C3 [guarda]: diffHash que não casa com ^[0-9a-f]{64}$ (o "x" do runtime falso do f-08, maiúsculas) nunca salta o crítico, mesmo repetido', async () => {
  for (const h of ['x', 'x'.repeat(64), 'D'.repeat(64)]) {
    const { run, r } = await criticRuns((n) => ({ head: H(n), diffHash: h, responses: [] }));
    assert.equal(criticCalls(run).length, 3, `diffHash ${h.slice(0, 8)}: ` + why(run));
    assert.equal(r?.won, true, why(run));
  }
});

test('C3 [guarda]: o caminho normal, diffHash diferente a cada ronda, corre um crítico por ronda', async () => {
  const { run, r } = await criticRuns((n) => ({ head: H(n), diffHash: D(n), responses: [] }));
  assert.equal(r?.won, true, why(run));
  assert.deepEqual(criticCalls(run).map((c) => c.opts.label), ['critic:pa:r1', 'critic:pa:r2', 'critic:pa:r3']);
});

test('C3 [guarda]: só conta o diff da ronda anterior: R1 e R3 iguais com a R2 diferente corre o crítico nas 3', async () => {
  const { run, r } = await criticRuns((n) => ({ head: H(n), diffHash: D(n === 3 ? 1 : n), responses: [] }));
  assert.equal(criticCalls(run).length, 3, why(run));
  assert.equal(r?.won, true, why(run));
});

test('C3 [guarda]: os runtimes falsos antigos (sem head nem sha) e o "x" nos dois continuam a ganhar como hoje', async () => {
  for (const [dev, critic] of [[() => ({}), () => ({})], [() => ({ head: 'x', diffHash: 'x' }), () => ({ sha: 'x' })]]) {
    const run = await runWf(srcNow(), baseArgs([p]), scenario(p, { dev, critic }));
    assert.equal(resultOf(run)?.won, true, why(run));
    assert.equal(resultOf(run)?.rounds, 1, why(run));
  }
});