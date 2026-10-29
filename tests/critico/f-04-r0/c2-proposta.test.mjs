// F-04 critério 2: a skill manda propor o modo e um modelo e um esforço por papel, com a razão, a partir da tabela literal do
// padrão medido, e tem uma frase que proíbe escolher o modelo sem o sim do utilizador. Oráculo: a tabela e a frase literais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, interview, skillText, tables, cell, flat } from './helpers.mjs';

// A tabela do contrato (issue #5, critério 2), papel → modelo e esforço, à letra
const PADRAO = { developer: 'Haiku xhigh', developerUi: 'Opus high', critic: 'Opus high', tester: 'Haiku xhigh', aux: 'Opus 5.5 high' };

// A tabela da skill com uma linha para cada um dos 5 papéis (primeira célula = o nome do papel, com ou sem crases)
const tabelaPadrao = () => tables(skillText()).find((rows) => ROLES.every((r) => rows.some((row) => cell(row[0]) === r)));

test('C2: a skill tem a tabela do padrão medido, com uma linha por papel', () => {
  const t = tabelaPadrao();
  assert.ok(t, 'nenhuma tabela da skill tem uma linha para cada um dos 5 papéis: ' + ROLES.join(', '));
  for (const r of ROLES) assert.equal(t.filter((row) => cell(row[0]) === r).length, 1, `a tabela tem mais do que uma linha para ${r}`);
});

test('C2: cada linha da tabela diz o modelo e o esforço do contrato, à letra', () => {
  const t = tabelaPadrao();
  assert.ok(t, 'sem a tabela do padrão medido');
  const errado = [];
  for (const r of ROLES) {
    const resto = t.find((row) => cell(row[0]) === r).slice(1).map(cell);
    // aceita o valor numa só célula («Haiku xhigh») ou em duas seguidas («Haiku» | «xhigh»)
    const ok = resto.some((c, i) => c === PADRAO[r] || `${c} ${resto[i + 1] ?? ''}`.trim() === PADRAO[r]);
    if (!ok) errado.push(`${r}: esperado «${PADRAO[r]}», a linha tem ${JSON.stringify(resto)}`);
  }
  assert.deepEqual(errado, []);
});

test('C2: o passo da entrevista manda propor o modo e, para cada papel, um modelo, um esforço e a razão', () => {
  const s = interview();
  assert.ok(s, 'sem passo de entrevista');
  const b = s.body;
  assert.ok(/propos|propor|propõe|recommend|recomend/i.test(b), 'o passo da entrevista não manda propor');
  assert.ok(/\bmode\b|\bmodo\b/i.test(b) && /`rigorous`/.test(b) && /`accelerated`/.test(b), 'a proposta não inclui o modo (`rigorous` / `accelerated`)');
  assert.deepEqual(ROLES.filter((r) => !b.includes('`' + r + '`')), [], 'papéis que o passo da entrevista não nomeia (entre crases)');
  assert.ok(/effort|esforço/i.test(b), 'a proposta não fala do esforço');
  assert.ok(/reason|razão|razões/i.test(b), 'a proposta não fala da razão de cada papel');
});

// Resposta 2 do orquestrador na #5: a frase literal
const PROIBICAO = 'Never choose a model for the user: propose it with its reason and write it to the answers only after the user says yes.';
test('C2: a skill tem a frase literal que proíbe escolher o modelo sem o sim do utilizador', () => {
  assert.ok(flat(skillText()).includes(PROIBICAO), 'falta a frase: ' + PROIBICAO);
});
