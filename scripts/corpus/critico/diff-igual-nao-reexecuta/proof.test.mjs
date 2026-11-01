import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unchanged } from './piece/unchanged.mjs';
const H = 'd'.repeat(64);
test('two equal valid hashes are an unchanged diff', () => {
  assert.equal(unchanged(H, H), true);
});
test('different, absent or invalid hashes are never an unchanged diff', () => {
  assert.equal(unchanged(H, 'e'.repeat(64)), false);
  for (const bad of [undefined, null, '', 'x', 'D'.repeat(64), 'd'.repeat(63)]) { assert.equal(unchanged(bad, bad), false, String(bad)); assert.equal(unchanged(H, bad), false, String(bad)); }
});
