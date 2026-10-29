// F-02 critério 5: o harness e os ficheiros do corpus só importam a biblioteca padrão do Node (prefixo node:) ou ficheiros relativos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { ROOT, HARNESS, CORPUS, walk, copyPackage, runHarness, harnessPrecondition } from './helpers.mjs';

const SPEC = [
  /\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const specs = (src) => SPEC.flatMap((re) => [...src.matchAll(re)].map((m) => m[1]));
const outside = (root) => [join(root, HARNESS), ...walk(join(root, CORPUS)).filter((f) => ['.mjs', '.js', '.cjs'].includes(extname(f)))]
  .filter(existsSync)
  .flatMap((f) => specs(readFileSync(f, 'utf8')).filter((s) => !s.startsWith('node:') && !s.startsWith('.')).map((s) => relative(root, f) + ': ' + s));

test('C5: o harness existe e importa algo da biblioteca padrão (o varrimento não é vazio)', () => {
  assert.ok(existsSync(join(ROOT, HARNESS)), HARNESS + ' não existe');
  assert.ok(specs(readFileSync(join(ROOT, HARNESS), 'utf8')).some((s) => s.startsWith('node:')), 'nenhum import node: no harness');
});

test('C5: nenhum import, require ou export from fora de node: ou de um caminho relativo, no harness e no corpus', () => {
  assert.ok(existsSync(join(ROOT, HARNESS)), HARNESS + ' não existe');
  assert.deepEqual(outside(ROOT), []);
});

// Oráculo do dev: o varrimento do corpus.test.mjs apanha cada forma de importar um pacote de fora, num ficheiro do corpus que nada importa
const PLANTS = {
  'import de um pacote': "import x from 'lodash';\nexport default x;\n",
  'require sem o prefixo node:': "const fs = require('fs');\nmodule.exports = fs;\n",
  'import só pelo efeito': "import 'chalk';\n",
  'export from': "export { z } from 'zod';\n",
  'import() dinâmico literal': "export const f = () => import('left-pad');\n",
};
for (const [what, src] of Object.entries(PLANTS)) {
  test(`C5 oráculo: ${what} num ficheiro do corpus faz falhar o corpus.test.mjs`, () => {
    harnessPrecondition(assert);
    const dir = copyPackage();
    writeFileSync(join(dir, CORPUS, 'critico-plantado.mjs'), src);
    assert.equal(outside(dir).length, 1, 'o ataque não plantou o import');
    assert.notEqual(runHarness(dir).status, 0, `o varrimento não apanhou: ${what}`);
  });
}
