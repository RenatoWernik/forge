// F-22b: âmbito e entrega. «Assert autorizado: a lista de scripts/scaffold.test.mjs ganha `.claude/learn.mjs`, e só isso»; a barra de regressão
// corre sem alterar ataques nem asserts antigos. Os testes de âmbito comparam com base() (o merge-base com origin/main, regra 8) e só correm na
// branch do ticket (regra 9): depois do merge a main já contém a mudança e o teste deixaria de fazer sentido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, projeto, apaga, learn, LEARN } from './helpers.mjs';
import { base } from '../_comum/base.mjs';
import { soNoTicket } from '../_comum/ambito.mjs';

const gitRoot = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, 'git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };

test('ÂMBITO: a lista de scripts/scaffold.test.mjs só ganha `.claude/learn.mjs` (nenhuma linha tirada, nenhuma outra acrescentada)', (t) => {
  if (soNoTicket(t, 'f-22b')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const d = gitRoot('diff', '-U0', b, '--', 'scripts/scaffold.test.mjs').split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
  assert.deepEqual(d.filter((l) => l.startsWith('-')), [], 'linhas tiradas do scaffold.test.mjs');
  const mais = d.filter((l) => l.startsWith('+'));
  assert.ok(mais.length >= 1, 'a lista do scaffold.test.mjs não ganhou .claude/learn.mjs');
  for (const l of mais) assert.match(l, /^\+\s*'\.claude\/learn\.mjs',?\s*$/, 'linha acrescentada que não é a de .claude/learn.mjs: ' + l);
});

test('ÂMBITO: nenhum ataque de outro ticket (tests/critico/* fora de f-22b-r0) mudou', (t) => {
  if (soNoTicket(t, 'f-22b')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const mudou = gitRoot('diff', '--name-only', b, '--', 'tests/critico').split(/\r?\n/).filter(Boolean).filter((f) => !f.startsWith('tests/critico/f-22b-r0/'));
  assert.deepEqual(mudou, [], 'ataques antigos alterados');
});

test('C1–C6 [ataque]: o scaffold copia .claude/learn.mjs para o projeto gerado e ele corre na raiz (report num registo vazio)', async () => {
  const P = await projeto();
  try {
    assert.ok(existsSync(join(P, LEARN)), 'o projeto gerado não tem ' + LEARN);
    const r = learn(P, ['report']);
    assert.equal(r.status, 0, r.out);
  } finally { apaga(P); }
});