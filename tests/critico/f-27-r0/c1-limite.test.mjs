// F-27 critério 1 (#111): o limite de tempo do corpus (f-14 c8) cresce com o corpus: 60000 ms × max(1, nAgora / nBase).
// Oráculo: a função pura limiteMs(nAgora, nBase), exportada do helper do f-14-r0 (sem efeitos: não cria pastas temporárias).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limiteMs } from '../f-14-r0/limite.mjs';

test('C1: limiteMs(nAgora, nBase) = 60000 × max(1, nAgora / nBase)', () => {
  assert.equal(limiteMs(40, 40), 60000);
  assert.equal(limiteMs(20, 40), 60000);
  assert.equal(limiteMs(60, 40), 90000);
  assert.equal(limiteMs(41, 40), 61500);
});
