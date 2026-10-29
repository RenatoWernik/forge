// F-05 critério 3: o FRAMEWORK.md tem a tabela dos dois modos com os valores literais, e o check.cjs falha (linha «mode») quando o
// mode do forge.json não tem coluna na tabela.
// Oráculo:
//   - a tabela do ticket, na versão inglesa do template (leitura minha dos literais, PERGUNTA 1 na #6): uma tabela Markdown cujo
//     cabeçalho tem uma coluna «rigorous» e outra «accelerated» (os valores do mode do forge.json), e as 6 linhas com os valores:
//       rounds       3 | 2
//       tests        full suite 1× on the 1st delivery | area and Round −1 1×
//       batch        up to 3 | up to 5
//       regression   suite 2× and E2E 3× | suite 2× and E2E 3×
//       blind        two orders | one order, a tie passes
//       never relax  secrets, security, data loss, false alarms or charges, regressions | o mesmo (ou «same»/«idem»)
//   - mutações: o mode do forge.json fora da tabela (en e pt) e a coluna do próprio modo renomeada no cabeçalho (en, os dois modos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { COMBOS, ANSWERS, ANSWERS_PT, generate, check, lineState, fails, edit } from './helpers.mjs';

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/[`*]/g, '').trim());
// A tabela dos modos: o bloco de linhas «|...|» cujo cabeçalho tem «rigorous» e «accelerated»
export const modeTable = (text) => {
  const lines = text.split(/\r?\n/);
  const h = lines.findIndex((l) => /^\s*\|/.test(l) && /\brigorous\b/.test(l) && /\baccelerated\b/.test(l));
  if (h < 0) return undefined;
  const rows = [];
  for (let i = h + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
  const head = cells(lines[h]);
  return { header: h, rig: head.findIndex((c) => /\brigorous\b/.test(c)), acc: head.findIndex((c) => /\baccelerated\b/.test(c)), rows };
};

const X = '\\s?[×x]';
const NEVER = [/secrets/i, /security/i, /data loss/i, /false alarms/i, /charges/i, /regressions/i];
const ROWS = [
  ['tests', (l) => /test/i.test(l), (r) => /full suite/i.test(r) && new RegExp('1' + X).test(r) && /(1st|first) delivery/i.test(r), (a) => /area/i.test(a) && /Round\s?[−-]1/.test(a) && new RegExp('1' + X).test(a)],
  ['rounds', (l) => /round/i.test(l) && !/test/i.test(l), (r) => r === '3', (a) => a === '2'],
  ['batch', (l) => /batch/i.test(l) && !/regression/i.test(l), (r) => /up to 3\b/i.test(r), (a) => /up to 5\b/i.test(a)],
  ['regression', (l) => /regression/i.test(l), ...Array(2).fill((c) => new RegExp('suite 2' + X).test(c) && new RegExp('E2E 3' + X).test(c))],
  ['blind', (l) => /blind/i.test(l), (r) => /two orders/i.test(r), (a) => /one order/i.test(a) && /tie/i.test(a)],
  ['never relaxes', (l) => /never relax/i.test(l), (r) => NEVER.every((re) => re.test(r)), (a) => /^(same|idem|ditto)\b/i.test(a) || NEVER.every((re) => re.test(a))],
];

for (const [name, answers] of COMBOS) {
  test(`C3 ${name}: o FRAMEWORK.md gerado tem a tabela dos dois modos com os valores literais`, async () => {
    const { raw } = await generate(answers);
    const t = modeTable(raw['FRAMEWORK.md']);
    assert.ok(t, 'não há tabela com as colunas «rigorous» e «accelerated»');
    const bad = [];
    for (const [row, isRow, okRig, okAcc] of ROWS) {
      const r = t.rows.find((c) => isRow(c[0]));
      if (!r) { bad.push(`falta a linha «${row}»`); continue; }
      if (!okRig(r[t.rig] ?? '')) bad.push(`«${row}» rigorous: «${r[t.rig]}»`);
      if (!okAcc(r[t.acc] ?? '')) bad.push(`«${row}» accelerated: «${r[t.acc]}»`);
    }
    assert.deepEqual(bad, []);
  });

  test(`C3 ${name}: a linha «mode» do check.cjs existe e está ok no projeto sem mutação`, async () => {
    const { dest } = await generate(answers);
    const r = check(dest);
    assert.equal(lineState(r.out, 'mode'), 'ok', fails(r.out) || 'não há linha «mode»');
  });
}

for (const [name, answers] of [['en', ANSWERS()], ['pt', ANSWERS_PT({ mode: 'accelerated' })]]) {
  test(`C3 mutação (${name}): um mode do forge.json sem coluna na tabela («turbo») faz falhar a linha «mode»`, async () => {
    const { dest } = await generate(answers);
    const f = join(dest, '.claude/forge.json');
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), mode: 'turbo' }, null, 2));
    const r = check(dest);
    assert.equal(lineState(r.out, 'mode'), 'FAIL', fails(r.out));
    assert.equal(r.status, 1);
  });
}

for (const [mode, word] of [['rigorous', 'rigorous'], ['accelerated', 'accelerated']]) {
  test(`C3 mutação (en, ${mode}): a coluna «${word}» renomeada no cabeçalho da tabela faz falhar a linha «mode»`, async () => {
    const { dest } = await generate(ANSWERS({ mode }));
    edit(dest, 'FRAMEWORK.md', (text) => {
      const t = modeTable(text);
      if (!t) throw new Error('não há tabela dos modos (pré-condição)');
      const lines = text.split(/\r?\n/);
      lines[t.header] = lines[t.header].replace(new RegExp('\\b' + word + '\\b', 'g'), 'relaxed');
      return lines.join('\n');
    });
    const r = check(dest);
    assert.equal(lineState(r.out, 'mode'), 'FAIL', fails(r.out));
    assert.equal(r.status, 1);
  });
}
