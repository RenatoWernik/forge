import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalContract } from './piece/local.mjs';
test('legitimate names are not flagged', () => {
  for (const f of ['openapi/v20.yaml', 'fixtures/404.json', 'docs/issues.md', '.github/ISSUE_TEMPLATE/issue.yml']) assert.equal(isLocalContract(f), false, f);
});
test('contract files named in Portuguese are flagged', () => {
  for (const f of ['docs/contrato.md', 'contratos/peca-3.md']) assert.equal(isLocalContract(f), true, f);
});
