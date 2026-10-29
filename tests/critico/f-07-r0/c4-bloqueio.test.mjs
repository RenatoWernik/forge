// F-07 critério 4: uma peça cujo resultado da Ronda −1 tem gaps não vazias, ou que não tem resultado da Ronda −1, não chega ao dev
// no gauntlet-build: este devolve {id, blocked:"gaps"} sem lançar o dev. Resposta 7 do orquestrador: blocked passa a { reason, ... };
// as lacunas e a falta de resultado dão blocked.reason = "gaps" (o critério 4 chama-lhes ambas «gaps»).
// F-07 critério 5: na simulação de um checkpoint, o primeiro agent() de dev de cada peça vem depois do agent() da Ronda −1 dela.
// Oráculo: a simulação (runtime falso), com os modelos de sonda (o dev reconhece-se pelo modelo, não pela etiqueta) e a ordem das
// chamadas num registo partilhado pelos dois workflows. Resposta 2 do orquestrador: o resultado da Ronda −1 entra em args.attacks,
// a lista `results` do gauntlet-attacks tal como está. Respostas 5, 7 e 8: o failingOnBase calculado dos passesOnBase também bloqueia (testes C4+ e C5+).
// Depende do F-06: não.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACKS, BUILD, MODES, contract, baseArgs, comR0, r0, atk, atks, runWf, fakeImpl, resultsOf, isCritic, isDev, belongs } from './helpers.mjs';

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
    test(`C4 (${mode}) ${label}: o build devolve {id:"pa", blocked:{reason:"gaps"}} e não lança o dev`, async () => {
      const x = await build([pa], results, mode);
      assert.ok(!x.err, String(x.err?.message ?? x.err));
      assert.deepEqual(x.calls.filter(isDev).map((c) => c.opts.model), [], 'o dev foi lançado');
      assert.equal(blocked(x, 'pa')?.blocked?.reason, 'gaps', 'retorno: ' + JSON.stringify(x.out)?.slice(0, 300));
    });
  }

  test(`C4 (${mode}) controlo: com a Ronda −1 sem lacunas, o dev é lançado e a peça não fica bloqueada`, async () => {
    const x = await build([pa], [r0('pa')], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    assert.ok(x.calls.filter(isDev).length > 0, 'o dev não foi lançado');
    assert.ok(!blocked(x, 'pa')?.blocked, 'pa ficou bloqueada');
  });

  test(`C4 (${mode}) duas peças: a sem lacunas chega ao dev, a com lacunas fica bloqueada e nenhum dev a recebe`, async () => {
    const x = await build([pa, pb], [r0('pa'), r0('pb', ['criterion 1: no oracle for "all"'])], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    const devs = x.calls.filter(isDev);
    assert.ok(devs.some((c) => belongs(c, pa)), 'pa não chegou ao dev');
    assert.deepEqual(devs.filter((c) => belongs(c, pb)).map((c) => c.opts.model), [], 'pb chegou ao dev');
    assert.equal(blocked(x, 'pb')?.blocked?.reason, 'gaps');
    assert.ok(!blocked(x, 'pa')?.blocked, 'pa ficou bloqueada');
  });
}

// Respostas 5, 7 e 8 do orquestrador. Cada ataque traz passesOnBase (do crítico que o correu na base). Uma peça com um ataque sem
// guard que já passa na base fica bloqueada com blocked = { reason: "failingOnBase", attacks: [os ids sem guard com passesOnBase
// true] }, sem dev; um ataque sem guard e sem passesOnBase dá blocked { reason: "gaps" }. As guardas não contam, passem ou não.
// O failingOnBase dos resultados é coerente com os ataques (como o gauntlet-attacks o calcula); o C5+ junta os dois workflows.
const fob = (list, pass, over = {}) => (id) => r0(id, [], { attacks: atks(id, list, pass), failingOnBase: !atks(id, list, pass).some((a) => !a.guard && a.passesOnBase), ...over });
const reason = (x, id) => blocked(x, id)?.blocked?.reason;
const ids = (x, id) => { const a = blocked(x, id)?.blocked?.attacks; return Array.isArray(a) ? Array.from(a).sort() : a; };
const FOB = [
  ['um ataque já passa', ['a1', 'g1'], ['a1'], ['pa-a1']],
  ['dois de três já passam; a guarda também', ['a1', 'a2', 'a3', 'g1'], ['a1', 'a3', 'g1'], ['pa-a1', 'pa-a3']],
  ['sem guarda, todos já passam', ['a1', 'a2'], ['a1', 'a2'], ['pa-a1', 'pa-a2']],
];
for (const mode of MODES) {
  for (const [label, list, pass, want] of FOB) {
    test(`C4+ (${mode}) ${label}: o build não lança o dev e devolve blocked {reason:"failingOnBase", attacks:${JSON.stringify(want)}}`, async () => {
      const x = await build([pa], [fob(list, pass)('pa')], mode);
      assert.ok(!x.err, String(x.err?.message ?? x.err));
      assert.deepEqual(x.calls.filter(isDev).map((c) => c.opts.model), [], 'o dev foi lançado');
      assert.equal(reason(x, 'pa'), 'failingOnBase', 'retorno: ' + JSON.stringify(x.out)?.slice(0, 300));
      assert.deepEqual(ids(x, 'pa'), want);
    });
  }

  test(`C4+ (${mode}) controlo: as guardas não contam; com os ataques sem guard a falhar na base, a peça chega ao dev (guarda a passar ou a falhar)`, async () => {
    for (const p of [fob(['a1', 'a2', 'g1'], ['g1']), fob(['a1', 'g1', 'g2'], ['g2'])]) {
      const x = await build([pa], [p('pa')], mode);
      assert.ok(!x.err, String(x.err?.message ?? x.err));
      assert.ok(x.calls.filter(isDev).some((c) => belongs(c, pa)), 'pa não chegou ao dev');
      assert.ok(!blocked(x, 'pa')?.blocked, 'pa ficou bloqueada: ' + JSON.stringify(blocked(x, 'pa')));
    }
  });

  test(`C4+ (${mode}) campo em falta: um ataque sem guard e sem passesOnBase dá blocked {reason:"gaps"} sem dev`, async () => {
    for (const k of ['a1', 'a2']) {
      const r = fob(['a1', 'a2', 'g1'], [])('pa');
      r.attacks = r.attacks.map((a) => (a.id === `pa-${k}` ? (({ passesOnBase, ...rest }) => rest)(a) : a));
      const x = await build([pa], [r], mode);
      assert.ok(!x.err, String(x.err?.message ?? x.err));
      assert.deepEqual(x.calls.filter(isDev).map((c) => c.opts.model), [], `${k} sem passesOnBase: o dev foi lançado`);
      assert.equal(reason(x, 'pa'), 'gaps', `${k} sem passesOnBase: ` + JSON.stringify(x.out)?.slice(0, 300));
    }
  });

  test(`C4+ (${mode}) duas peças: a com um ataque que já passa fica bloqueada e a outra chega ao dev`, async () => {
    const x = await build([pa, pb], [r0('pa'), fob(['a1', 'g1'], ['a1'])('pb')], mode);
    assert.ok(!x.err, String(x.err?.message ?? x.err));
    const devs = x.calls.filter(isDev);
    assert.ok(devs.some((c) => belongs(c, pa)), 'pa não chegou ao dev');
    assert.deepEqual(devs.filter((c) => belongs(c, pb)).map((c) => c.opts.model), [], 'pb chegou ao dev');
    assert.equal(reason(x, 'pb'), 'failingOnBase');
    assert.deepEqual(ids(x, 'pb'), ['pb-a1']);
    assert.ok(!blocked(x, 'pa')?.blocked, 'pa ficou bloqueada');
  });
}

test('C5+ checkpoint simulado: o crítico da Ronda −1 diz failingOnBase:true mas um ataque sem guard já passa; o attacks calcula false e o build bloqueia essa peça com os ids; a outra chega ao dev', async () => {
  const pieces = [pa, pb];
  const atksOf = { pa: atks('pa'), pb: atks('pb', ['a1', 'a2', 'g1'], ['a2']) };
  const att = await runWf(ATTACKS, baseArgs(pieces), fakeImpl({ pieces, failingOnBase: true, atksOf }));
  assert.ok(!att.err, String(att.err?.message ?? att.err));
  const bld = await runWf(BUILD, comR0(baseArgs(pieces), resultsOf(att.out)), fakeImpl({ pieces }));
  assert.ok(!bld.err, String(bld.err?.message ?? bld.err));
  const devs = bld.calls.filter(isDev);
  assert.ok(devs.some((c) => belongs(c, pa)), 'pa não chegou ao dev');
  assert.deepEqual(devs.filter((c) => belongs(c, pb)).map((c) => c.opts.model), [], 'pb chegou ao dev');
  assert.equal(reason(bld, 'pb'), 'failingOnBase', JSON.stringify(blocked(bld, 'pb')));
  assert.deepEqual(ids(bld, 'pb'), ['pb-a2']);
});

test('C5+ checkpoint simulado: o crítico devolve um ataque sem guard e sem passesOnBase; passado ao build, essa peça fica {reason:"gaps"} sem dev', async () => {
  const pieces = [pa];
  const atksOf = { pa: [{ id: 'pa-a1', file: 'tests/critico/pa-r0/a1.test.mjs' }, atk('pa', 'g1')] };
  const att = await runWf(ATTACKS, baseArgs(pieces), fakeImpl({ pieces, atksOf }));
  assert.ok(!att.err, String(att.err?.message ?? att.err));
  const bld = await runWf(BUILD, comR0(baseArgs(pieces), resultsOf(att.out)), fakeImpl({ pieces }));
  assert.ok(!bld.err, String(bld.err?.message ?? bld.err));
  assert.deepEqual(bld.calls.filter(isDev).map((c) => c.opts.model), [], 'o dev foi lançado');
  assert.equal(reason(bld, 'pa'), 'gaps', JSON.stringify(bld.out)?.slice(0, 300));
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
  assert.equal(blocked(bld, 'pb')?.blocked?.reason, 'gaps');
});
