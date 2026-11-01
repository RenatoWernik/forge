// caso limpo (R1 do crítico, falha 3b): 'git' numa constante e uma fixture {ref} no mesmo bloco
import test from 'node:test';
import assert from 'node:assert/strict';

test('fixture', () => {
  const exe = 'git';
  const fx = { ref: 'abc1234def' };
  assert.ok(exe && fx);
});