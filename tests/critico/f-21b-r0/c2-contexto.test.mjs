// F-21b, C2: contexto por peça (decisão B3). Oráculos do corpo da #74:
// - `args.graph` é opcional e, quando existe, é um caminho absoluto de graph.json (Windows `X:\` ou `X:/`, ou POSIX `/`); um relativo é
//   recusado como `incomplete args`, com 0 agentes;
// - com `args.graph`, cada peça do build e do attacks e cada `unit` do ponytail precisa de `affected: {nodes: [strings], files: [strings]}`
//   (listas vazias valem); sem ele, a recusa é `incomplete args: ... piece <id>, affected: ...`, com 0 agentes;
// - os 5 prompts (dev e crítico do build, crítico da Ronda −1, dev e crítico do ponytail) têm `--graph "<args.graph>"` e os nodes e files
//   da peça; sem `args.graph` dizem `No graph for this run.`, nada é recusado e a regra 1 do dev deixa de depender de graphify-out/ existir.
// Leitura: no ponytail a «peça» é a unit; a recusa aceita `piece <id>` ou `unit <id>` antes de `, affected:`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcNow, runWf, fake, why, labeled, refused, errText, buildArgs, attacksArgs, ponyArgs, piece, unit, aff, ROLE_RE, GRAPHS, RELATIVE, GRAPH_FLAG, NO_GRAPH } from './helpers.mjs';

// Cada workflow com duas peças (uma com listas vazias) e, no build e no ponytail, várias rondas
const W = {
  build: { src: 'build', mk: (ps, o) => buildArgs(ps, o), item: piece, f: { winAt: 2 }, roles: ['dev', 'critic'] },
  attacks: { src: 'attacks', mk: (ps, o) => attacksArgs(ps, o), item: piece, f: {}, roles: ['attacks'] },
  ponytail: { src: 'ponytail', mk: (us, o) => ponyArgs(us, o), item: unit, f: { ponyWinAt: 2 }, roles: ['pony', 'ponyCritic'] },
};
const EMPTY = { nodes: [], files: [] };
const items = (w) => [w.item('pa', { affected: aff('pa') }), w.item('pb', { affected: EMPTY })];
const of = (prompt, id) => new RegExp(`(?:build|critic|attacks|pony|pony-critic):${id}(?::|$)`);

for (const [name, w] of Object.entries(W)) {
  test(`C2 [ataque] (${name}): com args.graph absoluto (POSIX, X:\\ e X:/), os prompts têm --graph "<args.graph>" e os nodes e files da peça`, async () => {
    for (const g of GRAPHS) {
      const run = await runWf(srcNow(w.src), w.mk(items(w), { graph: g }), fake(w.f));
      assert.equal(run.err, undefined, `graph ${g}: ` + why(run));
      for (const role of w.roles) {
        for (const id of ['pa', 'pb']) {
          const calls = labeled(run, ROLE_RE[role]).filter((c) => of(c.prompt, id).test(c.opts.label));
          assert.ok(calls.length >= 1, `${role} ${id}: sem chamada; ` + why(run));
          for (const c of calls) {
            assert.ok(c.prompt.includes(GRAPH_FLAG(g)), `${c.opts.label}: falta ${GRAPH_FLAG(g)}`);
            for (const t of id === 'pa' ? [...aff('pa').nodes, ...aff('pa').files] : []) assert.ok(c.prompt.includes(t), `${c.opts.label}: falta «${t}» do affected`);
          }
        }
      }
    }
  });

  test(`C2 [ataque] (${name}): com args.graph, uma peça sem affected válido é recusada antes de qualquer agente, com «incomplete args: ... piece <id>, affected: ...»`, async () => {
    const BAD = [undefined, null, 'lib/a.mjs', [], {}, { nodes: [] }, { files: [] }, { nodes: 'NODE', files: [] }, { nodes: [], files: 'lib/a.mjs' }, { nodes: [1], files: [] }, { nodes: [], files: [null] }, { nodes: [{ id: 'n' }], files: [] }, { nodes: {}, files: [] }];
    for (const [i, bad] of BAD.entries()) {
      const second = w.item('pb'); if (bad !== undefined) second.affected = bad;
      const run = await runWf(srcNow(w.src), w.mk([w.item('pa', { affected: aff('pa') }), second], { graph: GRAPHS[0] }), fake(w.f));
      assert.ok(refused(run), `caso ${i} (${JSON.stringify(bad)}): não recusou, ${run.calls.length} agentes; ${why(run)}`);
      assert.match(errText(run), /incomplete args/, `caso ${i}: ` + errText(run).slice(0, 300));
      assert.match(errText(run), new RegExp(`(piece|unit) pb, affected: `), `caso ${i}: a recusa não nomeia a peça pb e o campo affected: ` + errText(run).slice(0, 300));
      assert.doesNotMatch(errText(run), /(piece|unit) pa, affected: /, `caso ${i}: a peça pa, válida, foi apontada`);
    }
  });

  test(`C2 [ataque] (${name}): um args.graph relativo é recusado como incomplete args, com 0 agentes`, async () => {
    for (const g of RELATIVE) {
      const run = await runWf(srcNow(w.src), w.mk(items(w), { graph: g }), fake(w.f));
      assert.ok(refused(run), `graph ${JSON.stringify(g)}: não recusou, ${run.calls.length} agentes; ${why(run)}`);
      assert.match(errText(run), /incomplete args/, `graph ${JSON.stringify(g)}: ` + errText(run).slice(0, 300));
    }
  });

  test(`C2 [ataque] (${name}): sem args.graph, os prompts dizem «No graph for this run.»`, async () => {
    const run = await runWf(srcNow(w.src), w.mk([w.item('pa'), w.item('pb')]), fake(w.f));
    assert.equal(run.err, undefined, why(run));
    for (const role of w.roles) {
      const calls = labeled(run, ROLE_RE[role]);
      assert.ok(calls.length >= 2, `${role}: sem chamadas; ` + why(run));
      for (const c of calls) assert.ok(c.prompt.includes(NO_GRAPH), `${c.opts.label}: falta «${NO_GRAPH}»`);
    }
  });

  test(`C2 [guarda] (${name}): sem args.graph nada é recusado: peças sem affected, com affected válido ou com affected inválido correm`, async () => {
    for (const a of [undefined, aff('pa'), EMPTY, 'lixo', { nodes: [1] }]) {
      const it = w.item('pa'); if (a !== undefined) it.affected = a;
      const run = await runWf(srcNow(w.src), w.mk([it]), fake(w.f));
      assert.equal(run.err, undefined, `affected ${JSON.stringify(a)}: ` + why(run));
      assert.ok(run.calls.length >= 2, `affected ${JSON.stringify(a)}: ` + why(run));
    }
  });
}

test('C2 [ataque] (build): a regra 1 do dev deixa de depender de graphify-out/ existir no cwd (com e sem args.graph)', async () => {
  for (const o of [{}, { graph: GRAPHS[1] }]) {
    const run = await runWf(srcNow('build'), buildArgs([piece('pa', { affected: aff('pa') })], o), fake());
    const devs = labeled(run, ROLE_RE.dev);
    assert.ok(devs.length >= 1, why(run));
    for (const d of devs) assert.doesNotMatch(d.prompt, /graphify-out\/?\s+(exists|is present)/i, `${JSON.stringify(o)}: a regra 1 ainda depende de graphify-out/ existir`);
  }
});