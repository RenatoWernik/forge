// F-12 (brief da Ronda −1): os estados «sem sinal» e «parado?» na página. O contrato não diz de onde a página tira a idade de cada
// checkpoint (a cópia do painel.json não a tem; PERGUNTA 2). A ponte diz quais documentos o protocolo escreve para isso
// (docsVida(mtimes)); com eles, a vida e os minutos de cada agente têm de ser os do leitor do F-10 com o mesmo relógio.
// Oráculo: a tabela de limiares do F-10 (0, 9:59, 10, 29, 29:59, 30 e 31 min, um mtime no futuro e um checkpoint sem ficheiro).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sessao, paginaDe, docsDe, base, api, esperado, AGORA, MIN } from './helpers.mjs';

const TABELA = [0, 9 * MIN + 59900, 10 * MIN, 29 * MIN, 29 * MIN + 59900, 30 * MIN, 31 * MIN, -5 * MIN];

let B, pagina;
before(async () => { B = await sessao(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

test('C12: a página mostra ativo, sem sinal, parado? e a começar como o leitor, nos limiares de 10 e 30 min', async () => {
  const u = await api();
  assert.equal(typeof u.docsVida, 'function', 'PERGUNTA 2 sem resposta: a ponte não diz de onde a página lê a idade dos checkpoints (docsVida)');
  const p = base();
  p.agentes = TABELA.map((_, i) => ({ nome: 'a' + i, papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint: `c${i}.md` }));
  p.agentes.push({ nome: 'sem-ficheiro', papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint: 'sem.md' });
  const mtimes = Object.fromEntries(TABELA.map((ms, i) => [`c${i}.md`, AGORA - ms]));
  const m = await esperado(p, mtimes);
  await B.abrir(pagina, { docs: { ...docsDe(p), ...u.docsVida(mtimes) } });
  const v = await B.vista();
  assert.deepEqual(v.agentes.map((a) => [a.nome, a.vida]), m.agentes.map((a) => [a.nome, a.vida]));
});
