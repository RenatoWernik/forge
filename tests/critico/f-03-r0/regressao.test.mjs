// F-03: regressões. A suíte do pacote continua verde, nenhum ficheiro de teste perde testes (referência: d8572ed, a main com o F-01
// e o F-02) e os ataques da Ronda −1 do F-01 e do F-02 continuam verdes. Os filhos correm com o HOME e o TMP falsos do helpers.mjs,
// por isso as pastas temporárias que eles deixem são apagadas com a deste ficheiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sandboxEnv } from './helpers.mjs';

// Número de test() de topo por ficheiro em d8572ed
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'scaffold.test.mjs': 27, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };
const runTests = (globs) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 480000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
const failures = (out) => out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500);

test('regressão: nenhum ficheiro de teste do pacote perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const file = join(ROOT, 'scripts', f);
    assert.ok(existsSync(file), f + ' desapareceu');
    const count = [...readFileSync(file, 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].length;
    assert.ok(count >= n, `${f}: ${count} testes, eram ${n}`);
  }
});

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os 120 testes de d8572ed', () => {
  const r = runTests(['scripts/*.test.mjs']);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 120, 'passaram ' + r.pass);
});

// Resposta à PERGUNTA 1 na #4: o dev migra só o objeto ANSWERS de tests/critico/f-01-r0/helpers.mjs; nada mais dos ataques anteriores muda.
// Só faz sentido no ramo deste ticket.
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
test('âmbito: em relação à origin/main, dos ataques do F-01 e do F-02 só muda o objeto ANSWERS de tests/critico/f-01-r0/helpers.mjs', { skip: branch !== 'f-03-forge-json-v2' && 'só no ramo f-03-forge-json-v2' }, () => {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(mb.status, 0, 'sem merge-base com origin/main: ' + mb.stderr);
  const base = mb.stdout.trim();
  const changed = git('diff', '--name-only', base, '--', 'tests/critico/f-01-r0', 'tests/critico/f-02-r0').stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter((f) => f !== 'tests/critico/f-01-r0/helpers.mjs'), [], 'ficheiros dos ataques anteriores alterados');
  const strip = (t) => t.replace(/\r\n/g, '\n').replace(/^export const ANSWERS = [\s\S]*?^\}\);$/m, '<ANSWERS>');
  const before = git('show', `${base}:tests/critico/f-01-r0/helpers.mjs`).stdout;
  assert.ok(before.includes('export const ANSWERS'), 'pré-condição: o helper da base tem ANSWERS');
  assert.equal(strip(readFileSync(join(ROOT, 'tests/critico/f-01-r0/helpers.mjs'), 'utf8')), strip(before), 'o helper do F-01 mudou fora do objeto ANSWERS');
});

test('regressão: os ataques da Ronda −1 do F-01 e do F-02 (tests/critico/f-01-r0 e f-02-r0) continuam verdes', () => {
  for (const d of ['f-01-r0', 'f-02-r0']) assert.ok(existsSync(join(ROOT, 'tests/critico', d)), d + ' desapareceu');
  const r = runTests(['tests/critico/f-01-r0/*.test.mjs', 'tests/critico/f-02-r0/*.test.mjs']);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 60, 'passaram ' + r.pass);
});
