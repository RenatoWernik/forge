// The panel page (F-12, #13): the reader embedded byte for byte, the same data as the reader on the copy of painel.json, the life of each
// agent from painel/vida, and the inbox. The page runs in the system Chrome or Edge with a fake ArtifactData (tests/critico/f-12-r0/helpers.mjs);
// without a browser the page tests are skipped with the reason. Standard library only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { docsVida } from './painel.mjs';
import { ler } from './painel-leitor.mjs';
import { LEITOR, AGORA, MIN, FIXTURES, base, docsDe, paginaDe, respostas, comBrowser, testePagina } from '../tests/critico/f-12-r0/helpers.mjs';
import { seletorInboxTexto, seletorInboxEnviar } from '../tests/ponte/f-12.mjs';

const painel = (agentes) => ({ ...base(), agentes: agentes.map(([nome, checkpoint]) => ({ nome, papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint })) });

test('criterion 1: the page of a generated project (en, pt) embeds the shared reader byte for byte, once, as the start of its module script', async () => {
  const L = readFileSync(LEITOR, 'utf8');
  for (const set of ['en-noplain-published', 'pt-plain-pending']) {
    const html = await paginaDe(respostas(set));
    assert.equal(html.split(L).length - 1, 1, set);
    assert.ok(html.includes('<script type="module">\n' + L), set + ': the reader opens the module script');
  }
});

test('docsVida gives painel/vida: { t, agentes: { <nome>: { minutos, vida } } } from the checkpoint mtimes', () => {
  const p = painel([['a', 'a.md'], ['b', 'b.md'], ['c', 'c.md'], ['d', 'd.md']]);
  const docs = docsVida(JSON.stringify(p), { 'a.md': AGORA - 2 * MIN, 'b.md': AGORA - 15 * MIN, 'c.md': AGORA - 40 * MIN }, AGORA);
  assert.deepEqual(docs, { 'painel/vida': { t: '2026-10-29T12:00:00.000Z', agentes: {
    a: { minutos: 2, vida: 'ativo' }, b: { minutos: 15, vida: 'sem sinal' }, c: { minutos: 40, vida: 'parado?' }, d: { minutos: null, vida: 'a começar' },
  } } });
  assert.deepEqual(docsVida('{', {}, AGORA)['painel/vida'].agentes, {}, 'an invalid painel.json has no agents');
  assert.ok(Object.hasOwn(docsVida(JSON.stringify(painel([['__proto__', 'p.md']])), {}, AGORA)['painel/vida'].agentes, '__proto__'), 'any name is an own key');
});

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

testePagina('criterion 2: the page draws the counts by state, the progress and the agents of the F-10 model, for every fixture', async () => {
  await B.abrir(pagina, { docs: docsDe(FIXTURES.base) });
  assert.deepEqual(await B.vista(), { erro: null, percentagem: 50, contagens: [['main', 1], ['aprovado', 1], ['critico', 1], ['dev', 0], ['reprovado', 0], ['espera', 0], ['falta', 1]], agentes: [{ nome: 'dev-t03', vida: null }, { nome: 'critico-t03', vida: null }] });
  for (const [nome, p] of Object.entries(FIXTURES)) {
    const m = ler(JSON.stringify(p), {}, AGORA);
    await B.abrir(pagina, { docs: docsDe(p) });
    const v = await B.vista();
    assert.deepEqual([v.erro, v.percentagem, v.contagens, v.agentes.map((a) => a.nome)], [null, m.percentagem, m.contagens, m.agentes.map((a) => a.nome)], nome);
  }
  assert.deepEqual(B.estado.excecoes, []);
});

testePagina('the life of each agent comes from painel/vida and keeps ageing from its t; an agent painel/vida does not name shows none', async () => {
  const p = painel([['a', 'a.md'], ['b', 'b.md'], ['c', 'c.md'], ['d', 'd.md'], ['fora', 'f.md']]);
  const vida = (t, idades) => ({ 'painel/vida': { t: new Date(t).toISOString(), agentes: idades } });
  const idades = { a: { minutos: 2, vida: 'ativo' }, b: { minutos: 15, vida: 'sem sinal' }, c: { minutos: 40, vida: 'parado?' }, d: { minutos: null, vida: 'a começar' } };
  await B.abrir(pagina, { docs: { ...docsDe(p), ...vida(AGORA, idades) } });
  assert.deepEqual((await B.vista()).agentes.map((a) => a.vida), ['ativo', 'sem sinal', 'parado?', 'a começar', null]);
  // written 30 minutes ago and never refreshed: "a" (2 min then) is 32 min old now
  await B.abrir(pagina, { docs: { ...docsDe(p), ...vida(AGORA - 30 * MIN, idades) } });
  assert.deepEqual((await B.vista()).agentes.map((a) => a.vida), ['parado?', 'parado?', 'parado?', 'a começar', null]);
  // a malformed painel/vida (no t, minutes as text) shows no life rather than a made-up one
  await B.abrir(pagina, { docs: { ...docsDe(p), 'painel/vida': { agentes: idades } } });
  assert.deepEqual((await B.vista()).agentes.map((a) => a.vida), [null, null, null, null, null]);
  await B.abrir(pagina, { docs: { ...docsDe(p), ...vida(AGORA, { a: { minutos: '2' } }) } });
  assert.equal((await B.vista()).agentes[0].vida, null);
  assert.deepEqual(B.estado.excecoes, []);
});

testePagina('criterion 4: a request sent from the page creates one inbox document { t, text, status: "novo" }; a blank one creates nothing', async () => {
  const enviar = async (texto) => {
    await B.avaliar(`document.querySelector(${JSON.stringify(seletorInboxTexto)}).focus()`);
    await B.s('Input.insertText', { text: texto });
    await B.avaliar(`document.querySelector(${JSON.stringify(seletorInboxEnviar)}).click()`);
    await B.assentar();
  };
  await B.abrir(pagina, { docs: docsDe(base()) });
  await enviar('   ');
  assert.deepEqual(await B.avaliar('window.__fake.writes'), []);
  await enviar(' Do the login first ');
  const w = await B.avaliar('window.__fake.writes');
  assert.equal(w.length, 1);
  assert.match(w[0].path, /^inbox\/[^/]+$/);
  assert.deepEqual(w[0].data, { t: '2026-10-29T12:00:00.000Z', text: 'Do the login first', status: 'novo' });
});

testePagina('a missing, invalid or unreachable painel/estado shows the error and no partial data', async () => {
  const invalido = base(); invalido.tickets[0].estado = 'feito';
  for (const [nome, opts] of [['missing', { docs: {} }], ['invalid', { docs: docsDe(invalido) }], ['no db', { semDb: true }]]) {
    await B.abrir(pagina, opts);
    const v = await B.vista();
    assert.ok(v.erro, nome);
    assert.deepEqual([v.percentagem, v.contagens, v.agentes], [null, null, []], nome);
  }
  assert.deepEqual(B.estado.excecoes, []);
});
