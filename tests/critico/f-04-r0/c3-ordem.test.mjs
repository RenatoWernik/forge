// F-04 critério 3: a ordem dos passos numerados da skill é verificar a máquina, entrevista, perguntas de setup, hooks, geração,
// painel, bootstrap. Oráculo: os títulos `## N.` extraídos e comparados com a lista literal (resposta 4 do orquestrador na #5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITLES, steps, step, skillText, prose } from './helpers.mjs';

test('C3: os títulos `## N.` da skill são exatamente os 7 da lista literal, numerados de 1 a 7, por esta ordem', () => {
  const lidos = steps().map((x) => `${x.n}. ${x.title}`);
  assert.deepEqual(lidos, TITLES.map((t, i) => `${i + 1}. ${t}`));
});

test('C3: «### Translate the documents» e «### Check» ficam dentro do passo 5', () => {
  const g = step(TITLES[4]);
  assert.ok(g, 'sem o passo ' + TITLES[4]);
  for (const sub of ['### Translate the documents', '### Check']) assert.match(g.body, new RegExp('^' + sub + '\\s*$', 'm'), `${sub} não está dentro de «${TITLES[4]}»`);
});

test('C3: o passo 4 não está vazio e diz que os hooks só se instalam com o sim do utilizador', () => {
  const h = step(TITLES[3]);
  assert.ok(h, 'sem o passo ' + TITLES[3]);
  const corpo = h.body.replace(/^## .*$/m, '').trim();
  assert.ok(corpo.length > 0, 'o passo dos hooks está vazio');
  assert.match(corpo, /\byes\b/i, 'o passo dos hooks não diz que se instalam só com o sim (yes) do utilizador');
});

// As referências cruzadas do texto a passos da própria skill continuam a apontar para o passo certo depois da renumeração.
// Só as formas que o texto de hoje usa; uma redação diferente não é verificada aqui (não é alarme).
test('C3: as referências «step N» da skill apontam para o passo certo depois da renumeração', () => {
  const t = prose(skillText()).replace(/\s+/g, ' ');
  const n = (k) => k + 1; // os passos são os de TITLES, numerados pela ordem (o primeiro teste deste ficheiro verifica)
  const casos = [
    [/language the user chooses in step (\d+)/i, 2, 'a língua escolhe-se nas perguntas de setup'],
    [/so step (\d+) translates/i, 4, 'a tradução é feita no passo da geração'],
    [/offer the `doctor` \(step (\d+)\)/i, 0, 'o doctor é o passo de verificar a máquina'],
  ];
  const errado = [];
  for (const [re, k, porque] of casos) {
    const m = t.match(re);
    if (m && +m[1] !== n(k)) errado.push(`«${m[0]}»: ${porque}, que é o passo ${n(k)}`);
  }
  assert.deepEqual(errado, []);
});
