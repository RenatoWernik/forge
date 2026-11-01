// caso mau L1: as mesmas construções enganosas vêm antes; o sha fixo no git show depois delas tem de ser achado na mesma
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const ASPA = /['"`]/g;
const nome = (x) => `ramo ${x.replace(ASPA, '')} e ${'}'} // não é um comentário`;

test('C9 o compat.json antigo ainda lê', () => {
  assert.ok(nome('x'));
  const r = spawnSync('git', ['show', 'a1b2c3d4e5:compat.json'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});
