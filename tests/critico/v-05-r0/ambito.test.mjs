// V-05 (#129), «Reprova sempre: ataque enfraquecido ou apagado»: o ticket não altera nem apaga nenhum ficheiro de tests/critico/ fora desta pasta,
// contra o merge-base com a origin/main (regra 8 dos briefs). Pastas novas de outros tickets do pacote (acrescentadas) não contam.
// Só corre na branch do ticket (regra 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT } from './helpers.mjs';

const gitRaiz = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

test('ÂMBITO: o V-05 não altera nem apaga nenhum ficheiro de tests/critico/ fora de tests/critico/v-05-r0/', (t) => {
  if (soNoTicket(t, 'v-05')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const d = gitRaiz('diff', '--name-status', '--diff-filter=MDRT', b, '--', 'tests/critico');
  assert.equal(d.status, 0, d.stderr);
  const mexidos = d.stdout.split(/\r?\n/).filter(Boolean).filter((l) => !l.split('\t').slice(1).every((f) => f.startsWith('tests/critico/v-05-r0/')));
  assert.deepEqual(mexidos, []);
});