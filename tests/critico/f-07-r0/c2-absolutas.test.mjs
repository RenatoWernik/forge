// F-07 critério 2: um critério com palavra absoluta e sem `oracle` é recusado, em inglês e em português; as palavras que só contêm
// os termos e os critérios com `oracle` não são recusados. 0 falsos positivos e 0 falsos negativos.
// Depende do F-06: não.
// Oráculo (independente do dev): o corpus fechado de frases.mjs (36 positivas, 33 negativas) mais 100 + 100 mutações geradas com a
// semente 20261029, cada uma posta como critério 2 de um contrato válido e corrida nos dois workflows que validam o contrato
// (gauntlet-attacks e gauntlet-build), nos dois modos. O critério verifica-se com `node --test scripts/contrato.test.mjs`, que tem
// de existir e passar.
// Leitura (PERGUNTA 1 na #8): um critério sem palavra absoluta e sem oracle é válido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, ATTACKS, BUILD, MODES, contract, baseArgs, comR0, r0, runWf, fakeImpl, refusalText, names, sandboxEnv } from './helpers.mjs';
import { ABS, POS, NEG, hasAbs, generated } from './frases.mjs';

const GEN = generated();

test('C2 corpus: pelo menos 30 positivas e 30 negativas, cada palavra absoluta em 2 ou mais positivas, e o oráculo de referência separa-as (o corpus está certo)', () => {
  assert.ok(POS.length >= 30 && NEG.length >= 30, `${POS.length} positivas e ${NEG.length} negativas`);
  for (const w of ABS) assert.ok(POS.filter((s) => new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, 'iu').test(s)).length >= 2, `«${w}» em menos de 2 positivas`);
  for (const w of ['install', 'many', 'company', 'everyday', 'allocate', 'alloy']) assert.ok(NEG.some((s) => s.toLowerCase().includes(w)), `falta a armadilha do contrato «${w}»`);
  assert.deepEqual([...POS, ...GEN.pos].filter((s) => !hasAbs(s)), []);
  assert.deepEqual([...NEG, ...GEN.neg].filter(hasAbs), []);
  assert.equal(GEN.pos.length + GEN.neg.length, 200);
});

const piece = (text, withOracle) => contract('pa', 9101, { criteria: [contract().criteria[0], { text, command: 'node --test test/b.test.mjs', ...(withOracle ? { oracle: withOracle } : {}) }] });
const run = (file, mode, p) => {
  const args = baseArgs([p], { mode });
  return runWf(file, file === BUILD ? comR0(args, [r0('pa')]) : args, fakeImpl({ pieces: [p] }));
};
const refused = (x) => x.calls.length === 0 && names(refusalText(x), ['criteria', 1, 'oracle']);
const accepted = (x) => x.calls.length > 0 && !x.err;

for (const file of [ATTACKS, BUILD]) {
  for (const mode of MODES) {
    test(`C2 ${file} (${mode}): cada frase positiva sem oracle é recusada antes de qualquer agent(), com o campo criteria[1].oracle; 0 falsos negativos`, async () => {
      const miss = [];
      for (const s of [...POS, ...GEN.pos]) {
        const x = await run(file, mode, piece(s));
        if (!refused(x)) miss.push(`${JSON.stringify(s)} → ${x.calls.length} agentes; ${refusalText(x).slice(0, 160)}`);
      }
      assert.deepEqual(miss, [], `${miss.length} falsos negativos`);
    });
    test(`C2 ${file} (${mode}): nenhuma frase negativa é recusada (sem oracle), nem uma positiva com oracle; 0 falsos positivos`, async () => {
      const wrong = [];
      for (const s of [...NEG, ...GEN.neg]) {
        const x = await run(file, mode, piece(s));
        if (!accepted(x)) wrong.push(`${JSON.stringify(s)} → ${x.calls.length} agentes; ${refusalText(x).slice(0, 160)}`);
      }
      for (const [i, s] of [...POS, ...GEN.pos].entries()) {
        const x = await run(file, mode, piece(s, ['corpus', 'property', 'reference', 'threshold'][i % 4]));
        if (!accepted(x)) wrong.push(`com oracle ${JSON.stringify(s)} → ${x.calls.length} agentes; ${refusalText(x).slice(0, 160)}`);
      }
      assert.deepEqual(wrong, [], `${wrong.length} falsos positivos`);
    });
  }
}

test('C2 a recusa olha para o texto de cada critério: a palavra absoluta no 1.º, no 2.º ou no 6.º critério nomeia esse índice', async () => {
  for (const i of [0, 1, 5]) {
    const criteria = Array.from({ length: 6 }, (_, k) => ({ text: `Step ${k} returns 3 rows`, command: `node --test t${k}.test.mjs`, oracle: 'corpus' }));
    criteria[i] = { text: 'The queue never loses a job', command: 'node --test q.test.mjs' };
    const p = contract('pa', 9101, { criteria });
    for (const file of [ATTACKS, BUILD]) {
      const args = baseArgs([p]);
      const x = await runWf(file, file === BUILD ? comR0(args, [r0('pa')]) : args, fakeImpl({ pieces: [p] }));
      assert.equal(x.calls.length, 0, `${file}, índice ${i}: lançou ${x.calls.length} agentes`);
      assert.ok(names(refusalText(x), ['criteria', i, 'oracle']), `${file}, índice ${i}: a recusa não nomeia criteria[${i}].oracle: ${refusalText(x).slice(0, 200)}`);
    }
  }
});

test('C2 verificação: scripts/contrato.test.mjs existe e `node --test scripts/contrato.test.mjs` passa', () => {
  assert.ok(existsSync(join(ROOT, 'scripts/contrato.test.mjs')), 'falta scripts/contrato.test.mjs (o comando de verificação dos critérios 1 e 2)');
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/contrato.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, out.slice(-2500));
  assert.ok(+(out.match(/^# pass (\d+)/m) || [])[1] > 0, 'nenhum teste passou');
});
