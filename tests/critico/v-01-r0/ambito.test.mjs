// V-01 (#125), «Reprova: mexer em qualquer ficheiro de tests/critico/»: fora desta pasta, nada de tests/critico/ muda em relação ao
// merge-base com a origin/main (regra 8 dos briefs), nem há ficheiros novos. Só corre na branch do ticket (regra 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT } from './helpers.mjs';

const gitRaiz = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const linhas = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

test('ÂMBITO: o V-01 não mexe em nenhum ficheiro de tests/critico/ fora de tests/critico/v-01-r0/', (t) => {
  if (soNoTicket(t, 'v-01')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const d = gitRaiz('diff', '--name-only', b, '--', 'tests/critico');
  assert.equal(d.status, 0, d.stderr);
  const o = gitRaiz('ls-files', '-o', '--exclude-standard', '--', 'tests/critico');
  const mexidos = [...linhas(d.stdout), ...linhas(o.stdout)].filter((f) => !f.startsWith('tests/critico/v-01-r0/'));
  assert.deepEqual(mexidos, []);
});