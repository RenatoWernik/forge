// F-12 (reprova sempre: injeção): o texto do painel entra SEMPRE como texto. Oráculo: um corpus finito de 12 cargas, cada uma
// posta em todos os campos de texto do painel.json (projeto, objetivo, id, título, nome, ticket, modelo, checkpoint, campo extra),
// na mensagem de erro do leitor, nas notas e nos pedidos. Para cada carga: nenhuma chamada a window.__xss, a árvore de elementos é
// a mesma que com texto benigno no mesmo sítio (nada de elementos novos), e os nomes aparecem tal e qual.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comBrowser, testePagina, paginaDe, docsDe, base, AGORA } from './helpers.mjs';

const CARGAS = [
  '<img src=x onerror=__xss(1)>',
  '<script>__xss(2)</script>',
  '"><svg onload=__xss(3)>',
  "'><iframe srcdoc=\"<script>parent.__xss(4)</script>\"></iframe>",
  '<a href="javascript:__xss(5)">x</a>',
  '</script><script>__xss(6)</script>',
  '<style>*{display:none!important}</style>',
  '${__xss(7)}',
  '{{PROJECT_NAME}} &lt;b&gt; &amp;',
  '<details open ontoggle=__xss(8)>',
  '<math><mi xlink:href="javascript:__xss(9)">x</mi></math>',
  '<input autofocus onfocus=__xss(10)>',
];
// Todos os campos de texto com a carga (ids e nomes únicos pelo sufixo); o checkpoint não pode ter / \ nem :
const painel = (c) => {
  const cp = c.replace(/[\\/:]/g, '_');
  return {
    versao: 1, projeto: c, objetivo: c, modo: 'rigoroso', extra: c,
    tickets: [{ id: c + ' #1', issue: 1, titulo: c, estado: 'dev', rondas: 1, nota: c }, { id: c + ' #2', issue: 2, titulo: c, estado: 'main', rondas: 0 }],
    agentes: [{ nome: c + ' #a', papel: 'dev', ticket: c, modelo: c, checkpoint: cp + '.md' }, { nome: c + ' #b', papel: 'critico', ticket: c, modelo: c, checkpoint: cp + '-b.md' }],
  };
};
const extras = (c) => ({
  'notes/n1': { t: new Date(AGORA).toISOString(), kind: 'pergunta', title: c, body: c },
  'inbox/m1': { t: new Date(AGORA).toISOString(), text: c, status: 'novo', reply: c },
});
const ARVORE = '[...document.querySelectorAll("*")].map((e) => e.tagName).sort().join(",")';

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

testePagina('C7: cada carga em cada campo do painel, nas notas e nos pedidos entra como texto (12 cargas)', async () => {
  const falhas = [];
  for (const [i, c] of CARGAS.entries()) {
    const benigno = 'benigno' + i;
    await B.abrir(pagina, { docs: { ...docsDe(painel(benigno)), ...extras(benigno) } });
    const arvoreBenigna = await B.avaliar(ARVORE);
    await B.abrir(pagina, { docs: { ...docsDe(painel(c)), ...extras(c) } });
    await new Promise((r) => setTimeout(r, 150));
    const hits = await B.avaliar('window.__fake.xss');
    if (hits.length) falhas.push(`${c}: executou ${JSON.stringify(hits)}`);
    if (await B.avaliar(ARVORE) !== arvoreBenigna) falhas.push(`${c}: a carga criou ou removeu elementos`);
    const v = await B.vista();
    if (JSON.stringify((v.agentes ?? []).map((a) => a.nome)) !== JSON.stringify([c + ' #a', c + ' #b'])) falhas.push(`${c}: nomes mostrados ${JSON.stringify(v.agentes?.map((a) => a.nome))}`);
    if (B.estado.excecoes.length) falhas.push(`${c}: exceções ${B.estado.excecoes.join(' | ')}`);
  }
  assert.deepEqual(falhas, []);
});

testePagina('C7: a mensagem de erro do leitor, que cita um id repetido, também entra como texto', async () => {
  const falhas = [];
  for (const c of CARGAS) {
    const p = base();
    p.tickets[0].id = c; p.tickets[1].id = c; // "tickets[1].id: "<carga>" is repeated"
    await B.abrir(pagina, { docs: docsDe(p) });
    await new Promise((r) => setTimeout(r, 150));
    const hits = await B.avaliar('window.__fake.xss');
    if (hits.length) falhas.push(`${c}: executou ${JSON.stringify(hits)}`);
    const v = await B.vista();
    if (!(typeof v.erro === 'string' && v.erro.trim())) falhas.push(`${c}: não mostra o erro`);
    if (B.estado.excecoes.length) falhas.push(`${c}: exceções ${B.estado.excecoes.join(' | ')}`);
  }
  assert.deepEqual(falhas, []);
});
