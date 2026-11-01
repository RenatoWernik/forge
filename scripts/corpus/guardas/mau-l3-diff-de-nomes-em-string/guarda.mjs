// caso mau L3: o mesmo padrão «só estes ficheiros mudaram», escrito como uma única string de comando e fora de um teste ÂMBITO:
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('C9 GUARDA: só scripts/ mudou', () => {
  const fora = execSync('git diff --name-status origin/main...HEAD', { encoding: 'utf8' }).split('\n').filter((l) => l && !l.includes('scripts/'));
  assert.deepEqual(fora, []);
});
