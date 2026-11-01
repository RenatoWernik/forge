import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validBlock } from './piece/block.mjs';
const CMD = 'node --test';
test('a block with a Unicode space at either end is not valid', () => {
  for (const tail of ['\u00A0', '\u2028', '\uFEFF', '\r']) assert.equal(validBlock(CMD, CMD + ' tests/unit' + tail), false, JSON.stringify(tail));
  assert.equal(validBlock(CMD, '\u00A0' + CMD + ' tests/unit'), false);
});
test('the test command plus a filter, with plain spaces or tabs between the words, is valid', () => {
  assert.equal(validBlock(CMD, CMD + ' tests/unit'), true);
  assert.equal(validBlock(CMD, CMD + ' \t tests/unit'), true);
  assert.equal(validBlock(CMD, 'echo a'), false);
});
