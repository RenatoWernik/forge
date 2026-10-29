// F-02 critério 4: o corpus completo corre em 5 min ou menos e imprime o tempo total.
// Reprova sempre: nada escrito fora da pasta temporária (nem na config do utilizador, nem na árvore do pacote).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, HARNESS, FAKE_HOME, runHarness } from './helpers.mjs';

const status = () => spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }).stdout;

test('C4: o corpus completo corre em 300 s ou menos, passa e imprime o tempo total; não escreve na árvore do pacote nem no HOME', () => {
  assert.ok(existsSync(join(ROOT, HARNESS)), HARNESS + ' não existe');
  const before = status();
  const r = runHarness(ROOT, 330000);
  assert.equal(r.status, 0, r.out.slice(-3000));
  assert.ok(r.ms <= 300000, 'o corpus demorou ' + Math.round(r.ms / 1000) + ' s');
  const printed = r.out.split(/\r?\n/).filter((l) => !/duration_ms|^\s*(not )?ok\b|# Subtest:/.test(l) && /\d+(?:[.,]\d+)?\s*(ms|s|seg|segundos|min)\b/i.test(l));
  assert.ok(printed.length > 0, 'o teste não imprime o tempo total\n' + r.out.slice(-1500));
  assert.equal(status(), before, 'o corpus deixou ficheiros na árvore do pacote');
  assert.deepEqual(readdirSync(FAKE_HOME), [], 'o corpus escreveu no HOME');
});
