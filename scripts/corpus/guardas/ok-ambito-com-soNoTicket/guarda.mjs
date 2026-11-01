// caso limpo: um teste de âmbito com soNoTicket, e o git diff de nomes dentro dele
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { soNoTicket } from '../_comum/ambito.mjs';

test('ÂMBITO: só scripts/guardas-critico.test.mjs e a lista mudam em scripts/', (t) => {
  if (soNoTicket(t, 'f-97')) return;
  const r = spawnSync('git', ['diff', '--name-only', 'origin/main...HEAD', '--', 'scripts'], { encoding: 'utf8' });
  assert.deepEqual(r.stdout.split('\n').filter(Boolean).sort(), ['scripts/guardas-critico.test.mjs', 'scripts/guardas-legado.json']);
});
