// F-18 critérios 4 e 5 (#62.1, #62.2 e #62.3) no gauntlet-batch.js, com os helpers do lote do F-16.
// Oráculos:
//   - C4 (ATAQUE): com 2 blocos, nos dois modos, `<testCommand> tests/unit` com um destes caracteres no fim ou no início (U+00A0, U+2028,
//     U+FEFF, \r, \n) dá batch.verdict 'fail' com reason 'runs': 10 formas por modo;
//   - C5 barra no fim (ATAQUE): um ficheiro com barra no fim (`tests/unit/a.test.mjs/`) dá fail/runs;
//   - C5 entradas ignoradas (ATAQUE): projectFiles ['../x/a.test.mjs', 'tests/unit/a.test.mjs'] com o bloco `<testCommand> ..` dá
//     fail/runs; ['C:/x/a.test.mjs', 'tests/unit/a.test.mjs'] com o bloco `<testCommand> C:/x/a.test.mjs` dá fail/runs. Mais um caso da
//     mesma regra escrita (um segmento `..` a meio do caminho);
//   - C5 GUARDA: `tests/unit/` (pasta) e `./tests/unit/a.test.mjs` continuam válidos; com uma entrada ignorada na lista, as outras contam.
// Os caminhos hostis só entram nos args (projectFiles), nunca no disco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CMD, MODES, lote, partido, E2E3, verdictOf, reasonOf, show, PONTAS } from './helpers.mjs';

const falha = (r, msg) => { assert.equal(verdictOf(r), 'fail', msg + ' ' + show(r)); assert.equal(reasonOf(r), 'runs', msg + ' ' + show(r)); };
const passa = (r, msg) => { assert.equal(verdictOf(r), 'pass', msg + ' ' + show(r)); assert.equal(r.out.runs.suite, 2, show(r)); };
const suite = (blocks, over) => lote([...partido('suite', blocks, 2), ...E2E3()], over);

for (const mode of MODES) {
  test(`C4 [${mode}] <testCommand> tests/unit com NBSP, LS, BOM, CR ou LF no fim ou no início: fail com reason runs (10 formas)`, async () => {
    const bad = [];
    for (const [nome, ch] of PONTAS) {
      for (const [onde, bloco] of [['fim', `${CMD.test} tests/unit${ch}`], ['início', `${ch}${CMD.test} tests/unit`]]) {
        const r = await suite([bloco, `${CMD.test} tests/integ`], { mode });
        if (verdictOf(r) !== 'fail' || reasonOf(r) !== 'runs') bad.push(`${nome} no ${onde}: ${verdictOf(r)}/${reasonOf(r)}, runs.suite ${r.out?.runs?.suite}`);
      }
    }
    assert.deepEqual(bad, [], `${bad.length} de 10 formas contaram como bloco válido`);
  });
}

for (const mode of MODES) {
  test(`C5 [${mode}] barra no fim de um ficheiro (tests/unit/a.test.mjs/): fail com reason runs`, async () => {
    falha(await suite([`${CMD.test} tests/unit/a.test.mjs/`, `${CMD.test} tests/integ`], { mode }), 'tests/unit/a.test.mjs/');
  });

  for (const [nome, files, bloco] of [
    ['../x/a.test.mjs e o bloco ..', ['../x/a.test.mjs', 'tests/unit/a.test.mjs'], `${CMD.test} ..`],
    ['C:/x/a.test.mjs e o bloco C:/x/a.test.mjs', ['C:/x/a.test.mjs', 'tests/unit/a.test.mjs'], `${CMD.test} C:/x/a.test.mjs`],
    ['tests/../x/a.test.mjs (segmento .. a meio) e o bloco com esse ficheiro', ['tests/../x/a.test.mjs', 'tests/unit/a.test.mjs'], `${CMD.test} tests/../x/a.test.mjs`],
  ]) {
    test(`C5 [${mode}] entrada ignorada do projectFiles (${nome}): fail com reason runs`, async () => {
      falha(await suite([bloco, `${CMD.test} tests/unit`], { mode, projectFiles: files }), nome);
    });
  }

  test(`C5 GUARDA [${mode}] tests/unit/ (pasta) e ./tests/unit/a.test.mjs continuam válidos: pass`, async () => {
    passa(await suite([`${CMD.test} tests/unit/`, `${CMD.test} ./tests/unit/a.test.mjs`], { mode }), 'tests/unit/ e ./tests/unit/a.test.mjs');
  });

  test(`C5 GUARDA [${mode}] com entradas ignoradas na lista, a entrada válida continua a contar: pass`, async () => {
    const files = ['../x/a.test.mjs', 'C:/x/a.test.mjs', 'tests/unit/a.test.mjs'];
    passa(await suite([`${CMD.test} tests/unit`, `${CMD.test} tests/unit/a.test.mjs`], { mode, projectFiles: files }), 'tests/unit e tests/unit/a.test.mjs');
  });
}