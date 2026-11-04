// V-09 C3 (#133): com agentes falsos no molde dos do check, os workflows do projeto gerado chamam as peças novas nos prompts. O gauntlet-build leva o
// executor ao crítico da R1 e da R2, antes do método, e o check-ticket ao dev, com o greenEvidence. O gauntlet-batch leva-o 2× ao tester, sem
// mudar a contagem de passes do workflow. Leituras: PERGUNTAS 2 e 3 do comentário 6618884237.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { EN, EXECUTOR, CHECK_TICKET, gerar, conjunto, fluxo, prompts, argsBase, argsLote, agentesBuild, agentesLote } from './helpers.mjs';

let P;
before(async () => { P = await gerar(await conjunto(EN)); });
const MARCO = 'Get the real reference';
const POR_RONDA = { 1: `${EXECUTOR} --todas`, 2: `${EXECUTOR} --afetadas` };

for (const mode of ['rigorous', 'accelerated']) {
  test(`C3 (${mode}): o prompt do crítico chama o executor na R1 (--todas) e na R2 (--afetadas), antes de «${MARCO}»`, async () => {
    const x = await fluxo(P, 'gauntlet-build.js', argsBase(P, { mode }), agentesBuild(P));
    assert.equal(x.err, undefined, 'o workflow caiu: ' + x.err?.message);
    for (const r of [1, 2]) {
      const [p] = prompts(x, `critic:p:r${r}`);
      assert.ok(p, `sem o crítico da R${r}`);
      const i = p.indexOf(POR_RONDA[r]), m = p.indexOf(MARCO);
      assert.ok(i >= 0, `o prompt do crítico da R${r} não tem \`${POR_RONDA[r]}\``);
      assert.ok(m > i, `na R${r}, o executor não vem antes de «${MARCO}»`);
    }
  });
}

for (const tdd of [true, false]) {
  test(`C3: o prompt do dev (tdd: ${tdd}) exige \`${CHECK_TICKET}\` na mesma linha que greenEvidence, na R1 e na R2`, async () => {
    const a = argsBase(P);
    a.pieces[0].tdd = tdd;
    const x = await fluxo(P, 'gauntlet-build.js', a, agentesBuild(P));
    assert.equal(x.err, undefined, 'o workflow caiu: ' + x.err?.message);
    for (const r of [1, 2]) {
      const [p] = prompts(x, `build:p:r${r}`);
      assert.ok(p, `sem o dev da R${r}`);
      assert.ok(p.split('\n').some((l) => l.includes(CHECK_TICKET) && l.includes('greenEvidence')), `na R${r}, nenhuma linha do prompt do dev tem o check-ticket e o greenEvidence`);
    }
  });
}

for (const testCommand of ['SUITE-CMD', `${EXECUTOR} --todas`]) {
  test(`C3 (testCommand ${testCommand}): o prompt do tester chama o executor 2× (--todas --passe 1 e --passe 2) e diz o --continuar`, async () => {
    const x = await fluxo(P, 'gauntlet-batch.js', argsLote(P, testCommand), agentesLote(P, testCommand, [1, 2]));
    assert.equal(x.err, undefined, 'o workflow caiu: ' + x.err?.message);
    const [p] = prompts(x, 'batch:tester');
    assert.ok(p, 'sem o tester');
    assert.deepEqual([`${EXECUTOR} --todas --passe 1`, `${EXECUTOR} --todas --passe 2`, '--continuar'].filter((l) => !p.includes(l)), [], 'literais em falta no prompt do tester');
  });
}

test('C3 (guarda): com testCommand = executor, o gauntlet-batch aprova os 2 passes do testCommand e recusa 1 (motivo runs); o prompt do tester continua a proibir o merge', async () => {
  const cmd = `${EXECUTOR} --todas`;
  const dois = await fluxo(P, 'gauntlet-batch.js', argsLote(P, cmd), agentesLote(P, cmd, [1, 2]));
  const um = await fluxo(P, 'gauntlet-batch.js', argsLote(P, cmd), agentesLote(P, cmd, [1]));
  assert.equal(dois.err, undefined, 'o workflow caiu: ' + dois.err?.message);
  assert.equal(dois.out?.batch?.verdict, 'pass', '2 passes: ' + JSON.stringify(dois.out?.batch));
  assert.equal(um.out?.batch?.verdict, 'fail', '1 passe: ' + JSON.stringify(um.out?.batch));
  assert.equal(um.out.batch.reason, 'runs', '1 passe: motivo');
  assert.ok(prompts(dois, 'batch:tester')[0].includes('Never push, open a PR or merge into the main branch'), 'o prompt do tester perdeu a proibição');
});