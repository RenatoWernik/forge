// F-04 critério 1: a skill descreve a entrevista com as 5 dimensões (termos exatos), a certeza declarada por dimensão em cada
// pergunta e a regra de paragem. Oráculo: os literais, procurados no passo «## 2. Interview», não em qualquer sítio do ficheiro.
// Os 5 termos vêm do corpo da #5; as duas frases são as da resposta 3 do orquestrador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interview, skillText, flat } from './helpers.mjs';

const DIMENSOES = ['UI rica', 'lógica e servidor', 'riscos (segredos, dados, dinheiro, segurança)', 'dimensão e prazo', 'quota'];
const CERTEZA = 'State your certainty for each dimension as a percentage.';
const PARAGEM = 'Stop asking when every dimension is at 95 % or more, or when the user says "enough" ("chega").';

const secao = () => {
  const s = interview();
  assert.ok(s, 'a skill não tem o passo `## N. Interview`');
  return flat(s.body);
};

test('C1: o passo da entrevista tem cada uma das 5 dimensões com o termo exato do contrato', () => {
  const body = secao();
  assert.deepEqual(DIMENSOES.filter((d) => !body.includes(d)), [], 'termos em falta no passo da entrevista');
});

test('C1: o passo da entrevista manda declarar a certeza por dimensão, com a frase literal', () => {
  assert.ok(secao().includes(CERTEZA), 'falta, no passo da entrevista, a frase: ' + CERTEZA);
});

test('C1: o passo da entrevista tem a regra de paragem, com a frase literal', () => {
  assert.ok(secao().includes(PARAGEM), 'falta, no passo da entrevista, a frase: ' + PARAGEM);
});

test('C1: a versão mínima do F-03 saiu (a entrevista completa substitui-a)', () => {
  const t = flat(skillText());
  assert.ok(!/full interview comes with a later release/i.test(t), 'a skill ainda diz que a entrevista completa vem numa versão futura');
  assert.ok(!/ask for these five and nothing more/i.test(t), 'a skill ainda manda perguntar só os cinco papéis e mais nada');
});
