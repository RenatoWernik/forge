// F-02 critério 2: cada mutação (ficheiro, procurar e substituir, linha) aplicada a uma cópia faz falhar essa linha do check.cjs;
// o corpus começa com pelo menos 5 mutações de invariantes atuais. Verificação independente do harness do dev.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { applySeed } from '../../../scripts/corpus-seed.mjs';
import { CORPUS, loadCorpus, buildProject, check, lineState } from './helpers.mjs';

const FIELDS = ['base', 'file', 'find', 'replace', 'line'];

test('C2: o corpus tem pelo menos 5 mutações, cada uma com base, file, find, replace e line em texto, e find diferente de replace', async () => {
  const muts = await loadCorpus('mutations');
  assert.ok(muts.length >= 5, 'mutações em ' + CORPUS + '/mutations: ' + muts.length);
  for (const m of muts) {
    for (const k of FIELDS) assert.equal(typeof m.value?.[k], 'string', `${m.name}.${k}`);
    for (const k of ['base', 'file', 'find', 'line']) assert.ok(m.value[k].length > 0, `${m.name}.${k} vazio`);
    assert.notEqual(m.value.find, m.value.replace, m.name + ': find igual a replace');
    if (m.value.seed !== undefined) assert.ok(m.value.seed && typeof m.value.seed === 'object' && !Array.isArray(m.value.seed), m.name + '.seed tem de ser um objeto');
  }
});

test('C2: as mutações cobrem pelo menos 5 linhas distintas do check.cjs (5 invariantes, não 5 variações do mesmo)', async () => {
  const lines = new Set((await loadCorpus('mutations')).map((m) => m.value?.line));
  assert.ok(lines.size >= 5, 'linhas distintas: ' + [...lines].join(' | '));
});

test('C2: a base de cada mutação é um conjunto de respostas do corpus', async () => {
  const names = new Set((await loadCorpus('answers')).map((s) => s.name));
  const muts = await loadCorpus('mutations');
  assert.ok(muts.length > 0, 'corpus de mutações vazio ou ausente');
  assert.deepEqual(muts.filter((m) => !names.has(m.value?.base)).map((m) => m.name + ' -> ' + m.value?.base), []);
});

test('C2: cada mutação, aplicada de forma independente a uma cópia, encontra o texto, e a sua linha passa de «ok» a «FAIL»', async () => {
  const sets = Object.fromEntries((await loadCorpus('answers')).map((s) => [s.name, s.value]));
  const muts = await loadCorpus('mutations');
  assert.ok(muts.length > 0, 'corpus de mutações vazio ou ausente');
  for (const { name, value: m } of muts) {
    assert.ok(sets[m.base], name + ': base desconhecida ' + m.base);
    const { dest } = await buildProject(sets[m.base]);
    applySeed(dest, m.seed);
    const before = check(dest);
    assert.equal(lineState(before.out, m.line), 'ok', `${name}: a linha «${m.line}» não está «ok» no projeto sem mutação (nome inexato, ou já falhava)`);
    const file = join(dest, m.file);
    assert.ok(existsSync(file), `${name}: ${m.file} não existe no projeto gerado`);
    const text = readFileSync(file, 'utf8');
    assert.ok(text.includes(m.find), `${name}: o texto a procurar não existe em ${m.file}`);
    writeFileSync(file, text.split(m.find).join(m.replace));
    const after = check(dest);
    assert.equal(after.status, 1, name + ': o check passou depois da mutação');
    assert.equal(lineState(after.out, m.line), 'FAIL', `${name}: a linha «${m.line}» não falhou`);
  }
});
