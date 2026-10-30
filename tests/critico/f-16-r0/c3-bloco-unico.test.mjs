// F-16 critério 3 (GUARDA: verde na base 712b690; o F-16 não pode afrouxar o A4d). Um tipo cujas passagens têm um só bloco é o comando
// inteiro: conta só quando esse bloco é exatamente o testCommand (suite) ou o e2eCommand (E2E), com os espaços colapsados. Um bloco
// único com um filtro que existe NÃO é a suíte inteira: fail com reason runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CMD, lote, ent, SUITE2, E2E3, verdictOf, reasonOf, show } from './helpers.mjs';

test('C3 GUARDA bloco único = testCommand e e2eCommand, com e sem número de passagem, com espaços a mais: pass', async () => {
  for (const runs of [
    [...SUITE2(), ...E2E3()],
    [...SUITE2('  ' + CMD.test.replace(' ', '   ') + ' '), ...E2E3()],
    [{ kind: 'suite', command: CMD.test, failures: [] }, { kind: 'suite', command: CMD.test, failures: [] }, ...E2E3()],
  ]) for (const over of [{}, { projectFiles: undefined }]) { // a falha fechada (P1) só toca nos blocos com filtro: sem projectFiles, o comando inteiro conta
    const r = await lote(runs, over);
    assert.equal(verdictOf(r), 'pass', show(r));
    assert.equal(JSON.stringify(r.out.runs), '{"suite":2,"e2e":3}', show(r)); // JSON: o objeto vem da vm (outro Object.prototype)
  }
});

for (const [nome, suite, e2e] of [
  ['suíte: testCommand + uma pasta que existe', `${CMD.test} tests/unit`, CMD.e2e],
  ['suíte: testCommand + um ficheiro que existe', `${CMD.test} tests/unit/a.test.mjs`, CMD.e2e],
  ['E2E: e2eCommand + uma pasta que existe', CMD.test, `${CMD.e2e} e2e/flows`],
  ['suíte: echo', 'echo ok', CMD.e2e],
  ['suíte: o e2eCommand', CMD.e2e, CMD.e2e],
]) {
  test(`C3 GUARDA bloco único que não é o comando inteiro (${nome}): fail com reason runs`, async () => {
    const r = await lote([ent('suite', suite, 1), ent('suite', suite, 2), ...[1, 2, 3].map((p) => ent('e2e', e2e, p))]);
    assert.equal(verdictOf(r), 'fail', show(r));
    assert.equal(reasonOf(r), 'runs', show(r));
  });
}
