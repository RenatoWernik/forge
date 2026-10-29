// F-05 critério 4: o FRAMEWORK.md descreve a Ronda −1 como «TDD em dois ciclos»: o ciclo de aceitação, de fora, com os ataques do
// crítico; o ciclo de dentro, com a skill `tdd` (uma seam, um teste, vermelho e depois verde). Cita a skill `tdd` e explica porque
// é que isto não é o «fatiar na horizontal» que a skill proíbe.
// Oráculo: as frases-chave literais, na versão inglesa do template (resposta 1 do orquestrador na #6), todas na mesma secção do
// FRAMEWORK.md gerado (do título anterior ao seguinte) que contém «TDD in two loops», o mesmo título do invariante 5 do CLAUDE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBOS, generate, sectionAt } from './helpers.mjs';

const KEYS = [
  ['Round −1', /Round\s?[−-]1/], ['acceptance', /acceptance/i], ['outer', /\b(outer|outside)\b/i], ['inner', /\b(inner|inside)\b/i],
  ['critic', /critic/i], ['attacks', /attacks?/i], ['a skill `tdd`', /`(mattpocock-skills:)?tdd`/],
  ['one seam', /one seam/i], ['one test', /one test/i], ['red', /\bred\b/i], ['green', /\bgreen\b/i], ['horizontal slicing', /horizontal slic/i],
];

for (const [name, answers] of COMBOS) {
  test(`C4 ${name}: a secção «TDD in two loops» do FRAMEWORK.md gerado tem as frases-chave da Ronda −1`, async () => {
    const { raw } = await generate(answers);
    const lines = raw['FRAMEWORK.md'].split(/\r?\n/);
    const i = lines.findIndex((l) => l.includes('TDD in two loops'));
    assert.ok(i >= 0, 'o FRAMEWORK.md não tem «TDD in two loops»');
    const s = sectionAt(raw['FRAMEWORK.md'], i);
    assert.deepEqual(KEYS.filter(([, re]) => !re.test(s)).map(([k]) => k), [], 'frases-chave em falta na secção');
  });
}
