import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isKebab } from './piece/kebab.mjs';
test('kebab-case names are accepted', () => {
  for (const s of ['config', 'port-race', 'a1-b2', 'x']) assert.equal(isKebab(s), true, s);
});
test('anything else is refused', () => {
  for (const s of ['Bad Class', 'x y', '-a', 'a-', 'a--b', 'Ação', 'a_b', '', null, 7]) assert.equal(isKebab(s), false, String(s));
});
