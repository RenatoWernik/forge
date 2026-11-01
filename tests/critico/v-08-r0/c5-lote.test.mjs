// V-08 C5 (#132): um projeto gerado com testCommand = executor (`node .claude/executor.mjs --todas`) passa no gauntlet-batch com as contagens
// de passe que o check já verifica hoje (check.cjs, linhas «batch: one tester ... runs the suite 2x» e «bootstrap: args: gauntlet-batch»):
// 2 passes do testCommand aprovam e 1 passe recusa com o motivo runs. E os passes são reais: o testCommand corrido 2× no mesmo projeto executa
// a suíte 2×; a 2.ª corrida não pode reaproveitar o resultado da 1.ª, senão o «2×» do lote é falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_COMMAND, NO_PROJETO, gerar, conjunto, preCondicao, repo, escreve, tmp, comSuites, suiteComando, correAteFim, lote, lerJson, fim } from './helpers.mjs';

test('C5: o testCommand do executor, corrido 2× no mesmo projeto, dá 0 nas duas e executa a suíte 2×', async () => {
  assert.equal(TEST_COMMAND, `node ${NO_PROJETO('executor.mjs')} --todas`);
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  const conta = join(tmp('critico-v08-conta-'), 'execucoes.txt');
  escreve(P, 't/conta.test.mjs', `import { test } from 'node:test';\nimport { appendFileSync } from 'node:fs';\ntest('conta', () => { appendFileSync(${JSON.stringify(conta)}, 'x\\n'); });\n`);
  comSuites(P, [suiteComando('projeto', 't/conta.test.mjs')]);
  repo(P);
  for (const n of [1, 2]) {
    const r = correAteFim(P, 'executor.mjs', ['--todas']);
    assert.equal(r.status, 0, `corrida ${n} do testCommand: código ${r.status}` + fim(r));
  }
  const n = existsSync(conta) ? readFileSync(conta, 'utf8').split('\n').filter(Boolean).length : 0;
  assert.equal(n, 2, 'execuções da suíte em 2 corridas do testCommand: ' + n);
});

test('C5 (guarda): o gauntlet-batch do projeto, com o bloco do lote do BOOTSTRAP.md e testCommand = executor, aprova 2 passes desse comando e recusa 1 (motivo runs)', async () => {
  const P = await gerar(await conjunto('en-plain-published'));
  const fj = lerJson(join(P, '.claude/forge.json'));
  const blk = JSON.parse([...readFileSync(join(P, 'BOOTSTRAP.md'), 'utf8').matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)][1][1]);
  const args = { ...blk, models: fj.models, mode: fj.mode, testCommand: TEST_COMMAND };
  const T = fj.models.tester, declarado = T.model + ' ' + (T.label || T.model);
  const tester = (passes) => (p, o) => (o.label === 'batch:tester' ? { runs: passes.map((n) => ({ kind: 'suite', command: TEST_COMMAND, pass: n, failures: [] })), isolated: [], main: [], model: declarado } : 'ok');
  const dois = await lote(P, args, tester([1, 2])), um = await lote(P, args, tester([1]));
  assert.equal(dois.err, undefined, 'o workflow caiu: ' + dois.err?.message);
  assert.equal(dois.out?.batch?.verdict, 'pass', '2 passes: ' + JSON.stringify(dois.out?.batch));
  assert.equal(dois.out.runs?.suite, 2, '2 passes: runs ' + JSON.stringify(dois.out.runs));
  assert.ok(dois.calls.some((c) => c.opts?.label === 'batch:tester' && c.prompt.includes(TEST_COMMAND)), 'o prompt do tester não leva o testCommand');
  assert.equal(um.out?.batch?.verdict, 'fail', '1 passe: ' + JSON.stringify(um.out?.batch));
  assert.equal(um.out.batch.reason, 'runs', '1 passe: motivo');
});