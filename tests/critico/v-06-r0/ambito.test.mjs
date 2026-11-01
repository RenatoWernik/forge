// V-06 (#130), regra comum «Reprova sempre: ... ataque enfraquecido ou apagado»: fora desta pasta, nenhum ficheiro de tests/critico/ é
// modificado nem apagado em relação ao merge-base com a origin/main (regra 8). Só corre na branch do ticket (regra 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT } from './helpers.mjs';

const gitRaiz = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const linhas = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

test('ÂMBITO: o V-06 não modifica nem apaga nenhum ficheiro de tests/critico/ fora de tests/critico/v-06-r0/', (t) => {
  if (soNoTicket(t, 'v-06')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const d = gitRaiz('diff', '--name-only', '--diff-filter=MDR', b, '--', 'tests/critico');
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(linhas(d.stdout).filter((f) => !f.startsWith('tests/critico/v-06-r0/')), []);
});