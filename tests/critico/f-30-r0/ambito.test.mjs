// F-30: âmbito. Reprova (corpo da #141): «um ataque antigo enfraquecido». O teste compara com base() (o merge-base com origin/main, regra 8) e só
// corre na branch do ticket (regra 9): depois do merge a main já contém a mudança.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT, base, soNoTicket } from './helpers.mjs';

const gitRoot = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, 'git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };

test('ÂMBITO: nenhum ataque de outro ticket (tests/critico/* fora de f-30-r0) mudou nem foi apagado', (t) => {
  if (soNoTicket(t, 'f-30')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const mudou = gitRoot('diff', '--name-status', b, '--', 'tests/critico').split(/\r?\n/).filter(Boolean).filter((l) => !/^\S+\s+tests\/critico\/f-30-r0\//.test(l));
  assert.deepEqual(mudou, [], 'ataques antigos alterados ou apagados');
});