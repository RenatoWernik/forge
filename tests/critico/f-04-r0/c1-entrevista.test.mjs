// F-04 critério 1: a skill descreve a entrevista com as 5 dimensões (termos exatos), a certeza declarada por dimensão em cada
// pergunta e a regra de paragem (todas a 95 %, ou o utilizador diz «chega»). Oráculo: a lista literal dos termos, procurada no
// passo da entrevista (o passo 2 do critério 3), não em qualquer sítio do ficheiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interview, sentences, skillText } from './helpers.mjs';

const DIMENSOES = ['UI rica', 'lógica e servidor', 'riscos (segredos, dados, dinheiro, segurança)', 'dimensão e prazo', 'quota'];

const secao = () => {
  const s = interview();
  assert.ok(s, 'a skill não tem um passo `## N.` de entrevista (interview/entrevista no título)');
  return s.body;
};

test('C1: o passo da entrevista tem cada uma das 5 dimensões com o termo exato do contrato', () => {
  const body = secao();
  assert.deepEqual(DIMENSOES.filter((d) => !body.includes(d)), [], 'termos em falta no passo da entrevista');
});

test('C1: a skill manda declarar a certeza por dimensão em cada pergunta', () => {
  const ss = sentences(secao());
  const hit = ss.find((s) => /certaint|certeza|confian|confiden/i.test(s) && /dimens/i.test(s) && /question|pergunta/i.test(s));
  assert.ok(hit, 'nenhuma frase do passo da entrevista junta certeza + dimensão + pergunta');
  assert.ok(/\b(each|every|cada|todas?)\b/i.test(hit), 'a frase da certeza não diz que é em cada pergunta / por dimensão: ' + hit);
});

test('C1: regra de paragem: todas as dimensões a 95 %, ou o utilizador diz «chega»', () => {
  const ss = sentences(secao());
  const hit = ss.find((s) => /95\s?%/.test(s) && /chega/.test(s));
  assert.ok(hit, 'nenhuma frase do passo da entrevista junta os 95 % e «chega»');
  assert.ok(/\b(all|every|each|todas|cada)\b[^.]*dimens|dimens[^.]*\b(all|every|each|todas|cada)\b/i.test(hit), 'a regra não diz que são todas as dimensões: ' + hit);
  assert.ok(/\b(or|ou)\b/i.test(hit), 'a regra não põe o «chega» como alternativa (ou): ' + hit);
});

test('C1: a versão mínima do F-03 saiu (a entrevista completa substitui-a)', () => {
  const t = skillText();
  assert.ok(!/full interview comes with a later release/i.test(t), 'a skill ainda diz que a entrevista completa vem numa versão futura');
  assert.ok(!/ask for these five and nothing more/i.test(t), 'a skill ainda manda perguntar só os cinco papéis e mais nada');
});
