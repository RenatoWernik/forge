// caso limpo: os shas só aparecem em comentários; o git recebe o merge-base calculado
// antes esta guarda comparava com 645120f e partiu quando a main avançou
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// const BASE = 'abc1234';
/* spawnSync('git', ['diff', '--stat', '9f8e7d6']) */
test('C9 GUARDA: o compat.json fica como no merge-base', (t) => {
  const mb = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' });
  if (mb.status !== 0) return t.skip('sem origin/main');
  const r = spawnSync('git', ['diff', '--stat', mb.stdout.trim(), '--', 'compat.json'], { encoding: 'utf8' }); // nunca abc1234
  assert.equal(r.stdout.trim(), '');
});
