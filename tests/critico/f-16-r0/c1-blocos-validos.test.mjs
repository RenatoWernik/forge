// F-16 critério 1 (GUARDA: verde na base 712b690, que aceita qualquer bloco; tem de continuar verde depois do F-16).
// Oráculo: com 2+ blocos por passagem, cada um o testCommand (ou o e2eCommand) seguido de um ficheiro ou pasta que existe no projeto
// (FICHEIROS, no disco e em args[EXISTE]; PERGUNTA P1), 2 passagens completas da suíte e 3 do E2E contam como execuções e o lote aprova,
// nos dois modos. Uma passagem a que falta um bloco continua a não contar (C8 do F-09).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CMD, MODES, lote, partido, SUITE2, E2E3, verdictOf, reasonOf, show } from './helpers.mjs';
import { VALIDOS } from './corpus.mjs';

for (const mode of MODES) {
  for (const [nome, gen] of VALIDOS.suite) {
    test(`C1 GUARDA [${mode}] suíte em blocos válidos (${nome}), 2 passagens completas: pass, runs.suite = 2`, async () => {
      const r = await lote([...partido('suite', gen(CMD.test), 2), ...E2E3()], { mode });
      assert.equal(verdictOf(r), 'pass', show(r));
      assert.equal(r.out.runs.suite, 2, show(r));
      assert.equal(r.out.runs.e2e, 3, show(r));
    });
  }
  for (const [nome, gen] of VALIDOS.e2e) {
    test(`C1 GUARDA [${mode}] E2E em blocos válidos (${nome}), 3 passagens completas: pass, runs.e2e = 3`, async () => {
      const r = await lote([...SUITE2(), ...partido('e2e', gen(CMD.e2e), 3)], { mode });
      assert.equal(verdictOf(r), 'pass', show(r));
      assert.equal(r.out.runs.e2e, 3, show(r));
    });
  }
}

test('C1 GUARDA suíte E E2E partidas ao mesmo tempo, em blocos válidos: pass, 2 e 3', async () => {
  const r = await lote([...partido('suite', VALIDOS.suite[0][1](CMD.test), 2), ...partido('e2e', VALIDOS.e2e[0][1](CMD.e2e), 3)]);
  assert.equal(verdictOf(r), 'pass', show(r));
  assert.equal(JSON.stringify(r.out.runs), '{"suite":2,"e2e":3}', show(r)); // JSON: o objeto vem da vm (outro Object.prototype)
});

test('C1 GUARDA blocos válidos, mas a 2.ª passagem sem um bloco: só 1 execução, fail com reason runs', async () => {
  const [a, b] = VALIDOS.suite[0][1](CMD.test);
  const runs = partido('suite', [a, b], 2).filter((x) => !(x.pass === 2 && x.command === b));
  const r = await lote([...runs, ...E2E3()]);
  assert.equal(verdictOf(r), 'fail', show(r));
  assert.equal(reasonOf(r), 'runs', show(r));
  assert.equal(r.out.runs.suite, 1, show(r));
});
