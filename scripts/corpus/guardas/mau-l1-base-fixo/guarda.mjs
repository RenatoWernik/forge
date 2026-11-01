// caso mau L1: um BASE fixo chega ao git diff (o padrão que partiu o F-20b e o F-22a quando a main avançou)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const BASE = 'abc1234';

test('C9 GUARDA: o pacote só muda em scripts/', () => {
  const r = spawnSync('git', ['diff', '--stat', BASE, '--', 'templates'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '');
});
