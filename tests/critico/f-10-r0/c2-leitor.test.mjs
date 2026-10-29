// F-10 critério 2: para cada painel válido, o leitor (função pura) devolve contagens por estado numa ordem fixa,
// a percentagem feita (aprovado + main), os agentes com o estado da vida e o objetivo.
// Oráculo: contagens calculadas à mão a partir das fixtures literais; 60 permutações com semente fixa para a ordem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, base, txt, ESTADOS, AGORA, MIN, rng } from './helpers.mjs';

const comTickets = (estados) => {
  const o = base();
  o.tickets = estados.map((estado, i) => ({ id: 'T-' + i, issue: 100 + i, titulo: 't' + i, estado, rondas: 0 }));
  return o;
};
const contar = (estados) => Object.fromEntries(ESTADOS.map((e) => [e, estados.filter((x) => x === e).length]));
const mapa = (pares) => Object.fromEntries(pares.filter(([, n]) => n !== 0));

// 2 falta, 1 espera, 3 dev, 1 critico, 2 reprovado, 4 aprovado, 3 main = 16 tickets, 7 feitos
const TODOS = ['dev', 'falta', 'main', 'aprovado', 'reprovado', 'dev', 'espera', 'aprovado', 'main', 'critico', 'falta', 'aprovado', 'dev', 'reprovado', 'main', 'aprovado'];

test('C2: contagens por estado iguais às contadas à mão, sem estados a mais, e só números inteiros', async () => {
  const u = await api();
  for (const estados of [TODOS, ['main'], ['falta', 'falta'], ['critico', 'reprovado', 'espera'], base().tickets.map((t) => t.estado)]) {
    const pares = u.contagens(u.ler(txt(comTickets(estados)), {}, AGORA));
    assert.ok(Array.isArray(pares), 'contagens não é lista');
    for (const [e, n] of pares) { assert.ok(ESTADOS.includes(e), 'estado a mais: ' + e); assert.ok(Number.isInteger(n) && n >= 0, `${e}: ${n}`); }
    assert.equal(new Set(pares.map(([e]) => e)).size, pares.length, 'estado repetido nas contagens');
    assert.deepEqual(mapa(pares), mapa(Object.entries(contar(estados))), estados.join(','));
  }
});

test('C2: a ordem dos estados é fixa — não depende da ordem dos tickets no ficheiro (60 permutações, semente 2020)', async (t) => {
  const u = await api();
  t.diagnostic('semente 2020');
  const r = rng(2020);
  const ordem = (estados) => u.contagens(u.ler(txt(comTickets(estados)), {}, AGORA)).filter(([, n]) => n > 0).map(([e]) => e);
  const ref = ordem(TODOS);
  assert.equal(ref.length, 7, 'com os 7 estados presentes, as contagens têm de ter os 7: ' + ref.join(','));
  for (let i = 0; i < 60; i++) {
    const p = [...TODOS];
    for (let j = p.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [p[j], p[k]] = [p[k], p[j]]; }
    assert.deepEqual(ordem(p), ref, 'permutação #' + i + ': ' + p.join(','));
    // com um subconjunto de estados, a ordem relativa é a mesma
    const sub = p.filter((e) => r() < 0.5);
    assert.deepEqual(ordem(sub), ref.filter((e) => sub.includes(e)), 'subconjunto #' + i);
  }
});

test('C2: a percentagem feita conta aprovado + main sobre o total (dentro de 1 ponto, para qualquer arredondamento) e é 0 sem tickets', async () => {
  const u = await api();
  const casos = [[TODOS, 7 / 16], [['main', 'aprovado'], 1], [['falta', 'dev', 'critico', 'reprovado', 'espera'], 0], [['main', 'falta'], 0.5], [['aprovado', 'falta', 'falta'], 1 / 3]];
  for (const [estados, f] of casos) {
    const p = u.percentagem(u.ler(txt(comTickets(estados)), {}, AGORA));
    assert.ok(Number.isFinite(p) && Math.abs(p - 100 * f) < 1, `${estados.join(',')}: ${p}, esperado ≈ ${100 * f}`);
  }
  for (const [estados, p] of [[['main', 'aprovado'], 100], [['falta'], 0], [['main', 'falta'], 50]]) assert.equal(u.percentagem(u.ler(txt(comTickets(estados)), {}, AGORA)), p, estados.join(','));
  assert.equal(u.percentagem(u.ler(txt(comTickets([])), {}, AGORA)), 0, 'sem tickets: tem de ser 0, não NaN');
});

test('C2: o objetivo vem do painel, tal e qual (acentos, aspas, emoji)', async () => {
  const u = await api();
  for (const s of ['Fechar o lote 1', 'Lote «coração» com "aspas" e \\ 🚀', '']) {
    const o = base(); o.objetivo = s;
    assert.equal(u.objetivo(u.ler(txt(o), {}, AGORA)), s);
  }
});

test('C2: os agentes vêm todos, pela ordem do ficheiro, incluindo o sem porta e o com checkpoint inexistente', async () => {
  const u = await api();
  const ag = u.agentes(u.ler(txt(base()), { 'desenvolvedor-t03.md': AGORA - 3 * MIN }, AGORA));
  assert.deepEqual(ag.map((a) => a.nome), ['dev-t03', 'critico-t03']);
  assert.equal(ag[0].vida, 'ativo');
  assert.equal(ag[1].vida, 'a começar', 'checkpoint inexistente (sem mtime) tem de dar «a começar»');
  assert.equal(ag[1].minutos, null);
});

test('C2: CRLF, JSON minificado e indentação com tabs dão o mesmo modelo que LF', async () => {
  const u = await api();
  const m = { 'desenvolvedor-t03.md': AGORA - 12 * MIN };
  const ref = u.ler(txt(base()), m, AGORA);
  for (const [nome, t] of [['CRLF', txt(base()).replace(/\n/g, '\r\n')], ['minificado', JSON.stringify(base())], ['tabs', JSON.stringify(base(), null, '\t')]]) {
    assert.deepEqual(u.ler(t, m, AGORA), ref, nome);
  }
});

test('C2: função pura — o mesmo input dá o mesmo modelo, não altera os mtimes recebidos e não lê o relógio real', async () => {
  const u = await api();
  const m = Object.freeze({ 'desenvolvedor-t03.md': AGORA - 31 * MIN, 'critico-t03.md': AGORA - 5 * MIN });
  const a = u.ler(txt(base()), m, AGORA);
  const RealDate = globalThis.Date;
  class Falsa extends RealDate { constructor(...x) { super(...(x.length ? x : [0])); } static now() { return 0; } }
  globalThis.Date = Falsa;
  let b;
  try { b = u.ler(txt(base()), m, AGORA); } finally { globalThis.Date = RealDate; }
  assert.deepEqual(b, a, 'o modelo mudou quando o relógio real mudou: o leitor não usa só o relógio injetado');
  assert.deepEqual(u.ler(txt(base()), m, AGORA), a);
});

test('C2: nomes que são chaves do Object.prototype não enganam o leitor nem poluem o protótipo', async () => {
  const u = await api();
  const o = base();
  o.agentes = ['constructor', 'toString', '__proto__', 'hasOwnProperty'].map((n) => ({ nome: n, papel: 'outro', ticket: n, modelo: 'haiku', checkpoint: n }));
  o.tickets[0].id = '__proto__';
  const ag = u.agentes(u.ler(txt(o), {}, AGORA));
  assert.deepEqual(ag.map((a) => a.nome), ['constructor', 'toString', '__proto__', 'hasOwnProperty']);
  for (const a of ag) { assert.equal(a.vida, 'a começar', a.nome + ': checkpoint sem mtime'); assert.equal(a.minutos, null, a.nome); }
  assert.equal({}.vida, undefined); assert.equal({}.estado, undefined); assert.equal({}.nome, undefined);
});

test('C2: um painel enorme (20 000 tickets, 2 000 agentes) é lido em menos de 3 s, com as contagens certas', async () => {
  const u = await api();
  const estados = Array.from({ length: 20000 }, (_, i) => ESTADOS[(i * 7 + (i >> 3)) % 7]);
  const o = comTickets(estados);
  o.agentes = Array.from({ length: 2000 }, (_, i) => ({ nome: 'a' + i, papel: 'dev', ticket: 'T-' + i, modelo: 'sonnet', checkpoint: `c${i}.md` }));
  const mt = Object.fromEntries(o.agentes.map((a, i) => [a.checkpoint, AGORA - (i % 40) * MIN]));
  const t0 = performance.now();
  const modelo = u.ler(txt(o), mt, AGORA);
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `leu em ${Math.round(ms)} ms`);
  assert.deepEqual(mapa(u.contagens(modelo)), mapa(Object.entries(contar(estados))));
  assert.equal(u.agentes(modelo).length, 2000);
});

// --- Ambíguos ---
test('C2 (PERGUNTA 2): a ordem fixa é a do contrato (falta, espera, dev, critico, reprovado, aprovado, main) e não a da referência (main → falta)', { todo: 'PERGUNTA 2: qual ordem?' }, async () => {
  const u = await api();
  assert.deepEqual(u.contagens(u.ler(txt(comTickets(TODOS)), {}, AGORA)).map(([e]) => e).filter((e) => ESTADOS.includes(e)), ESTADOS);
});
test('C2 (PERGUNTA 2): as contagens trazem os 7 estados, incluindo os de zero (a referência esconde os zeros)', { todo: 'PERGUNTA 2: estados com zero entram?' }, async () => {
  const u = await api();
  assert.equal(u.contagens(u.ler(txt(comTickets(['main'])), {}, AGORA)).length, 7);
});
