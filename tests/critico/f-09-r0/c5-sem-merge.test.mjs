// F-09 critério 5: o prompt do tester proíbe push, PR e merge sem o sim do utilizador. Oráculo: a linha `batch: no merge` do
// check.cjs, mais a mutação que retira a proibição (no corpus do F-02, verificada por `node --test scripts/corpus.test.mjs`).
// Aqui: (1) a proibição está no prompt do tester, numa só linha (push, PR, merge, o utilizador e a negação: o mesmo literal da
// cláusula «nenhum merge» do brief do lote no F-06); (2) a linha `batch: no merge` existe e está ok num projeto gerado; (3) o check
// dá por 3 formas de a retirar; (4) o corpus do F-02 tem a mutação desta linha sobre o gauntlet-batch.js.
// Depende do F-08: só o (2) e o (3), que correm o check.cjs inteiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, BATCH, MODES, runWf, batchArgs, pieces, fakeImpl, testerCalls, generate, ANSWERS, check, fails, lines, withPrelude, wrap, show } from './helpers.mjs';

const NO_MERGE = /^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without|nunca|sem|nenhum)\b).*$/im;
const LINE = 'batch: no merge';

for (const mode of MODES) {
  test(`C5 ${mode}: cada prompt do tester proíbe, numa linha, push, PR e merge sem o sim do utilizador`, async () => {
    const run = await runWf(BATCH, batchArgs(pieces(2), { mode }), fakeImpl());
    assert.ok(!run.err, show(run));
    const ts = testerCalls(run);
    assert.ok(ts.length >= 1, 'o tester não correu');
    assert.deepEqual(ts.filter((c) => !NO_MERGE.test(c.prompt)).map((c) => c.opts.label), [], 'prompt do tester sem a proibição');
  });
}

test('C5 a linha «batch: no merge» existe, uma só vez, e está ok num projeto gerado', async () => {
  const { dest } = await generate(ANSWERS());
  const r = check(dest);
  assert.equal(r.status, 0, fails(r.out));
  assert.deepEqual(lines(r.out, LINE).map((x) => x[0]), ['ok'], 'linhas «batch: no merge»: ' + JSON.stringify(lines(r.out, LINE)));
});

const isTester = 'o && args && args.models && args.models.tester && o.model === args.models.tester.model && o.effort === args.models.tester.effort';
const MUTANTS = [
  ['as linhas com «merge» saem do prompt do tester', wrap(`(p, o) => __a(${isTester} ? String(p).split('\\n').filter(l => !/merge/i.test(l)).join('\\n') : p, o)`)],
  ['a negação sai da linha da proibição', wrap(`(p, o) => __a(${isTester} ? String(p).split('\\n').map(l => /merge/i.test(l) ? l.replace(/\\b(never|no|not|without|nunca|sem|nenhum|do not|don't)\\b/gi, '') : l).join('\\n') : p, o)`)],
  ['o utilizador sai da linha da proibição (fica sem o «sim do utilizador»)',wrap(`(p, o) => __a(${isTester} ? String(p).split('\\n').map(l => /merge/i.test(l) ? l.replace(/\\b(user|utilizador|usu[áa]rio)\\b/gi, '') : l).join('\\n') : p, o)`)],
];
for (const [label, prelude] of MUTANTS) {
  test(`C5 mutação → a linha «batch: no merge» falha: ${label}`, async () => {
    const { dest } = await generate(ANSWERS());
    withPrelude(dest, BATCH, prelude);
    const r = check(dest);
    assert.equal(r.status, 1, 'o check não deu pela mutação:\n' + r.out.slice(-1200));
    assert.deepEqual(lines(r.out, LINE).map((x) => x[0]), ['FAIL'], 'a linha «batch: no merge» não falhou:\n' + fails(r.out));
  });
}

test('C5 o corpus do F-02 tem a mutação que retira a proibição: line «batch: no merge…», file .claude/workflows/gauntlet-batch.js', () => {
  const dir = join(ROOT, 'scripts/corpus/mutations');
  const ms = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '')));
  const mine = ms.filter((m) => typeof m.line === 'string' && m.line.startsWith(LINE) && m.file === '.claude/workflows/gauntlet-batch.js');
  assert.ok(mine.length >= 1, 'nenhuma mutação do corpus sobre a linha «batch: no merge» no gauntlet-batch.js');
  assert.ok(mine.some((m) => /merge/i.test(m.find)), 'a mutação não mexe no texto da proibição (o find não tem «merge»)');
});
