// caso mau L2: o título ÂMBITO: vem depois de uma interpolação no it(...) de um describe
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const P = 'x';
describe('grupo', () => {
  it(`ÂMBITO: ${P}`, () => { assert.ok(P); });
});