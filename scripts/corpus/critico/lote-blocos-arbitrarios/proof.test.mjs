import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeRuns } from './piece/classify.mjs';
const CMD = 'node --test tests/';
const S = (command, pass) => ({ kind: 'suite', command, pass });
test('blocks that are not the test command do not make a complete run', () => {
  assert.equal(completeRuns(CMD, [S('echo a', 1), S('echo b', 1), S('echo a', 2), S('echo b', 2)]), 0);
});
test('blocks that all start with the test command make a complete run', () => {
  const runs = [1, 2].flatMap((p) => [S(CMD + ' unit', p), S(CMD + ' integ', p)]);
  assert.equal(completeRuns(CMD, runs), 2);
});
test('the whole test command in one block is one run', () => {
  assert.equal(completeRuns(CMD, [S(CMD, 1), S(CMD, 2)]), 2);
});
