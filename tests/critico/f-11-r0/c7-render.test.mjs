// Resposta 4 do orquestrador (#12): o painel em texto, texto(modelo, largura), a 40, 80 e 120 colunas.
//   - nenhuma linha passa da largura;
//   - o que não cabe é cortado com «…»;
//   - aparecem sempre as contagens por estado e o nome de cada agente, cortado se for preciso;
//   - aparece a mensagem de erro quando o modelo tem `erro`.
// Resposta 7: não se mostram tokens nesta fatia.
// Oráculo fechado (fixado pelo crítico a partir da resposta 4; texto simples, sequências ANSI retiradas antes de medir):
//   - largura de uma linha = pontos de código, com cada emoji (Extended_Pictographic) a contar 2;
//   - contagem de um estado com n > 0: uma linha com o número n isolado e um rótulo que começa pelas 3 primeiras letras do
//     estado, sem acentos (mai, apr, cri, dev, rep, esp, fal);
//   - nome de um agente: uma linha com o nome inteiro, ou com os primeiros k caracteres seguidos de «…», k ≥ min(6, comprimento);
//   - erro: uma linha com o erro inteiro, ou com os primeiros k caracteres seguidos de «…», k ≥ min(10, comprimento);
//   - corte com «…»: um nome que não cabe inteiro numa linha aparece cortado com «…» (a regra do nome já o obriga).
// Corpus: todas as fixtures de helpers.mjs (incluindo 30 agentes, nomes longos com acentos e emoji, inválido e ausente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, projeto, runtime, CORPUS, AGORA } from './helpers.mjs';

const semAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '');
const largura = (l) => [...l].reduce((n, c) => n + (/\p{Extended_Pictographic}/u.test(c) ? 2 : 1), 0);
const semAcento = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const presente = (linhas, s, kMin) => linhas.some((l) => l.includes(s)) || linhas.some((l) => {
  for (let k = s.length - 1; k >= Math.min(kMin, s.length); k--) if (l.includes(s.slice(0, k) + '…')) return true;
  return false;
});

const modelos = async (u) => {
  const out = [];
  for (const [nome, caso] of Object.entries(CORPUS())) {
    const p = projeto(caso);
    out.push([nome, await u.dados(runtime({ raiz: p.raiz }).$, AGORA)]);
  }
  return out;
};

for (const L of [40, 80, 120]) {
  test(`C7 (resposta 4): a ${L} colunas, em todas as fixtures, nenhuma linha passa da largura`, async () => {
    const u = await api();
    for (const [nome, m] of await modelos(u)) {
      const t = u.texto(m, L);
      assert.equal(typeof t, 'string', nome);
      for (const l of semAnsi(t).split(/\r?\n/)) assert.ok(largura(l) <= L, `${nome}: ${largura(l)} > ${L}: ${l}`);
    }
  });

  test(`C7 (resposta 4): a ${L} colunas aparecem as contagens por estado, o nome de cada agente (cortado com «…» se preciso) e o erro`, async () => {
    const u = await api();
    for (const [nome, m] of await modelos(u)) {
      const linhas = semAnsi(u.texto(m, L)).split(/\r?\n/);
      const norm = linhas.map(semAcento);
      for (const [estado, n] of m.contagens ?? []) {
        if (n === 0) continue;
        const rot = semAcento(estado).slice(0, 3);
        assert.ok(norm.some((l) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(l) && l.includes(rot)), `${nome}: falta a contagem ${estado} = ${n}`);
      }
      for (const a of m.agentes ?? []) assert.ok(presente(linhas, a.nome, 6), `${nome}: falta o nome do agente ${a.nome.slice(0, 40)}`);
      if (m.erro) assert.ok(presente(linhas, m.erro, 10), `${nome}: falta o erro ${m.erro.slice(0, 60)}`);
      assert.doesNotMatch(linhas.join('\n'), /\btok\b|tokens/i, `${nome}: mostra tokens (fora desta fatia, resposta 7)`);
    }
  });
}

test('C7 (resposta 4): um nome que não cabe é cortado com «…» (nomes longos, 40 colunas)', async () => {
  const u = await api();
  const p = projeto(CORPUS()['nomes longos e acentos']);
  const m = await u.dados(runtime({ raiz: p.raiz }).$, AGORA);
  const linhas = semAnsi(u.texto(m, 40)).split(/\r?\n/);
  const longo = m.agentes.find((a) => a.nome.length > 40).nome;
  assert.ok(linhas.some((l) => /…/.test(l) && [6, 10, 20].some((k) => l.includes(longo.slice(0, k)))), 'o nome longo não aparece cortado com «…»');
});
