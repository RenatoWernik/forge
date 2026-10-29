// F-12 (brief da Ronda −1): o painel ausente ou inválido mostra o erro sem rebentar e nunca mostra dados parciais.
// Oráculo: corpus de casos finitos — documento ausente, sem base de dados (use("db") → null), e cada painel inválido do corpus do F-10
// (um por campo do esquema) — mais a falha terminal de uma subscrição. Nenhum caso pode lançar exceção não apanhada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comBrowser, testePagina, paginaDe, docsDe, base, esperado, api } from './helpers.mjs';

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

const mut = (f) => { const o = base(); f(o); return o; };
const INVALIDOS = {
  'versao em texto': mut((o) => { o.versao = '1'; }),
  'modo desconhecido': mut((o) => { o.modo = 'turbo'; }),
  'sem tickets': mut((o) => { delete o.tickets; }),
  'agentes não é lista': mut((o) => { o.agentes = 'x'; }),
  'estado desconhecido': mut((o) => { o.tickets[2].estado = 'feito'; }),
  'ticket nulo': mut((o) => { o.tickets[1] = null; }),
  'id repetido': mut((o) => { o.tickets[1].id = 'T-01'; }),
  'papel desconhecido': mut((o) => { o.agentes[0].papel = 'chefe'; }),
  'checkpoint com caminho': mut((o) => { o.agentes[1].checkpoint = '../fora.md'; }),
  'porta fora do intervalo': mut((o) => { o.agentes[0].porta = 65536; }),
  'nome repetido': mut((o) => { o.agentes[1].nome = 'dev-t03'; }),
  'objeto vazio': {},
};

// Resposta 7: sem dados, nenhum número no bloco do resumo (nem zeros nem 0%)
const numerosNoResumo = async () => { const { seletorResumo } = await api(); return B.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(seletorResumo)}); return e ? (e.textContent.match(/\\d+/g) || []) : []; })()`); };
// (só nos casos sem painel: a mensagem de erro de um painel inválido pode citar índices como tickets[2])
const semDados = async (nome, v, numeros = false) => {
  const f = [];
  const n = numeros ? await numerosNoResumo() : [];
  if (n.length) f.push('o resumo mostra números ' + n.join(' '));
  if (!(typeof v.erro === 'string' && v.erro.trim())) f.push('não mostra erro');
  if (v.contagens !== null) f.push('mostra contagens ' + JSON.stringify(v.contagens));
  if ((v.agentes ?? []).length) f.push('mostra agentes ' + JSON.stringify(v.agentes));
  if (v.percentagem !== null && v.percentagem !== undefined) f.push('mostra progresso ' + v.percentagem);
  if (B.estado.excecoes.length) f.push('exceções: ' + B.estado.excecoes.join(' | '));
  return f.map((x) => `${nome}: ${x}`);
};

testePagina('C6: documento painel/estado ausente: mostra o erro, sem contagens nem agentes, sem exceções', async () => {
  await B.abrir(pagina, { docs: {} });
  assert.deepEqual(await semDados('ausente', await B.vista(), true), []);
});

testePagina('C6: sem base de dados nesta vista (use("db") → null): mostra o erro e nenhum número, sem exceções (resposta 7)', async () => {
  await B.abrir(pagina, { semDb: true });
  assert.deepEqual(await semDados('sem db', await B.vista(), true), []);
});

testePagina('C6: cada painel inválido do corpus (12) mostra o erro e nenhum dado parcial', async () => {
  const falhas = [];
  for (const [nome, p] of Object.entries(INVALIDOS)) {
    assert.ok((await esperado(p)).erro, `${nome}: o leitor devia recusar`);
    await B.abrir(pagina, { docs: docsDe(p) });
    falhas.push(...await semDados(nome, await B.vista()));
  }
  assert.deepEqual(falhas, []);
});

testePagina('C6: a subscrição morre com «revoked» depois de desenhar: a página não lança exceções', async () => {
  await B.abrir(pagina, { docs: docsDe(base()) });
  await B.avaliar('window.__fake.falhar("revoked")');
  await B.assentar();
  assert.deepEqual(B.estado.excecoes, []);
});
