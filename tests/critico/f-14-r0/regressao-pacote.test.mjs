// F-14 critério 5 e «reprova sempre» (regressão), bloco 1 de 2: a suíte do pacote. Um comando, uma suite (≤ 540 s; 163 s na base).
// Oráculo: nenhum scripts/*.test.mjs da base 248ed1c desaparece nem perde testes estáticos (contados no git da base), e
// `node --test scripts/*.test.mjs` sai 0 com pelo menos os 291 testes que passavam na base. A 2.ª execução seguida é do tester.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, git, sandboxEnv, readFileSync, existsSync } from './helpers.mjs';
import { doLote } from '../_comum/lote.mjs';

const PASS_BASE = 291;
const conta = (t) => [...t.matchAll(/^\s*test\((['"`])/gm)].length;

test('regressão: nenhum scripts/*.test.mjs da base desaparece nem perde testes', () => {
  const ls = git('ls-tree', '--name-only', BASE + ':scripts');
  assert.equal(ls.status, 0, ls.stderr);
  const menos = [];
  for (const n of ls.stdout.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.test.mjs'))) {
    const antes = conta(git('show', `${BASE}:scripts/${n}`).stdout), f = join(ROOT, 'scripts', n);
    const agora = existsSync(f) ? conta(readFileSync(f, 'utf8')) : -1;
    if (agora < antes) menos.push(`${n}: ${agora} testes, eram ${antes}`);
  }
  assert.deepEqual(menos, []);
});

test('regressão: node --test "scripts/*.test.mjs" sai 0, com pelo menos os testes que passavam na base', (t) => {
  const r = doLote(t, 'scripts', { corre: () => spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=tap', 'scripts/*.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 530000, maxBuffer: 1 << 27 }) });
  if (!r) return;
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const n = (k) => +(out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) || [])[1];
  assert.equal(r.status, 0, out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500));
  assert.equal(n('fail'), 0);
  assert.ok(n('pass') >= PASS_BASE, `passaram ${n('pass')}, eram ${PASS_BASE}`);
});
