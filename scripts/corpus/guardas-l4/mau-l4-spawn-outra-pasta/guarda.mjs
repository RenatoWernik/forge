// caso mau do L4: volta a correr num filho node --test os ataques de outra pasta (tests/critico/f-01-r0), em vez de ler o resultado do lote
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('regressão: os ataques da Ronda −1 do F-01 continuam verdes', () => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/critico/f-01-r0/c1-doctor-grupos.test.mjs'], { encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, r.stdout);
});