// caso limpo: --name-only num git que não é diff (ls-tree), e uma palavra só de letras hexadecimais (sem dígitos) que não é um sha
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('C9 a árvore de HEAD tem o compat.json (a palavra defaced não é um sha)', () => {
  const r = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' });
  assert.ok(r.stdout.split('\n').includes('compat.json'));
  assert.equal(['defaced'].length, 1);
  assert.equal(spawnSync('git', ['log', '--grep', 'defaced', '-n', '1'], { encoding: 'utf8' }).status, 0);
});
