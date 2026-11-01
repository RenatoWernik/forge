// F-02: regressões e âmbito. A suíte do pacote continua verde, nenhum teste existente desaparece, e o ticket não altera
// o check.cjs, os templates nem o scaffold (fora do âmbito, salvo depois de uma PERGUNTA respondida).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sandboxEnv } from './helpers.mjs';
import { doLote } from '../_comum/lote.mjs';

const BASELINE = { 'doctor.test.mjs': 45, 'frontmatter.test.mjs': 3, 'scaffold.test.mjs': 25, 'sync.test.mjs': 21 };
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

test('regressão: nenhum ficheiro de teste existente perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const names = [...readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)];
    assert.ok(names.length >= n, `${f}: ${names.length} testes, eram ${n}`);
  }
});

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os 94 testes de beb6338', (t) => {
  const r = doLote(t, 'scripts', { corre: () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/*.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 480000 }) });
  if (!r) return;
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, out.slice(-3000));
  const pass = +(out.match(/^# pass (\d+)/m) || [])[1];
  assert.ok(pass >= 94, 'passaram ' + pass);
});

// Só faz sentido no ramo deste ticket: os tickets seguintes alteram os templates de propósito.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
test('âmbito: em relação à origin/main, o ticket não altera templates/, scripts/scaffold.mjs, scripts/doctor.mjs, scripts/sync.mjs nem components.json', { skip: branch !== 'f-02-corpus' && 'só no ramo f-02-corpus' }, () => {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(mb.status, 0, 'sem merge-base com origin/main: ' + mb.stderr);
  const d = git('diff', '--name-only', mb.stdout.trim(), '--', 'templates', 'scripts/scaffold.mjs', 'scripts/doctor.mjs', 'scripts/sync.mjs', 'components.json');
  assert.equal(d.stdout.trim(), '', 'ficheiros fora do âmbito alterados:\n' + d.stdout);
});
