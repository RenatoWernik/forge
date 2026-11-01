// caso mau L1: um helper chamado gitR recebe o sha fixo como argumento
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const gitR = (...a) => spawnSync('git', a, { encoding: 'utf8' }).stdout;

test('C9 o compat.json antigo ainda lê', () => {
  assert.ok(JSON.parse(gitR('show', 'a1b2c3d4e5:compat.json')).components);
});
