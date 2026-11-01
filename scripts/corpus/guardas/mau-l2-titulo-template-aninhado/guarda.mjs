// caso mau L2: a interpolação do título contém outro template com interpolação
import test from 'node:test';
import assert from 'node:assert/strict';

const ID = 'f-26';
test(`ÂMBITO: ${`${ID}-x`} só estes ficheiros`, () => {
  assert.ok(ID);
});