// Renderização em texto a 40, 80 e 120 colunas (pedido da Ronda −1). O contrato não fixa uma renderização em texto testável
// fora do motor (a vista do mod é uma árvore de Box/Text desenhada pelo motor) nem um comportamento a larguras estreitas;
// por isso estes ataques ficam em `todo` até a PERGUNTA 4 ser respondida. Se a resposta for «sim», a ponte passa a exportar
// texto(modelo, largura) -> string e estes testes perdem o `todo`.
// Oráculo proposto: nenhuma linha passa da largura (contada em pontos de código, os emojis contam 2) e, para cada agente,
// o ticket, o modelo, o estado (ativo/sem sinal/parado?/a começar) e os minutos aparecem, ainda que cortados no fim da linha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, projeto, runtime, CORPUS, AGORA } from './helpers.mjs';

const largura = (l) => [...l].reduce((n, c) => n + (/\p{Extended_Pictographic}/u.test(c) ? 2 : 1), 0);
const CASOS = ['vazio', 'completo', 'agente sem sinal e parado?', '9 agentes', '30 agentes', 'nomes longos e acentos', 'campo inválido', 'painel ausente'];

for (const L of [40, 80, 120]) {
  test(`C7 (PERGUNTA 4): a ${L} colunas nenhuma linha passa da largura e cada agente mostra estado e minutos`, { todo: 'PERGUNTA 4 da Ronda −1, por responder' }, async () => {
    const u = await api();
    assert.equal(typeof u.texto, 'function', 'a ponte não exporta texto(modelo, largura)');
    for (const nome of CASOS) {
      const p = projeto(CORPUS()[nome]);
      const m = await u.dados(runtime({ raiz: p.raiz }).$, AGORA);
      const t = u.texto(m, L);
      for (const l of t.split(/\r?\n/)) assert.ok(largura(l) <= L, `${nome}: ${largura(l)} > ${L}: ${l}`);
      if (m.erro) assert.match(t, /⚠|erro|error|inválid|invalid|missing|ausente/i, nome + ': o erro não aparece');
      for (const a of m.agentes ?? []) assert.ok(t.includes(a.vida), `${nome}: falta o estado ${a.vida} de ${a.nome}`);
    }
  });
}
