// F-05: regressões. Corre à parte dos ataques c*.test.mjs (cada comando fica abaixo de 540 s):
//   node --test tests/critico/f-05-r0/regressao.test.mjs
// A suíte do pacote continua verde (com o corpus do F-02, que agora corre as mutações do F-05), nenhum ficheiro de teste perde
// testes (referência: e083b6a, a main com o F-01, o F-02, o F-03 e o F-10), os ataques da Ronda −1 já fundidos continuam verdes e
// só os helpers.mjs desses ataques podem mudar (PERGUNTA 5 na #6). Os filhos correm com o HOME e o TMP falsos do helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sandboxEnv } from './helpers.mjs';

// Número de test() de topo por ficheiro em e083b6a
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };
const PRIOR = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-10-r0'];
const runTests = (globs) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 520000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
const failures = (out) => out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500);
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

test('regressão: nenhum ficheiro de teste do pacote perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const file = join(ROOT, 'scripts', f);
    assert.ok(existsSync(file), f + ' desapareceu');
    const count = [...readFileSync(file, 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].length;
    assert.ok(count >= n, `${f}: ${count} testes, eram ${n}`);
  }
});

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os 139 testes de e083b6a', () => {
  const r = runTests(['scripts/*.test.mjs']);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 139, 'passaram ' + r.pass);
});

test('âmbito: em relação à origin/main, dos ataques já fundidos só os helpers.mjs podem mudar', () => {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(mb.status, 0, 'sem merge-base com origin/main: ' + mb.stderr);
  const changed = git('diff', '--name-only', mb.stdout.trim(), '--', ...PRIOR.map((d) => 'tests/critico/' + d)).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter((f) => !f.endsWith('/helpers.mjs')), [], 'ficheiros dos ataques anteriores alterados');
});

test('regressão: os ataques da Ronda −1 já fundidos (f-01, f-02, f-03 e f-10) continuam verdes', () => {
  for (const d of PRIOR) assert.ok(existsSync(join(ROOT, 'tests/critico', d)), d + ' desapareceu');
  const r = runTests(PRIOR.map((d) => `tests/critico/${d}/*.test.mjs`));
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 275, 'passaram ' + r.pass);
});
