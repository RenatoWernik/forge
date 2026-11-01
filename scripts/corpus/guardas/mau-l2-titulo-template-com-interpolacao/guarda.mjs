// caso mau L2 (R2 do crítico): o título ÂMBITO: é um template com interpolação e o teste não chama soNoTicket
import test from 'node:test';
import assert from 'node:assert/strict';

const ID = 'f-26';
test(`ÂMBITO: ${ID} só estes ficheiros`, () => {
  assert.ok(ID);
});