// F-04 critério 3: a ordem dos passos numerados da skill é verificar a máquina, entrevista, perguntas de setup, hooks, geração,
// painel, bootstrap. Oráculo: os títulos `## N.` extraídos e comparados com a lista literal (PERGUNTA 4: o contrato dá a lista
// em português e a skill está em inglês; até à resposta, cada título é reconhecido por um padrão bilingue em helpers.ORDER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, steps, skillText, prose } from './helpers.mjs';

test('C3: há exatamente 7 passos `## N.`, numerados de 1 a 7 sem saltos', () => {
  const s = steps();
  assert.deepEqual(s.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7], 'títulos: ' + s.map((x) => `${x.n}. ${x.title}`).join(' | '));
});

test('C3: os títulos seguem a ordem do contrato, e cada título só corresponde ao seu passo', () => {
  const s = steps();
  const lidos = s.map((x) => ORDER.filter(([, re]) => re.test(x.title)).map(([nome]) => nome));
  const esperado = ORDER.map(([nome]) => [nome]);
  assert.deepEqual(lidos, esperado, 'títulos: ' + s.map((x) => `${x.n}. ${x.title}`).join(' | '));
});

test('C3: o passo dos hooks existe já, como lugar reservado (o F-13 escreve as perguntas)', () => {
  const h = steps().find((x) => ORDER[3][1].test(x.title));
  assert.ok(h, 'sem passo de hooks');
  assert.ok(h.body.replace(/^## .*$/m, '').trim().length > 0, 'o passo dos hooks está vazio: diz ao orquestrador o que fazer nele');
});

// As referências cruzadas do texto a passos da própria skill continuam a apontar para o passo certo depois da renumeração.
// Só as formas que o texto de hoje usa; uma redação diferente não é verificada aqui (não é alarme).
test('C3: as referências «step N» da skill apontam para o passo certo depois da renumeração', () => {
  const t = prose(skillText());
  const idx = (k) => steps().find((x) => ORDER[k][1].test(x.title))?.n;
  const casos = [
    [/language the user chooses in step (\d+)/i, 2, 'a língua escolhe-se nas perguntas de setup'],
    [/so step (\d+) translates/i, 4, 'a tradução é feita no passo da geração'],
    [/offer the `doctor` \(step (\d+)\)/i, 0, 'o doctor é o passo de verificar a máquina'],
  ];
  const errado = [];
  for (const [re, k, porque] of casos) {
    const m = t.match(re);
    if (m && +m[1] !== idx(k)) errado.push(`«${m[0]}»: ${porque}, que é o passo ${idx(k)}`);
  }
  assert.deepEqual(errado, []);
});
