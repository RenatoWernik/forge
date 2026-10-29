// F-12, critério 4: a caixa de entrada continua a funcionar (um pedido escrito na página cria um documento em `inbox` com `t`, `text`
// e `status:"novo"`), e as notas e os pedidos já existentes continuam a aparecer. Oráculo: a base de dados falsa, com igualdade
// dos campos; o relógio da página está parado em AGORA, por isso `t` é exatamente a data ISO de AGORA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sessao, paginaDe, docsDe, base, api, AGORA } from './helpers.mjs';

let B, pagina;
before(async () => { B = await sessao(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

const escreverEEnviar = async (texto) => {
  const u = await api();
  await B.avaliar(`document.querySelector(${JSON.stringify(u.seletorInboxTexto)}).focus()`);
  await B.s('Input.insertText', { text: texto });
  await B.avaliar(`document.querySelector(${JSON.stringify(u.seletorInboxEnviar)}).click()`);
  await B.assentar();
};

test('C4: um pedido escrito e enviado cria um só documento em inbox, igual a { t: AGORA, text, status: "novo" }', async () => {
  await B.abrir(pagina, { docs: docsDe(base()) });
  assert.deepEqual(await B.avaliar('window.__fake.writes'), [], 'a página escreveu antes de o utilizador agir');
  await escreverEEnviar('  Faz o login antes do relatório «já» <b>x</b>  ');
  const w = await B.avaliar('window.__fake.writes');
  assert.equal(w.length, 1, JSON.stringify(w));
  assert.ok(['add', 'set'].includes(w[0].op) && /^inbox\/[^/]+$/.test(w[0].path), JSON.stringify(w[0]));
  assert.deepEqual(w[0].data, { t: new Date(AGORA).toISOString(), text: 'Faz o login antes do relatório «já» <b>x</b>', status: 'novo' });
  assert.deepEqual(B.estado.excecoes, []);
});

test('C4: um pedido só com espaços não cria nada', async () => {
  await B.abrir(pagina, { docs: docsDe(base()) });
  await escreverEEnviar('   \n  ');
  assert.deepEqual(await B.avaliar('window.__fake.writes'), []);
});

test('C4: as notas e os pedidos já guardados aparecem na página, como texto', async () => {
  const docs = {
    ...docsDe(base()),
    'notes/n1': { t: new Date(AGORA - 60000).toISOString(), kind: 'pergunta', title: 'Nota-titulo-7731', body: 'Corpo-da-nota-7731' },
    'inbox/m1': { t: new Date(AGORA - 120000).toISOString(), text: 'Pedido-antigo-7731', status: 'lido' },
  };
  await B.abrir(pagina, { docs });
  const texto = await B.avaliar('document.body.textContent');
  for (const s of ['Nota-titulo-7731', 'Corpo-da-nota-7731', 'Pedido-antigo-7731']) assert.ok(texto.includes(s), 'não aparece: ' + s);
  assert.deepEqual(B.estado.excecoes, []);
});
