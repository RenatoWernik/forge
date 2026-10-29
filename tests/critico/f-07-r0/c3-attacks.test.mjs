// F-07 critério 3: o gauntlet-attacks lança um crítico por peça, com o modelo e o esforço de models.critic; o prompt aponta para o
// brief da Ronda −1 e para a issue (`gh issue view <issue> --json body,comments`); devolve {id, attacks[], failingOnBase, gaps[]}.
// Oráculo: a simulação (runtime falso, sem modelos), com modelos de sonda distintos por papel. Dois modos, uma e três peças.
// Depende do F-06: só o teste «C3 brief» (o caminho e o ficheiro do brief da Ronda −1 vêm do F-06; até lá, o teste exige um
// ficheiro existente em templates/.claude/briefs/ e o ajuste fica para quando o F-06 entrar na main). Os outros não dependem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ATTACKS, MODES, PROBE, contract, baseArgs, runWf, fakeImpl, resultsOf, isCritic, isDev, belongs } from './helpers.mjs';

const PIECES = [contract('pa', 9101), contract('pb', 9102), contract('pc', 9103)];
const GAPS = { pa: [], pb: ['criterion 2: the oracle does not say which rows count'], pc: ['criterion 1: no command', 'criterion 3: threshold not measured'] };
const run = (pieces = PIECES, mode = 'rigorous', over = {}) => runWf(ATTACKS, baseArgs(pieces, { mode }), fakeImpl({ pieces, gapsOf: GAPS, ...over }));

for (const mode of MODES) {
  test(`C3 (${mode}): um crítico por peça, com o modelo e o esforço de models.critic; nenhum dev é lançado`, async () => {
    const x = await run(PIECES, mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    const crit = x.calls.filter(isCritic);
    assert.equal(crit.length, PIECES.length, `${crit.length} críticos para ${PIECES.length} peças`);
    for (const c of crit) assert.equal(c.opts.effort, PROBE.critic.effort, 'o crítico corre com outro esforço');
    for (const p of PIECES) assert.equal(crit.filter((c) => belongs(c, p)).length, 1, `${p.id}: não há exatamente um crítico a ler a issue ${p.issue}`);
    assert.deepEqual(x.calls.filter(isDev).map((c) => c.opts.model), [], 'a Ronda −1 lançou um dev');
    const others = x.calls.filter((c) => !isCritic(c)).map((c) => `${c.opts.model},${c.opts.effort}`);
    assert.deepEqual(others.filter((m) => m !== `${PROBE.aux.model},${PROBE.aux.effort}`), [], 'agentes com um modelo que não é o do crítico nem o do aux');
  });

  test(`C3 (${mode}): o prompt de cada crítico manda ler a issue da sua peça com «gh issue view <issue> --json body,comments»`, async () => {
    const x = await run(PIECES, mode);
    const crit = x.calls.filter(isCritic);
    assert.equal(crit.length, PIECES.length);
    for (const p of PIECES) {
      const c = crit.find((k) => belongs(k, p));
      assert.ok(c?.prompt.includes(`gh issue view ${p.issue} --json body,comments`), `${p.id}: falta «gh issue view ${p.issue} --json body,comments»`);
      for (const o of PIECES.filter((q) => q !== p)) assert.ok(!c.prompt.includes(`gh issue view ${o.issue}`), `${p.id}: o crítico também recebe a issue de ${o.id}`);
    }
  });

  test(`C3 (${mode}): devolve, por peça, {id, attacks[], failingOnBase, gaps[]} com o que o crítico respondeu`, async () => {
    const x = await run(PIECES, mode);
    const res = resultsOf(x.out);
    assert.equal(res.length, PIECES.length, 'resultados: ' + JSON.stringify(x.out)?.slice(0, 300));
    for (const p of PIECES) {
      const r = res.find((y) => y && y.id === p.id);
      assert.ok(r, `${p.id}: sem resultado`);
      assert.ok(Array.isArray(r.attacks) && r.attacks.length > 0, `${p.id}: attacks não é uma lista com os ataques`);
      assert.equal(r.failingOnBase, true, `${p.id}: failingOnBase`);
      assert.ok(Array.isArray(r.gaps), `${p.id}: gaps não é uma lista`);
      assert.deepEqual(Array.from(r.gaps), GAPS[p.id], `${p.id}: gaps`); // Array.from: a lista pode ter sido copiada dentro da vm (outro realm)
    }
  });
}

test('C3: o failingOnBase devolvido é o do crítico (false também chega ao orquestrador)', async () => {
  const x = await run([PIECES[0]], 'rigorous', { failingOnBase: false });
  const r = resultsOf(x.out).find((y) => y?.id === 'pa');
  assert.ok(r, 'sem resultado: ' + JSON.stringify(x.out)?.slice(0, 300));
  assert.equal(r.failingOnBase, false);
});

test('C3: com uma só peça, um só crítico; com a mesma entrada, as mesmas chamadas (retoma)', async () => {
  const [a, b] = [await run([PIECES[1]]), await run([PIECES[1]])];
  assert.equal(a.calls.filter(isCritic).length, 1);
  assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
});

test('C3 brief (depende do F-06): o prompt de cada crítico aponta para o brief da Ronda −1, um ficheiro que o pacote gera em .claude/briefs/', async () => {
  const x = await run(PIECES);
  const crit = x.calls.filter(isCritic);
  assert.equal(crit.length, PIECES.length);
  const paths = crit.map((c) => (c.prompt.match(/\.claude\/briefs\/[\w.-]+\.md/) || [])[0]);
  assert.ok(paths.every(Boolean), 'há um crítico sem caminho .claude/briefs/<brief>.md no prompt');
  assert.equal(new Set(paths).size, 1, 'os críticos apontam para briefs diferentes: ' + paths.join(', '));
  assert.ok(existsSync(join(ROOT, 'templates', paths[0])), `o brief ${paths[0]} não existe em templates/`);
});
