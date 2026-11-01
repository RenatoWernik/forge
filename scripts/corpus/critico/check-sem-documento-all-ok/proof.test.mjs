import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDocs } from './piece/check.mjs';
const ALL = ['AGENTS.md', 'CLAUDE.md', 'FRAMEWORK.md'];
test('a deleted document fails the check outside the nested copy', () => {
  for (const gone of ['CLAUDE.md', 'FRAMEWORK.md']) {
    const r = checkDocs({ files: ALL.filter((f) => f !== gone), nested: false });
    assert.equal(r.ok, false, gone + ' deleted and the check says All ok.');
    assert.ok(r.lines.some((l) => l.state === 'FAIL'), 'no FAIL line for ' + gone);
  }
});
test('the nested copy without the documents still passes', () => {
  assert.equal(checkDocs({ files: [], nested: true }).ok, true);
});
test('a complete project passes', () => {
  assert.equal(checkDocs({ files: ALL, nested: false }).ok, true);
});
