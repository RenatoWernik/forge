// F-12, barra (UI): a 390×844 e a 1440×900 não há scroll horizontal, e o resumo inteiro (progresso, contagens e objetivo) está no 1.º ecrã;
// com prefers-reduced-motion não corre nenhuma animação. Oráculo: as duas larguras × um corpus fixo de painéis (vazio, 1, 9 e 30
// agentes, nomes longos e com HTML, ausente, inválido), medidos no browser com scrollY = 0.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comBrowser, testePagina, paginaDe, docsDe, FIXTURES, base, api } from './helpers.mjs';

const ECRAS = [[390, 844], [1440, 900]];
const invalido = base(); invalido.tickets[0].estado = 'feito';
const CASOS = {
  vazio: FIXTURES.vazio, '1 agente': FIXTURES['1 agente'], '9 agentes': FIXTURES['9 agentes'], '30 agentes': FIXTURES['30 agentes'],
  'nomes longos, acentos e HTML': FIXTURES['nomes longos, com acentos e com HTML'], 'todos os estados': FIXTURES['todos os estados'],
  ausente: undefined, 'inválido': invalido,
};
const SCROLL = '({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, w: window.innerWidth })';

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

testePagina('C9: sem scroll horizontal a 390 e a 1440, com 0, 1, 9 e 30 agentes, nomes longos, ausente e inválido', async () => {
  const falhas = [];
  for (const [w, h] of ECRAS) for (const [nome, p] of Object.entries(CASOS)) {
    await B.abrir(pagina, { docs: docsDe(p), largura: w, altura: h });
    const m = await B.avaliar(SCROLL);
    if (m.sw > m.w || m.bw > m.w) falhas.push(`${w}×${h} ${nome}: scrollWidth ${m.sw}/${m.bw} > ${m.w}`);
  }
  assert.deepEqual(falhas, []);
});

testePagina('C9: o resumo (progresso, contagens por estado e objetivo) está inteiro no primeiro ecrã, a 390 e a 1440, com 1 e com 30 agentes', async () => {
  const { seletorResumo } = await api();
  const falhas = [];
  for (const [w, h] of ECRAS) for (const nome of ['1 agente', '30 agentes', 'todos os estados']) {
    await B.abrir(pagina, { docs: docsDe(CASOS[nome]), largura: w, altura: h });
    const r = await B.avaliar(`(() => { scrollTo(0, 0); const e = document.querySelector(${JSON.stringify(seletorResumo)}); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height, left: b.left, right: b.right, vh: innerHeight, vw: innerWidth, texto: e.textContent }; })()`);
    if (!r) { falhas.push(`${w}×${h} ${nome}: o seletor do resumo não existe`); continue; }
    if (!(r.height > 0 && r.top >= 0 && r.bottom <= r.vh && r.left >= 0 && r.right <= r.vw)) falhas.push(`${w}×${h} ${nome}: resumo em ${JSON.stringify({ ...r, texto: undefined })}`);
    if (!r.texto.includes(CASOS[nome].objetivo)) falhas.push(`${w}×${h} ${nome}: o objetivo não está no resumo (resposta 9)`);
  }
  assert.deepEqual(falhas, []);
});

testePagina('C9: com prefers-reduced-motion: reduce, nenhuma animação corre depois de a página desenhar os dados', async () => {
  const falhas = [];
  for (const [w, h] of ECRAS) {
    await B.abrir(pagina, { docs: docsDe(FIXTURES['9 agentes']), largura: w, altura: h, reduzirMovimento: true });
    await new Promise((r) => setTimeout(r, 300));
    const a = await B.avaliar('document.getAnimations().filter((x) => x.playState === "running").map((x) => (x.animationName || x.transitionProperty || "anim") + "@" + (x.effect?.target?.className || x.effect?.target?.tagName || "?"))');
    if (a.length) falhas.push(`${w}×${h}: ${a.join(', ')}`);
  }
  assert.deepEqual(falhas, []);
});
