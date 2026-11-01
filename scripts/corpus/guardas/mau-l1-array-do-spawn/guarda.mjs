// caso mau L1: um sha no array de argumentos de spawnSync('git', [...])
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('C9 o compat.json da main tem o ai-memory', () => {
  const r = spawnSync('git', ['show', '--stat', '9f8e7d6', '--', 'compat.json'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});
