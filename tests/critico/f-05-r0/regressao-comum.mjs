// F-05: o que os ficheiros de regressão partilham. Os filhos correm com o HOME e o TMP falsos do helpers.mjs.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, sandboxEnv } from './helpers.mjs';

// Reexecutor aninhado: volta a correr outras suites dentro de um teste e não cabe nos 540 s de um comando com a máquina carregada. Fica em skip por omissão;
// cada suite corre no seu próprio comando (Ronda 0, crítico e tester), e FORGE_NESTED=1 liga-o.
export const NESTED_SKIP = process.env.FORGE_NESTED !== '1' && 'reexecutor aninhado: cada suite corre no seu comando; FORGE_NESTED=1 liga-o';
export const PRIOR = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-10-r0'];
export const runTests = (globs) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 520000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
export const failures = (out) => out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500);
// Os ataques de `globs` (relativos a tests/critico, ex.: «f-01-r0/*.test.mjs») continuam verdes, com pelo menos `min` testes a
// passar (contagem em e083b6a)
export const priorGreen = (globs, min) => {
  for (const g of globs) assert.ok(existsSync(join(ROOT, 'tests/critico', g.split('/')[0])), g.split('/')[0] + ' desapareceu');
  const r = runTests(globs.map((g) => `tests/critico/${g}`));
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= min, 'passaram ' + r.pass);
};
