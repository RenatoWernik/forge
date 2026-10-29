// F-12, critério 2: para cada fixture, as contagens por estado e a lista de agentes que a página desenha são as do modelo do F-10.
// Oráculo: o leitor do pacote (F-10) sobre o corpus de fixtures (vazio, completo, todos os estados, 0, 1, 9 e 30 agentes, nomes longos,
// acentos e HTML, campos extra) e sobre 30 painéis gerados com a semente 1212; mais dois modelos escritos à mão, independentes do leitor.
// A base de dados falsa devolve a fixture em `painel/estado`. Também a barra: o progresso desenhado é a percentagem do modelo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, comBrowser, testePagina, paginaDe, docsDe, esperado, rng, gerado } from './helpers.mjs';

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

const comparar = async (nome, painel) => {
  const m = await esperado(painel);
  assert.equal(m.erro, undefined, `${nome}: a fixture devia ser válida`);
  await B.abrir(pagina, { docs: docsDe(painel) });
  const v = await B.vista();
  const falhas = [];
  if (v.erro) falhas.push(`erro inesperado: ${v.erro}`);
  if (JSON.stringify(v.contagens) !== JSON.stringify(m.contagens)) falhas.push(`contagens ${JSON.stringify(v.contagens)} ≠ ${JSON.stringify(m.contagens)}`);
  const nomes = (v.agentes ?? []).map((a) => a.nome), esperados = m.agentes.map((a) => a.nome);
  if (JSON.stringify(nomes) !== JSON.stringify(esperados)) falhas.push(`agentes ${JSON.stringify(nomes).slice(0, 300)} ≠ ${JSON.stringify(esperados).slice(0, 300)}`);
  if (v.percentagem !== m.percentagem) falhas.push(`progresso ${v.percentagem} ≠ ${m.percentagem}`);
  if (B.estado.excecoes.length) falhas.push('exceções: ' + B.estado.excecoes.join(' | '));
  return falhas.map((f) => `${nome}: ${f}`);
};

testePagina('C2: modelos escritos à mão: o painel completo e o de todos os estados', async () => {
  await B.abrir(pagina, { docs: docsDe(FIXTURES.base) });
  const v = await B.vista();
  assert.deepEqual(v.contagens, [['main', 1], ['aprovado', 1], ['critico', 1], ['dev', 0], ['reprovado', 0], ['espera', 0], ['falta', 1]]);
  assert.deepEqual(v.agentes.map((a) => a.nome), ['dev-t03', 'critico-t03']);
  assert.equal(v.percentagem, 50);
  await B.abrir(pagina, { docs: docsDe(FIXTURES['todos os estados']) });
  const w = await B.vista();
  assert.deepEqual(w.contagens, [['main', 1], ['aprovado', 1], ['critico', 1], ['dev', 2], ['reprovado', 1], ['espera', 1], ['falta', 3]]);
  assert.equal(w.percentagem, 20);
});

testePagina('C2: cada fixture do corpus dá as contagens, a lista de agentes e o progresso do modelo do F-10', async () => {
  const falhas = [];
  for (const [nome, p] of Object.entries(FIXTURES)) falhas.push(...await comparar(nome, p));
  assert.deepEqual(falhas, []);
});

testePagina('C2: 30 painéis gerados (semente 1212, com < > & " \' acentos e emoji) dão o modelo do F-10', async () => {
  const r = rng(1212), falhas = [];
  for (let i = 0; i < 30; i++) falhas.push(...await comparar(`gerado #${i} (semente 1212)`, gerado(r)));
  assert.deepEqual(falhas, []);
});
