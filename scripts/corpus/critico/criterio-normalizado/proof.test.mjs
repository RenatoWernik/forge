import { test } from 'node:test';
import assert from 'node:assert/strict';
import { critKey } from './piece/critkey.mjs';
test('the spellings of one criterion are one key', () => {
  for (const c of ['C1', 'c1', 'C01', 'C001', ' c1 ']) assert.equal(critKey(c), 'C1', c);
  assert.equal(critKey('C12'), 'C12');
});
test('anything else stays as it is, in upper case', () => {
  assert.equal(critKey('bar'), 'BAR');
  assert.equal(critKey('C0'), 'C0');
  assert.equal(critKey('C1a'), 'C1A');
});
