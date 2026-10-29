// F-04 critério 5: o frontmatter da skill continua válido. Oráculo: o teste existente (scripts/frontmatter.test.mjs), mais o
// parser dele aplicado à skill nova: name new-project e uma description não vazia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillText, runTests, failures } from './helpers.mjs';

test('C5: node --test scripts/frontmatter.test.mjs passa, com os 3 testes', () => {
  const r = runTests(['scripts/frontmatter.test.mjs'], 120000);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 3, 'passaram ' + r.pass);
});

// (importar o frontmatter.test.mjs correria os testes dele aqui dentro: lê-se o bloco à mão, só o que este critério precisa)
test('C5: o frontmatter da skill new-project tem name new-project e uma description não vazia', () => {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(skillText());
  assert.ok(m, 'sem bloco de frontmatter entre linhas ---');
  assert.match(m[1], /^name: new-project$/m);
  const d = /^description:[ \t]*(.*)$((?:\n[ \t]+.*)*)/m.exec(m[1]);
  assert.ok(d, 'sem description');
  assert.ok((d[1].replace(/^[|>][+-]?$/, '') + d[2]).trim().length > 0, 'description vazia');
});
