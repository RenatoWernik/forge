// caso mau L1: um sha num template literal de git show
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('C9 o compat.json antigo ainda lê', () => {
  const antigo = JSON.parse(execSync(`git show 645120f:compat.json`, { encoding: 'utf8' }));
  assert.ok(antigo.components);
});
