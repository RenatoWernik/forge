// V-06 (#130) C5: lint. A única forma de merge no código é `--squash --match-head-commit`: um `git grep -n "pr merge"` sobre
// scripts/avancar.mjs dá 1 ocorrência, e é essa a linha com as duas flags. (O C1 prova o argv real; isto prova que não há outro caminho.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT, exigeAvancar } from './helpers.mjs';

test('C5: git grep -n "pr merge" sobre scripts/avancar.mjs dá 1 ocorrência, com --squash e --match-head-commit nessa linha', () => {
  exigeAvancar();
  const r = spawnSync('git', ['grep', '-n', '--untracked', 'pr merge', '--', 'scripts/avancar.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const linhas = r.stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(linhas.length, 1, `esperava 1 ocorrência de «pr merge», há ${linhas.length}:\n${linhas.join('\n')}`);
  assert.match(linhas[0], /--squash/, linhas[0]);
  assert.match(linhas[0], /--match-head-commit/, linhas[0]);
});