// F-05: «as mutações no corpus» (âmbito do ticket). Os oráculos dos critérios 1, 2, 3, 5 e 6 são mutações corridas pelo
// `node --test scripts/corpus.test.mjs`; aqui verifica-se que elas existem no corpus versionado (scripts/corpus/mutations), cada
// uma a apontar para a linha do check.cjs que o ticket nomeia. O regressao.test.mjs corre o corpus e prova que todas falham na linha.
//   critério 1: uma mutação da linha «invariants»
//   critério 2: duas da linha «AGENTS.md mirrors CLAUDE.md», uma com file CLAUDE.md e outra com file AGENTS.md
//   critério 3: uma da linha «mode»
//   critério 5: «contrato num ficheiro local»: uma com file FRAMEWORK.md cujo find contém `gh issue view`
//   critério 6: uma da linha «language» com file AGENTS.md e base em português
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus } from './helpers.mjs';

const starts = (line, p) => line === p || [' ', ':', '('].some((c) => line.startsWith(p + c));

test('C7: o corpus de mutações tem as mutações dos critérios 1, 2, 3, 5 e 6, cada uma na sua linha e no seu ficheiro', () => {
  const ms = loadCorpus('mutations').map((m) => m.value);
  const want = [
    ['critério 1: invariants', (m) => starts(m.line, 'invariants')],
    ['critério 2: mirror, file CLAUDE.md', (m) => starts(m.line, 'AGENTS.md mirrors CLAUDE.md') && m.file === 'CLAUDE.md'],
    ['critério 2: mirror, file AGENTS.md', (m) => starts(m.line, 'AGENTS.md mirrors CLAUDE.md') && m.file === 'AGENTS.md'],
    ['critério 3: mode', (m) => starts(m.line, 'mode')],
    ['critério 5: contrato num ficheiro local', (m) => m.file === 'FRAMEWORK.md' && String(m.find).includes('gh issue view')],
    ['critério 6: language, AGENTS.md, base pt', (m) => starts(m.line, 'language') && m.file === 'AGENTS.md' && /^pt/.test(m.base)],
  ];
  assert.deepEqual(want.filter(([, ok]) => !ms.some(ok)).map(([k]) => k), [], 'mutações em falta no corpus');
});
