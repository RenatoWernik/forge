// F-12 (brief da Ronda −1 e resposta 2): os estados «sem sinal» e «parado?» na página. A página só lê o documento `painel/vida`
// ({ t, agentes: { <nome>: { minutos, vida } } }), que o orquestrador ou o utilitário do F-10 escreve logo a seguir a `painel/estado`,
// calculado pelo leitor partilhado a partir dos mtimes. A ponte reexporta a função do pacote que o calcula (docsVida).
// Oráculo: a tabela de limiares do F-10 (0, 9:59, 10, 29, 29:59, 30 e 31 min, um mtime no futuro e um checkpoint sem ficheiro).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comBrowser, testePagina, paginaDe, docsDe, docVida, base, api, esperado, AGORA, MIN } from './helpers.mjs';

const TABELA = [0, 9 * MIN + 59900, 10 * MIN, 29 * MIN, 29 * MIN + 59900, 30 * MIN, 31 * MIN, -5 * MIN];
const painel = () => {
  const p = base();
  p.agentes = TABELA.map((_, i) => ({ nome: 'a' + i, papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint: `c${i}.md` }));
  p.agentes.push({ nome: 'sem-ficheiro', papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint: 'sem.md' });
  return p;
};
const MTIMES = Object.fromEntries(TABELA.map((ms, i) => [`c${i}.md`, AGORA - ms]));

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

test('C12: a docsVida da ponte dá o documento painel/vida da resposta 2: { t, agentes: { <nome>: { minutos, vida } } }, igual ao leitor', async () => {
  const u = await api();
  assert.equal(typeof u.docsVida, 'function', 'a ponte não exporta docsVida (resposta 2)');
  const docs = u.docsVida(JSON.stringify(painel()), MTIMES, AGORA);
  assert.deepEqual(Object.keys(docs), ['painel/vida']);
  const esperadoDoc = (await docVida(painel(), MTIMES))['painel/vida'];
  assert.equal(typeof docs['painel/vida'].t, 'string', 'falta o t');
  assert.deepEqual(docs['painel/vida'].agentes, esperadoDoc.agentes);
});

testePagina('C12: com painel/vida, a página mostra ativo, sem sinal, parado? e a começar como o leitor, nos limiares de 10 e 30 min', async () => {
  const p = painel();
  const m = await esperado(p, MTIMES);
  await B.abrir(pagina, { docs: { ...docsDe(p), ...await docVida(p, MTIMES) } });
  const v = await B.vista();
  assert.deepEqual(v.agentes.map((a) => [a.nome, a.vida]), m.agentes.map((a) => [a.nome, a.vida]));
});

testePagina('C12: a vida muda ao vivo quando painel/vida muda (o agente a0 passa de ativo a parado?)', async () => {
  const p = painel();
  await B.abrir(pagina, { docs: { ...docsDe(p), ...await docVida(p, MTIMES) } });
  const depois = (await docVida(p, { ...MTIMES, 'c0.md': AGORA - 45 * MIN }))['painel/vida'];
  await B.avaliar(`window.__fake.definir('painel/vida', ${JSON.stringify(depois)})`);
  const v = await B.esperarVista((x) => x.agentes?.[0]?.vida === 'parado?', 3000);
  assert.equal(v.agentes?.[0]?.vida, 'parado?');
});
