// F-07 critério 3: o gauntlet-attacks lança um crítico por peça, com o modelo e o esforço de models.critic; o prompt aponta para o
// brief da Ronda −1 e para a issue (`gh issue view <issue> --json body,comments`); devolve {id, attacks[], failingOnBase, gaps[]},
// com cada ataque em { id, file, guard?: true, passesOnBase } (respostas 7 e 8 do orquestrador) e o failingOnBase calculado.
// Oráculo: a simulação (runtime falso, sem modelos), com modelos de sonda distintos por papel. Dois modos, uma e três peças.
// Depende do F-06: só o teste «C3 brief» (o caminho e o ficheiro do brief da Ronda −1 vêm do F-06; até lá, o teste exige um
// ficheiro existente em templates/.claude/briefs/ e o ajuste fica para quando o F-06 entrar na main). Os outros não dependem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ATTACKS, MODES, PROBE, contract, baseArgs, runWf, fakeImpl, resultsOf, isCritic, isDev, belongs, atks, normAtks } from './helpers.mjs';

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
      // resposta 7: cada ataque é { id, file, guard?: true }, tal como o crítico o devolveu (a guarda não se perde)
      assert.deepEqual(normAtks(r.attacks), normAtks(atks(p.id)), `${p.id}: attacks ${JSON.stringify(r.attacks)?.slice(0, 200)}`);
      assert.ok(Array.from(r.attacks).every((a) => a && typeof a === 'object' && typeof a.id === 'string' && typeof a.file === 'string'), `${p.id}: um ataque sem id ou file`);
      assert.equal(r.failingOnBase, true, `${p.id}: failingOnBase`);
      assert.ok(Array.isArray(r.gaps), `${p.id}: gaps não é uma lista`);
      assert.deepEqual(Array.from(r.gaps), GAPS[p.id], `${p.id}: gaps`); // Array.from: a lista pode ter sido copiada dentro da vm (outro realm)
    }
  });
}

// Resposta 8: o failingOnBase é calculado pelo workflow a partir do passesOnBase de cada ataque (true se e só se todos os ataques
// sem guard têm passesOnBase false); o booleano do crítico não é aceite. Oráculo: tabela fechada de casos, cada um com o booleano
// do crítico a mentir (o contrário do valor certo) e a dizer a verdade.
const CALC = [
  ['um ataque, falha na base; a guarda passa', ['a1', 'g1'], [], true],
  ['um ataque, já passa na base', ['a1', 'g1'], ['a1'], false],
  ['dois ataques, um já passa', ['a1', 'a2', 'g1'], ['a2'], false],
  ['dois ataques, ambos falham; a guarda passa', ['a1', 'a2', 'g1'], [], true],
  ['dois ataques, ambos falham; a guarda também falha', ['a1', 'a2', 'g1'], [], true, { g1: false }],
  ['sem guarda, ambos já passam', ['a1', 'a2'], ['a1', 'a2'], false],
];
for (const mode of MODES) {
  test(`C3 cálculo (${mode}): o failingOnBase devolvido é o calculado dos passesOnBase sem guard, nunca o booleano do crítico`, async () => {
    const wrong = [];
    for (const [label, list, pass, want, over = {}] of CALC) {
      const a = atks('pa', list, pass).map((x) => (x.id.split('-')[1] in over ? { ...x, passesOnBase: over[x.id.split('-')[1]] } : x));
      for (const claim of [!want, want]) {
        const x = await run([PIECES[0]], mode, { failingOnBase: claim, atksOf: { pa: a } });
        const r = resultsOf(x.out).find((y) => y?.id === 'pa');
        if (!r) wrong.push(`${label} (crítico diz ${claim}): sem resultado; ${String(x.err?.message ?? '')}`);
        else if (r.failingOnBase !== want) wrong.push(`${label} (crítico diz ${claim}): failingOnBase ${r.failingOnBase}, devia ser ${want}`);
        else if (JSON.stringify(normAtks(r.attacks)) !== JSON.stringify(normAtks(a))) wrong.push(`${label}: os ataques (com passesOnBase) não chegam como o crítico os deu`);
      }
    }
    assert.deepEqual(wrong, []);
  });
}

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
