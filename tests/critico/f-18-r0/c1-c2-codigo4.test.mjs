// F-18 critérios 1 e 2 (#60; ATAQUES: vermelhos na base 0c1bfae).
// Oráculos:
//   - C1: na secção «## 1. Check the machine» de skills/new-project/SKILL.md (do título ao `## ` seguinte), a frase C1_FRASE aparece
//     exatamente 1 vez, e depois do fecho do bloco ```bash que corre o `update.mjs --check`;
//   - C2: em templates/BOOTSTRAP.md, o trecho C2_NOVO aparece 1 vez e o C2_ANTIGO 0 vezes (o scaffold em inglês continua a passar no
//     check.cjs: já o verificam as suítes f-14-r0 e scripts, que estão na barra de regressão).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ler, conta, C1_FRASE, C2_ANTIGO, C2_NOVO } from './helpers.mjs';

const TITULO = '## 1. Check the machine';
const seccao = (t) => { const i = t.indexOf('\n' + TITULO + '\n'); if (i < 0) return null; const j = t.indexOf('\n## ', i + TITULO.length + 2); return t.slice(i, j < 0 ? undefined : j); };

test('C1 a frase do código 4 aparece exatamente 1 vez na secção «## 1. Check the machine» do new-project', () => {
  const s = seccao(ler('skills/new-project/SKILL.md'));
  assert.ok(s, 'o new-project perdeu a secção «## 1. Check the machine»');
  assert.equal(conta(s, C1_FRASE), 1, `a frase aparece ${conta(s, C1_FRASE)} vezes na secção`);
});

test('C1 a frase vem depois do fecho do bloco bash que corre o update.mjs --check', () => {
  const s = seccao(ler('skills/new-project/SKILL.md'));
  assert.ok(s, 'o new-project perdeu a secção «## 1. Check the machine»');
  const bloco = [...s.matchAll(/^```bash\n([\s\S]*?)^```$/gm)].find((m) => /update\.mjs"?\s+--check\b/.test(m[1]));
  assert.ok(bloco, 'a secção já não tem o bloco ```bash com o update.mjs --check');
  const fecho = bloco.index + bloco[0].length;
  const i = s.indexOf(C1_FRASE);
  assert.ok(i >= 0, 'a frase não está na secção');
  assert.ok(i > fecho, `a frase está na posição ${i}, antes do fecho do bloco bash (${fecho})`);
});

test('C2 o BOOTSTRAP.md tem o trecho novo 1 vez e o antigo 0 vezes', () => {
  const t = ler('templates/BOOTSTRAP.md');
  assert.equal(conta(t, C2_NOVO), 1, `o trecho novo aparece ${conta(t, C2_NOVO)} vezes`);
  assert.equal(conta(t, C2_ANTIGO), 0, `o trecho antigo aparece ${conta(t, C2_ANTIGO)} vezes`);
});