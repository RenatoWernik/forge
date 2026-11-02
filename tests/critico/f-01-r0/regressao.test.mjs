// F-01: regressões. A suíte do pacote continua verde e nenhum teste existente desaparece (a referência é beb6338).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sandboxEnv } from './helpers.mjs';
import { doLote } from '../_comum/lote.mjs';

// Número de test() de topo por ficheiro em beb6338
const BASELINE = { 'doctor.test.mjs': 45, 'frontmatter.test.mjs': 3, 'scaffold.test.mjs': 25, 'sync.test.mjs': 21 };

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
