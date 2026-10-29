// F-02 critério 3: uma mutação que não faz falhar a sua linha faz falhar o teste, com o nome da mutação.
// Ataque sem depender do autoteste do dev: numa cópia do pacote, o check.cjs do template deixa de falhar uma linha (ou todas),
// ou o texto a procurar de uma mutação deixa de existir; o corpus.test.mjs tem de falhar e nomear as mutações afetadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { CORPUS, CHECK_TEMPLATE, CHK_HEAD, loadCorpus, copyPackage, runHarness, harnessPrecondition } from './helpers.mjs';

const neuter = (dir, cond) => {
  const f = join(dir, CHECK_TEMPLATE);
  const src = readFileSync(f, 'utf8');
  assert.ok(src.includes(CHK_HEAD), 'o ataque não encontrou a função chk no check.cjs do template');
  writeFileSync(f, src.replace(CHK_HEAD, CHK_HEAD + `\n  if (${cond}) { console.log('ok    ' + name); return }`));
};

test('C3 oráculo: com a linha da 1.ª mutação neutralizada no check.cjs, o corpus falha e nomeia essa mutação', async () => {
  harnessPrecondition(assert);
  const dir = copyPackage();
  const [first] = await loadCorpus('mutations', dir);
  assert.ok(first, 'corpus de mutações vazio');
  neuter(dir, `name.startsWith(${JSON.stringify(first.value.line)})`);
  const r = runHarness(dir);
  assert.notEqual(r.status, 0, 'o corpus passou com uma mutação sem verificação');
  assert.ok(r.out.includes(first.name), 'a falha não nomeia a mutação ' + first.name + '\n' + r.out.slice(-2000));
});

test('C3 oráculo: com um check.cjs que nunca falha, o corpus falha e nomeia todas as mutações', async () => {
  harnessPrecondition(assert);
  const dir = copyPackage();
  const muts = await loadCorpus('mutations', dir);
  assert.ok(muts.length > 0, 'corpus de mutações vazio');
  neuter(dir, 'true');
  const r = runHarness(dir);
  assert.notEqual(r.status, 0, 'o corpus passou com um check.cjs que nunca falha');
  assert.deepEqual(muts.map((m) => m.name).filter((n) => !r.out.includes(n)), [], 'mutações sem verificação que a falha não nomeia');
});

test('C3 oráculo: uma mutação cujo texto a procurar não existe no ficheiro faz falhar o corpus, com o nome dela', async () => {
  harnessPrecondition(assert);
  const dir = copyPackage();
  const [first] = await loadCorpus('mutations', dir);
  assert.ok(first, 'corpus de mutações vazio');
  const value = { ...first.value, find: '@@critico: este texto não existe em nenhum ficheiro@@' };
  if (extname(first.file) === '.json') writeFileSync(first.file, JSON.stringify(value, null, 2));
  else writeFileSync(first.file, 'export default ' + JSON.stringify(value, null, 2) + ';\n');
  const r = runHarness(dir);
  assert.notEqual(r.status, 0, 'o corpus passou com uma mutação que não muda nada');
  assert.ok(r.out.includes(first.name), 'a falha não nomeia a mutação ' + first.name + '\n' + r.out.slice(-2000));
});
