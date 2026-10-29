// F-07 critério 4: uma peça cujo resultado da Ronda −1 tem gaps não vazias, ou que não tem resultado da Ronda −1, não chega ao dev
// no gauntlet-build: este devolve {id, blocked:"gaps"} sem lançar o dev.
// F-07 critério 5: na simulação de um checkpoint, o primeiro agent() de dev de cada peça vem depois do agent() da Ronda −1 dela.
// Oráculo: a simulação (runtime falso), com os modelos de sonda (o dev reconhece-se pelo modelo, não pela etiqueta) e a ordem das
// chamadas num registo partilhado pelos dois workflows. Resposta 2 do orquestrador: o resultado da Ronda −1 entra em args.attacks,
// a lista `results` do gauntlet-attacks tal como está. Resposta 5: failingOnBase:false também bloqueia (testes C4+ e C5+).
// Depende do F-06: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACKS, BUILD, MODES, contract, baseArgs, comR0, r0, runWf, fakeImpl, resultsOf, isCritic, isDev, belongs } from './helpers.mjs';

const pa = contract('pa', 9101), pb = contract('pb', 9102);
const build = (pieces, results, mode = 'rigorous') => {
  const a = baseArgs(pieces, { mode });
  return runWf(BUILD, results === undefined ? a : comR0(a, results), fakeImpl({ pieces }));
};
const blocked = (x, id) => resultsOf(x.out).find((r) => r && r.id === id);

const CASES = [
  ['gaps não vazias', [r0('pa', ['criterion 2: the oracle does not cover empty files'])]],
  ['duas lacunas', [r0('pa', ['a', 'b'])]],
  ['sem resultado da Ronda −1 (args.attacks ausente)', undefined],
  ['args.attacks vazio', []],
  ['só há resultado de outra peça', [r0('zz')]],
];

for (const mode of MODES) {
  for (const [label, results] of CASES) {
    test(`C4 (${mode}) ${label}: o build devolve {id:"pa", blocked:"gaps"} e não lança o dev`, async () => {
      const x = await build([pa], results, mode);
      assert.ok(!x.err, String(x.err?.message ?? x.err));
      assert.deepEqual(x.calls.filter(isDev).map((c) => c.opts.model), [], 'o dev foi lançado');
      assert.equal(blocked(x, 'pa')?.blocked, 'gaps', 'retorno: ' + JSON.stringify(x.out)?.slice(0, 300));
    });
  }

  test(`C4 (${mode}) controlo: com a Ronda −1 sem lacunas, o dev é lançado e a peça não fica bloqueada`, async () => {
    const x = await build([pa], [r0('pa')], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    assert.ok(x.calls.filter(isDev).length > 0, 'o dev não foi lançado');
    assert.notEqual(blocked(x, 'pa')?.blocked, 'gaps');
  });

  test(`C4 (${mode}) duas peças: a sem lacunas chega ao dev, a com lacunas fica bloqueada e nenhum dev a recebe`, async () => {
    const x = await build([pa, pb], [r0('pa'), r0('pb', ['criterion 1: no oracle for "all"'])], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    const devs = x.calls.filter(isDev);
    assert.ok(devs.some((c) => belongs(c, pa)), 'pa não chegou ao dev');
    assert.deepEqual(devs.filter((c) => belongs(c, pb)).map((c) => c.opts.model), [], 'pb chegou ao dev');
    assert.equal(blocked(x, 'pb')?.blocked, 'gaps');
    assert.notEqual(blocked(x, 'pa')?.blocked, 'gaps');
  });
}

// Resposta 5 do orquestrador: um resultado da Ronda −1 com failingOnBase:false (há um ataque que não é guarda e já passa na base)
// bloqueia a peça como as lacunas. O valor exato de `blocked` não está fixado (PERGUNTA 7): exige-se só um `blocked` verdadeiro.
for (const mode of MODES) {
  test(`C4+ (${mode}) failingOnBase:false, sem lacunas: o build não lança o dev e devolve a peça bloqueada`, async () => {
    const x = await build([pa], [r0('pa', [], { failingOnBase: false })], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    assert.deepEqual(x.calls.filter(isDev).map((c) => c.opts.model), [], 'o dev foi lançado');
    assert.ok(blocked(x, 'pa')?.blocked, 'retorno: ' + JSON.stringify(x.out)?.slice(0, 300));
  });

  test(`C4+ (${mode}) duas peças: a com failingOnBase:false fica bloqueada e a outra chega ao dev`, async () => {
    const x = await build([pa, pb], [r0('pa'), r0('pb', [], { failingOnBase: false })], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    const devs = x.calls.filter(isDev);
    assert.ok(devs.some((c) => belongs(c, pa)), 'pa não chegou ao dev');
    assert.deepEqual(devs.filter((c) => belongs(c, pb)).map((c) => c.opts.model), [], 'pb chegou ao dev');
    assert.ok(blocked(x, 'pb')?.blocked, 'pb não ficou bloqueada');
    assert.ok(!blocked(x, 'pa')?.blocked, 'pa ficou bloqueada');
  });
}

test('C5+ checkpoint simulado: o crítico da Ronda −1 diz failingOnBase:false para uma peça; passado tal como está ao build, essa peça não chega ao dev', async () => {
  const pieces = [pa, pb];
  const att = await runWf(ATTACKS, baseArgs(pieces), fakeImpl({ pieces, failingOnBase: false }));
  assert.ok(!att.err, String(att.err?.message ?? att.err));
  const bld = await runWf(BUILD, comR0(baseArgs(pieces), resultsOf(att.out)), fakeImpl({ pieces }));
  assert.ok(!bld.err, String(bld.err?.message ?? bld.err));
  assert.deepEqual(bld.calls.filter(isDev).map((c) => c.opts.model), [], 'um dev foi lançado');
  for (const p of pieces) assert.ok(blocked(bld, p.id)?.blocked, `${p.id} não ficou bloqueada`);
});

test('C5 checkpoint simulado: a saída do gauntlet-attacks, passada tal como está ao gauntlet-build, leva ao dev só as peças sem lacunas, e o 1.º dev de cada peça vem depois do crítico da Ronda −1 dela', async () => {
  const pieces = [pa, pb, contract('pc', 9103)];
  const log = [];
  const impl = fakeImpl({ pieces, gapsOf: { pa: [], pb: ['criterion 2: gap'], pc: [] } });
  const att = await runWf(ATTACKS, baseArgs(pieces), impl, { log });
  assert.ok(!att.err, String(att.err?.message ?? att.err));
  const bld = await runWf(BUILD, comR0(baseArgs(pieces), resultsOf(att.out)), impl, { log });
  assert.ok(!bld.err, String(bld.err?.message ?? bld.err));
  for (const p of pieces) {
    const r0i = log.findIndex((c) => c.file === ATTACKS && isCritic(c) && belongs(c, p));
    const devi = log.findIndex((c) => isDev(c) && belongs(c, p));
    assert.ok(r0i >= 0, `${p.id}: sem crítico da Ronda −1`);
    if (p.id === 'pb') assert.equal(devi, -1, 'pb (com lacunas) chegou ao dev');
    else assert.ok(devi > r0i, `${p.id}: o 1.º dev (${devi}) não vem depois da Ronda −1 (${r0i})`);
  }
  assert.equal(blocked(bld, 'pb')?.blocked, 'gaps');
});
