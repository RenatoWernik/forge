// F-08, critério 6: as linhas do loop sem limite foram substituídas, e o `gauntlet-ponytail` usa `models.developer` e
// `models.critic` e aponta para os briefs. Oráculo: a mutação «limite de rondas subido para 4 no rigoroso» faz falhar a linha
// `build: rounds`, e todo o corpus acaba em «All ok.» (este último corre em `node --test scripts/corpus.test.mjs`, na regressão).
// Aqui a mutação do corpus é ligada ao comportamento: aplicada ao projeto gerado, o workflow mutado corre MESMO uma 4.ª ronda no
// runtime falso (não basta partir o ficheiro), e o check.cjs desse projeto falha a linha `build: rounds`.
// Depende do F-07: sim nos testes que correm o gauntlet-build (args com o contrato e `args.attacks`); não nos do ponytail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { BUILD, PONY, PROBE, contract, baseArgs, runWf, scenario, resultOf, devCount, roleOf, why, fail, generate, check, linesOf, fails, mutations, corpusAnswers, replaceIn, briefsIn, declared, fillSchema } from './helpers.mjs';

const ROUNDS_LINE = /^build: rounds\b/;
const plan4 = { pa: [fail(1), fail(2), fail(3), fail(4)] };

for (const mode of ['rigorous', 'accelerated']) {
  test(`C6 (${mode}): no check.cjs de um projeto gerado, as linhas do loop sem limite saíram e a linha «build: rounds» existe e passa`, async () => {
    const dest = await generate({ ...corpusAnswers('en-plain-published'), mode });
    const r = check(dest);
    const ls = linesOf(r.out);
    assert.ok(ls.length > 20, 'o check.cjs não correu: ' + r.out.slice(-800));
    // só as linhas do build: o gauntlet-ponytail mantém o seu loop (spec #1: «mantém-se, com os papéis e o brief novos»)
    assert.deepEqual(ls.filter((l) => l.text.startsWith('build:') && /wins in round \d+|"?stuck"? question|escalateAfter|no exit by number of rounds/i.test(l.text)).map((l) => l.text), [], 'linhas antigas do loop sem limite');
    const rounds = ls.filter((l) => ROUNDS_LINE.test(l.text));
    assert.ok(rounds.length >= 1, 'não há linha «build: rounds…»: ' + fails(r.out));
    assert.ok(rounds.every((l) => l.state === 'ok'), 'a linha «build: rounds» falha sem mutação: ' + JSON.stringify(rounds));
  });
}

test('C6: o gauntlet-build não tem pergunta «stuck» à ronda N: com escalateAfter 1 e 3 rondas a reprovar, nenhum agente recebe a nota', async () => {
  const p = contract('pa', 9101);
  const run = await runWf(BUILD, baseArgs([p], { escalateAfter: 1 }), scenario([p], { pa: [fail(1), fail(2), fail(3)] }));
  assert.ok(run.calls.length > 3, 'o workflow não correu: ' + why(run, p.id));
  assert.deepEqual(run.calls.filter((c) => /-stuck|not winning for/i.test(c.prompt)).map((c) => c.opts.label), []);
});

test('C6: há no corpus a mutação «limite de rondas subido para 4 no rigoroso», no gauntlet-build.js, com a linha «build: rounds…»', () => {
  const ms = mutations().filter((m) => ROUNDS_LINE.test(m.line || '') && m.file === '.claude/workflows/gauntlet-build.js');
  assert.ok(ms.length >= 1, 'mutações: ' + JSON.stringify(mutations().map((m) => [m.name, m.line])));
});

test('C6: a mutação do corpus põe MESMO o rigoroso a correr 4 rondas (runtime falso) e o check.cjs falha a linha «build: rounds»', async () => {
  const ms = mutations().filter((m) => ROUNDS_LINE.test(m.line || '') && m.file === '.claude/workflows/gauntlet-build.js');
  assert.ok(ms.length >= 1, 'sem a mutação');
  const p = contract('pa', 9101);
  for (const m of ms) {
    const dest = await generate(corpusAnswers(m.base));
    const dir = join(dest, '.claude/workflows');
    const before = await runWf(BUILD, baseArgs([p]), scenario([p], plan4), { dir });
    assert.equal(devCount(before, p), 3, `${m.name}: sem mutação, o rigoroso para na ronda 3: ${why(before, p.id)}`);
    const pre = linesOf(check(dest).out).filter((l) => l.text === m.line);
    assert.ok(pre.length === 1 && pre[0].state === 'ok', `${m.name}: a linha «${m.line}» tem de existir e passar sem mutação: ${JSON.stringify(pre)}`);
    assert.ok(replaceIn(join(dest, m.file), m.find, m.replace), `${m.name}: o texto a procurar não existe`);
    const after = await runWf(BUILD, baseArgs([p]), scenario([p], plan4), { dir });
    assert.equal(devCount(after, p), 4, `${m.name}: com a mutação, o rigoroso tem de correr a ronda 4: ${why(after, p.id)}`);
    const post = check(dest);
    assert.equal(post.status, 1, `${m.name}: o check.cjs não saiu com 1`);
    assert.ok(linesOf(post.out).some((l) => l.state === 'FAIL' && l.text === m.line), `${m.name}: a linha «${m.line}» não falhou: ${fails(post.out)}`);
  }
});

// gauntlet-ponytail: papéis e brief novos
const units = [{ id: 'u1', title: 'U1', paths: ['src/a.js'] }];
const ponyImpl = (prompt, opts) => {
  const role = roleOf(opts);
  if (role === 'critic') {
    const cur = /^A: .*\.gauntlet/m.test(prompt) ? 'B' : 'A';
    return fillSchema(opts.schema, (k, s, depth) => (depth !== 1 ? undefined : /^model$/.test(k) ? declared(PROBE.critic) : /winner/.test(k) ? cur : s.type === 'boolean' ? true : s.type === 'array' ? [] : /gap/i.test(k) ? 'none' : undefined));
  }
  if (role === 'developer' || role === 'developerUi') return fillSchema(opts.schema, (k, s, depth) => (depth !== 1 ? undefined : /^model$/.test(k) ? declared(PROBE[role]) : /^cuts$|^kept$/.test(k) ? ['CUT'] : /lines/i.test(k) ? 5 : /summary|reason|narrativ/i.test(k) && s.type === 'string' ? 'DEV-NARRATIVE-pony' : undefined));
  return 'ok';
};
const ponyRun = () => runWf(PONY, { ...baseArgs([]), testCommand: 'SUITE-CMD', units }, ponyImpl);

test('C6: o gauntlet-ponytail corre o dev com models.developer (nunca o developerUi) e o crítico com models.critic', async () => {
  const run = await ponyRun();
  const devs = run.calls.filter((c) => /^developer/.test(roleOf(c.opts) || '')), crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
  assert.ok(devs.length >= 1 && crit.length >= 1, 'o ponytail não lançou dev e crítico: ' + (run.err?.message || ''));
  assert.ok(devs.every((c) => roleOf(c.opts) === 'developer'), 'dev do ponytail fora de models.developer');
  assert.ok(run.calls.every((c) => roleOf(c.opts)), 'agente com modelo fora de args.models');
});

test('C6: o gauntlet-ponytail aponta o dev para o brief do dev e o crítico para o brief do crítico (.claude/briefs/<papel>.md)', async () => {
  const run = await ponyRun();
  const devs = run.calls.filter((c) => roleOf(c.opts) === 'developer'), crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
  assert.ok(devs.length >= 1 && crit.length >= 1, 'o ponytail não lançou dev e crítico: ' + (run.err?.message || ''));
  for (const c of devs) assert.ok(briefsIn(c.prompt).includes('dev'), 'o prompt do dev do ponytail não aponta para o brief do dev: ' + c.prompt.slice(0, 300));
  for (const c of crit) assert.ok(briefsIn(c.prompt).includes('critic'), 'o prompt do crítico do ponytail não aponta para o brief do crítico: ' + c.prompt.slice(0, 300));
});
