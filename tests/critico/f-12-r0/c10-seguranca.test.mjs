// F-12 (reprova sempre: perda de dados e execução de conteúdo externo): a página nunca escreve na cópia do painel.json nem em nada
// fora de `inbox`, e nunca carrega scripts externos. Oráculo finito: as 8 páginas do corpus (estático) e uma sessão fixa no browser —
// o corpus de fixtures, um inválido, um ausente, 4 atualizações ao vivo e um clique em cada botão fora do formulário —, com todas as
// escritas registadas pela base de dados falsa e todos os pedidos de rede registados pelo browser (a rede está bloqueada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comBrowser, testePagina, paginaDe, docsDe, FIXTURES, base, corpusAnswers, api } from './helpers.mjs';

const FONTES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//; // a página atual já carrega a fonte por CSS; nunca um script
const PROIBIDOS = new Set(['Script', 'XHR', 'Fetch', 'EventSource', 'WebSocket', 'Manifest', 'Ping', 'Prefetch', 'Document']);

test('C10: em nenhuma página do corpus há <script src>, import de URL, iframe, embed, object ou preload de script', async () => {
  const falhas = [];
  for (const a of corpusAnswers()) {
    const html = await paginaDe(a.value);
    for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) if (/\bsrc\s*=/i.test(tag)) falhas.push(`${a.name}: ${tag}`);
    for (const re of [/\bimport\s*\(\s*['"`]\s*(https?:)?\/\//i, /\bfrom\s*['"]\s*(https?:)?\/\//i, /<(iframe|embed|object)\b/i, /<link\b[^>]*\b(modulepreload|as\s*=\s*["']?script)/i, /\bimportScripts\s*\(/])
      if (re.test(html)) falhas.push(`${a.name}: ${re}`);
  }
  assert.deepEqual(falhas, []);
});

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

const pedidosMaus = () => B.estado.pedidos.filter((p) => !/^(file|data|blob|about):/.test(p.url) && (PROIBIDOS.has(p.type) || !FONTES.test(p.url))).map((p) => `${p.type} ${p.url}`);

testePagina('C10: numa sessão completa sem usar a caixa de entrada, a página não escreve nada e não pede scripts nem dados à rede', async () => {
  const invalido = base(); invalido.tickets[0].estado = 'feito';
  const falhas = [];
  for (const [nome, p] of [...Object.entries(FIXTURES), ['inválido', invalido], ['ausente', undefined]]) {
    await B.abrir(pagina, { docs: docsDe(p) });
    const w = await B.avaliar('window.__fake.writes');
    if (w.length) falhas.push(`${nome}: escreveu ${JSON.stringify(w).slice(0, 200)}`);
    falhas.push(...pedidosMaus().map((x) => `${nome}: ${x}`));
  }
  await B.abrir(pagina, { docs: docsDe(base()) });
  for (const p of [FIXTURES['9 agentes'], invalido, undefined, FIXTURES['todos os estados']]) {
    await B.avaliar(`window.__fake.definir('painel/estado', ${JSON.stringify(p) ?? 'undefined'})`);
    await B.assentar();
  }
  const n = await B.avaliar('document.querySelectorAll("button, [role=tab]").length');
  for (let i = 0; i < n; i++) {
    await B.avaliar(`(() => { const e = document.querySelectorAll("button, [role=tab]")[${i}]; if (e && !e.closest("form")) e.click(); })()`);
    await B.assentar();
  }
  const w = await B.avaliar('window.__fake.writes');
  if (w.length) falhas.push(`atualizações e cliques: escreveu ${JSON.stringify(w).slice(0, 300)}`);
  falhas.push(...pedidosMaus());
  assert.deepEqual(falhas, []);
});

testePagina('C10: enviar um pedido só escreve em inbox; nunca em painel/ nem noutra coleção', async () => {
  const u = await api();
  await B.abrir(pagina, { docs: docsDe(base()) });
  for (const t of ['um', 'dois']) {
    await B.avaliar(`document.querySelector(${JSON.stringify(u.seletorInboxTexto)}).focus()`);
    await B.s('Input.insertText', { text: t });
    await B.avaliar(`document.querySelector(${JSON.stringify(u.seletorInboxEnviar)}).click()`);
    await B.assentar();
  }
  const w = await B.avaliar('window.__fake.writes');
  assert.equal(w.length, 2, JSON.stringify(w));
  assert.deepEqual(w.filter((x) => !/^inbox\/[^/]+$/.test(x.path) || !['add', 'set'].includes(x.op)), []);
});
