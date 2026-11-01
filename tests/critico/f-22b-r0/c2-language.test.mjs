// F-22b critério 2, o salto da linha `language`: a linha passa a saltar a secção `## Learned rules`, como já salta `## graphify` e `## Agent skills`.
// RESPOSTA 6552729846 (prevalece sobre o corpo): o oráculo é uma mutação do PROJETO, não do check.cjs, com dois casos:
//   (a) caso limpo: texto em PT dentro do bloco gerado de learnings, num projeto EN, dá ok na linha `language`;
//   (b) mutação: o mesmo texto PT logo fora do bloco dá FAIL nessa linha.
// «Logo fora» (RESPOSTA 6554223028, ponto 3: o salto é delimitado pelos marcadores): imediatamente antes do cabeçalho `## Learned rules`, numa
// secção nova logo depois do marcador de fim e logo depois do marcador de fim sem cabeçalho novo. O texto PT tem mais de 30 palavras, para ser pontuado.
// (b) fica verde já na base (sem salto nenhum o PT falha sempre): é a guarda de que o salto não engole o que está à volta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projeto, check, apaga, ficheiro, out10, registo, learn, ler, linha, esperaLinha, blocoDe, L_LANG, L_BLOCO, INI, FIM, CAB, ROD, SECAO } from './helpers.mjs';

const PT = [
  'o teste não usa uma porta livre e falha quando há outro servidor na mesma máquina',
  'a sessão fica sem resposta porque o agente não grava o checkpoint depois de cada etapa',
  'o crítico aceita a evidência sem correr o comando e o erro só aparece depois da entrega',
];
const CLASSES = ['porta-fixa', 'checkpoint-em-falta', 'evidencia-declarada'];
const REG = { '2026-10.md': ficheiro('2026-10', PT.map((s, i) => out10(i + 1, 'text', { CLASS: CLASSES[i], SYMPTOM: s, STATUS: 'open' }))) };
// O bloco que o readout escreve para REG (a golden do C2), escrito à mão para que o caso não dependa do readout
const BLOCO = [SECAO, '', INI, CAB, ...PT.map((s, i) => `- E-00${i + 1} \`${CLASSES[i]}\`: ${s} (learnings/2026-10.md)`), ROD, FIM].join('\n') + '\n';
const PROSA = PT.map((s) => s[0].toUpperCase() + s.slice(1) + '.').join(' ');

let P;
const ORIG = {};
before(async () => { P = await projeto(); for (const f of ['CLAUDE.md', 'AGENTS.md']) ORIG[f] = ler(P, f); });
after(() => apaga(P));
const escreveAmbos = (fn) => { for (const f of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(join(P, f), fn(ORIG[f].replace(/\s+$/, '') + '\n', f)); };
const langFail = (r, ficheiro) => {
  esperaLinha(r, L_LANG, 'FAIL');
  assert.ok(linha(r, L_LANG).includes(ficheiro), `a linha language não nomeia ${ficheiro}:\n${linha(r, L_LANG)}`);
};

test('C2 GUARDA: o projeto EN gerado, sem bloco, tem a linha language ok', () => {
  registo(P, {});
  escreveAmbos((t) => t);
  esperaLinha(check(P), L_LANG, 'ok');
});

test('C2 (a) [ataque]: PT dentro do bloco gerado (escrito à mão, igual à golden) num projeto EN: a linha language fica ok', () => {
  registo(P, REG);
  escreveAmbos((t) => t + '\n' + BLOCO);
  esperaLinha(check(P), L_LANG, 'ok');
});

test('C2 (a) [ataque]: PT dentro do bloco que o próprio readout escreve: language ok e a linha do bloco ok', () => {
  registo(P, REG);
  escreveAmbos((t) => t);
  const r = learn(P, ['readout']);
  assert.equal(r.status, 0, r.out);
  assert.ok(blocoDe(ler(P, 'CLAUDE.md')), 'o readout não escreveu o bloco');
  const c = check(P);
  esperaLinha(c, L_LANG, 'ok');
  esperaLinha(c, L_BLOCO, 'ok');
});

test('C2 (b) GUARDA: o mesmo PT logo ANTES do cabeçalho `## Learned rules` dá FAIL na linha language (CLAUDE.md)', () => {
  registo(P, REG);
  for (const f of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(join(P, f), ORIG[f].replace(/\s+$/, '') + '\n' + (f === 'CLAUDE.md' ? '\n' + PROSA + '\n' : '') + '\n' + BLOCO);
  langFail(check(P), 'CLAUDE.md');
});

test('C2 (b) GUARDA: o mesmo PT numa secção logo DEPOIS do marcador de fim dá FAIL na linha language (AGENTS.md)', () => {
  registo(P, REG);
  for (const f of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(join(P, f), ORIG[f].replace(/\s+$/, '') + '\n\n' + BLOCO + (f === 'AGENTS.md' ? '\n## Notas\n\n' + PROSA + '\n' : ''));
  langFail(check(P), 'AGENTS.md');
});
// RESPOSTA 6554223028, ponto 3: o salto é delimitado pelos marcadores, não pelo cabeçalho
test('C2 (b) GUARDA: o mesmo PT logo DEPOIS do marcador de fim, sem cabeçalho novo (ainda na secção `## Learned rules`), dá FAIL (CLAUDE.md)', () => {
  registo(P, REG);
  for (const f of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(join(P, f), ORIG[f].replace(/\s+$/, '') + '\n\n' + BLOCO + (f === 'CLAUDE.md' ? '\n' + PROSA + '\n' : ''));
  langFail(check(P), 'CLAUDE.md');
});