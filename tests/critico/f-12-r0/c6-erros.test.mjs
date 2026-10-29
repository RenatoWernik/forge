// F-12 (brief da Ronda −1): o painel ausente ou inválido mostra o erro sem rebentar e nunca mostra dados parciais.
// Oráculo: corpus de casos finitos — documento ausente, sem base de dados (use("db") → null), e cada painel inválido do corpus do F-10
// (um por campo do esquema) — mais a falha terminal de uma subscrição. Nenhum caso pode lançar exceção não apanhada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sessao, paginaDe, docsDe, base, esperado } from './helpers.mjs';

let B, pagina;
before(async () => { B = await sessao(); pagina = await paginaDe(); });
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

const semDados = (nome, v) => {
  const f = [];
  if (!(typeof v.erro === 'string' && v.erro.trim())) f.push('não mostra erro');
  if (v.contagens !== null) f.push('mostra contagens ' + JSON.stringify(v.contagens));
  if ((v.agentes ?? []).length) f.push('mostra agentes ' + JSON.stringify(v.agentes));
  if (v.percentagem !== null && v.percentagem !== undefined) f.push('mostra progresso ' + v.percentagem);
  if (B.estado.excecoes.length) f.push('exceções: ' + B.estado.excecoes.join(' | '));
  return f.map((x) => `${nome}: ${x}`);
};

test('C6: documento painel/estado ausente: mostra o erro, sem contagens nem agentes, sem exceções', async () => {
  await B.abrir(pagina, { docs: {} });
  assert.deepEqual(semDados('ausente', await B.vista()), []);
});

test('C6: sem base de dados nesta vista (use("db") → null): mostra o erro, sem dados, sem exceções', async () => {
  await B.abrir(pagina, { semDb: true });
  assert.deepEqual(semDados('sem db', await B.vista()), []);
});

test('C6: cada painel inválido do corpus (12) mostra o erro e nenhum dado parcial', async () => {
  const falhas = [];
  for (const [nome, p] of Object.entries(INVALIDOS)) {
    assert.ok((await esperado(p)).erro, `${nome}: o leitor devia recusar`);
    await B.abrir(pagina, { docs: docsDe(p) });
    falhas.push(...semDados(nome, await B.vista()));
  }
  assert.deepEqual(falhas, []);
});

test('C6: a subscrição morre com «revoked» depois de desenhar: a página não lança exceções', async () => {
  await B.abrir(pagina, { docs: docsDe(base()) });
  await B.avaliar('window.__fake.falhar("revoked")');
  await B.assentar();
  assert.deepEqual(B.estado.excecoes, []);
});
