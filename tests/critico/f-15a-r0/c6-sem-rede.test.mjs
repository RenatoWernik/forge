// DEPENDE DO F-05 (#6) só no teste do compat.test.mjs (que lê os templates).
//
// Reprova sempre: um teste que vai à rede. Os testes do dev (scripts/compat.test.mjs e scripts/doctor.test.mjs) correm com o
// preload sem-rede.mjs (NODE_OPTIONS, herdado pelos processos filhos), que regista cada tentativa de rede mesmo que o teste apanhe
// o erro e passe; e com HOME, USERPROFILE e CLAUDE_CONFIG_DIR numa pasta temporária.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ROOT, COMPAT_TEST, tmp, sandboxEnv, semRedeEnv } from './helpers.mjs';

const semRede = (rel) => {
  assert.ok(existsSync(join(ROOT, rel)), 'falta ' + rel);
  const d = tmp('critico-f15a-rede-');
  const log = join(d, 'rede.log');
  writeFileSync(log, '');
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', rel], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv({ HOME: d, USERPROFILE: d, CLAUDE_CONFIG_DIR: d, GITHUB_TOKEN: undefined, ...semRedeEnv(log) }), timeout: 300000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), rede: readFileSync(log, 'utf8').split('\n').filter(Boolean) };
};

test('controlo: o preload sem-rede regista um fetch feito por um processo filho', () => {
  const d = tmp('critico-f15a-rede-');
  const log = join(d, 'rede.log');
  writeFileSync(log, '');
  spawnSync(process.execPath, ['-e', "fetch('https://example.invalid/').catch(() => {})"], { encoding: 'utf8', env: sandboxEnv(semRedeEnv(log)), timeout: 60000 });
  assert.match(readFileSync(log, 'utf8'), /fetch https:\/\/example\.invalid/);
});

test('reprova sempre: scripts/doctor.test.mjs passa sem nenhuma tentativa de rede', () => {
  const r = semRede('scripts/doctor.test.mjs');
  assert.equal(r.status, 0, r.out.slice(-2500));
  assert.deepEqual(r.rede, []);
});

test('reprova sempre (F-05): scripts/compat.test.mjs passa sem nenhuma tentativa de rede', () => {
  const r = semRede(COMPAT_TEST);
  assert.equal(r.status, 0, r.out.slice(-2500));
  assert.deepEqual(r.rede, []);
});
