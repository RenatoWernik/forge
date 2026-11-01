// F-22c: âmbito e entrega. A barra de regressão corre «sem alterar ataques nem asserts antigos»; o F-22c não autoriza nenhum assert novo nos
// testes antigos. Os testes de âmbito comparam com baseDoTicket() (o base() da regra 8, ou o ponto de partida em cima do F-22b enquanto ele não
// estiver na main, ver helpers.mjs) e só correm na branch do ticket (regra 9): depois do merge a main já contém a mudança.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitRoot, baseDoTicket, base, soNoTicket } from './helpers.mjs';

test('ÂMBITO: nenhum ataque de outro ticket (tests/critico/* fora de f-22c-r0) mudou', (t) => {
  if (soNoTicket(t, 'f-22c')) return;
  if (!base()) return t.skip('sem origin/main');
  const b = baseDoTicket();
  const mudou = gitRoot('diff', '--name-only', b, '--', 'tests/critico').split(/\r?\n/).filter(Boolean).filter((f) => !f.startsWith('tests/critico/f-22c-r0/'));
  assert.deepEqual(mudou, [], 'ataques antigos alterados');
});

test('ÂMBITO: nenhum assert antigo de scripts/*.test.mjs foi tirado ou mudado (nenhuma linha removida)', (t) => {
  if (soNoTicket(t, 'f-22c')) return;
  if (!base()) return t.skip('sem origin/main');
  const b = baseDoTicket();
  const d = gitRoot('diff', '-U0', b, '--', 'scripts/*.test.mjs').split(/\r?\n/);
  let f = '';
  const tiradas = [];
  for (const l of d) {
    const m = /^--- a\/(.*)$/.exec(l);
    if (m) { f = m[1]; continue; }
    if (/^-(?!--)/.test(l)) tiradas.push(f + ': ' + l);
  }
  assert.deepEqual(tiradas, [], 'linhas tiradas de scripts/*.test.mjs');
});