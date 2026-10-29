// F-01 critério 5: a tabela de componentes dos dois READMEs tem 7 linhas, sem o claude-mem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ABSENCE_TEST, copyPackage, runNodeTest, edit, TERM_RE } from './helpers.mjs';

const READMES = ['README.md', 'README.pt-BR.md'];
const COMPONENTS = [/gauntlet/i, /ai memory/i, /ponytail/i, /\bsdd\b/i, /\btdd\b/i, /matt pocock/i, /graphify/i];

// A secção dos componentes: o título "## ... components/componentes" e a primeira tabela por baixo dele
const section = (text) => {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^## .*\bcomponen(ts|tes)\b/i.test(l));
  assert.ok(h >= 0, 'título da secção dos componentes não encontrado');
  const start = lines.findIndex((l, i) => i > h && l.startsWith('|'));
  let end = start;
  while (end < lines.length && lines[end].startsWith('|')) end++;
  const body = lines.slice(start + 2, end); // sem o cabeçalho nem o separador
  return { heading: lines[h], rows: body.map((l) => l.split('|').slice(1, -1).map((c) => c.trim())) };
};

for (const rel of READMES) {
  test(`C5: a tabela de componentes do ${rel} tem 7 linhas numeradas de 1 a 7, sem o claude-mem`, () => {
    const { rows } = section(readFileSync(join(ROOT, rel), 'utf8'));
    assert.equal(rows.length, 7, rows.map((r) => r[1]).join(', '));
    assert.deepEqual(rows.map((r) => r[0]), ['1', '2', '3', '4', '5', '6', '7']);
    assert.deepEqual(rows.filter((r) => TERM_RE.test(r.join('|'))).map((r) => r[1]), []);
  });

  test(`C5: cada um dos 7 componentes (gauntlet, AI Memory, Ponytail, SDD, TDD, Matt Pocock, Graphify) tem exatamente uma linha no ${rel}`, () => {
    const { rows } = section(readFileSync(join(ROOT, rel), 'utf8'));
    for (const re of COMPONENTS) assert.equal(rows.filter((r) => re.test(r[1])).length, 1, re + ' em ' + rows.map((r) => r[1]).join(', '));
  });

  test(`C5: o título da secção do ${rel} diz o mesmo número que a tabela (7)`, () => {
    const { heading } = section(readFileSync(join(ROOT, rel), 'utf8'));
    assert.match(heading, /\b7\b/, heading);
  });
}

// Oráculo do dev: o teste de ausência conta as linhas das duas tabelas
const precondition = () => {
  assert.ok(existsSync(join(ROOT, ABSENCE_TEST)), 'pré-condição: ' + ABSENCE_TEST + ' não existe');
  const clean = runNodeTest(copyPackage(), ABSENCE_TEST);
  assert.equal(clean.status, 0, 'pré-condição: o teste de ausência tem de passar numa cópia limpa\n' + clean.out.slice(-1500));
};
const addRow = (t) => t.replace(/^(\| 7 \|.*)$/m, '$1\n| 8 | Extra | Componente a mais | [x/y](https://example.com) |');
const dropRow = (t) => t.replace(/^\| 7 \|.*\r?\n/m, '');

for (const rel of READMES) {
  test(`C5 oráculo: uma 8.ª linha na tabela do ${rel} faz falhar o teste de ausência`, () => {
    precondition();
    const dir = copyPackage();
    edit(dir, rel, addRow);
    assert.match(readFileSync(join(dir, rel), 'utf8'), /^\| 8 \| Extra/m, 'o ataque não plantou a linha');
    assert.notEqual(runNodeTest(dir, ABSENCE_TEST).status, 0, 'o teste aceitou 8 linhas no ' + rel);
  });
  test(`C5 oráculo: uma tabela do ${rel} com 6 linhas faz falhar o teste de ausência`, () => {
    precondition();
    const dir = copyPackage();
    edit(dir, rel, dropRow);
    assert.doesNotMatch(readFileSync(join(dir, rel), 'utf8'), /^\| 7 \|/m, 'o ataque não tirou a linha');
    assert.notEqual(runNodeTest(dir, ABSENCE_TEST).status, 0, 'o teste aceitou 6 linhas no ' + rel);
  });
}
