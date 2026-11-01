// caso limpo do L4: um filho node --test que corre um ficheiro temporário do próprio teste (estilo f-26 c1), nem o pacote nem outra pasta
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('C1 o helper corre num projeto temporário', () => {
  const d = mkdtempSync(join(tmpdir(), 'l4-'));
  writeFileSync(join(d, 'x.test.mjs'), "import test from 'node:test';\ntest('x', () => {});\n");
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'x.test.mjs'], { cwd: d, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stdout);
});