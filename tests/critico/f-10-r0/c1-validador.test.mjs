// F-10 critério 1: o validador recusa cada painel.json inválido com o caminho do campo (ex.: tickets[2].estado) e aceita cada válido.
// Oráculo: o corpus literal abaixo (uma mutação por regra sobre o painel de base) e um gerador de valores JSON com semente fixa.
// Cada inválido tem uma só violação: todos os erros devolvidos têm de citar esse caminho (um erro noutro campo é um alarme falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, base, ESTADOS, PAPEIS, rng, pick } from './helpers.mjs';

const mut = (f) => { const o = base(); f(o); return o; };
const del = (o, k) => { delete o[k]; };

const VALIDOS = {
  'base (agente com porta e agente sem porta, checkpoint que não existe)': base(),
  'sem tickets e sem agentes': mut((o) => { o.tickets = []; o.agentes = []; }),
  'agente sem porta': mut((o) => { delete o.agentes[0].porta; }),
  'acentos, espaços e emoji nos textos': mut((o) => { o.projeto = 'Ação Ünïcode 2'; o.objetivo = 'Lote «coração» 🚀'; o.tickets[0].titulo = 'Título com "aspas" e \\barra'; }),
  ...Object.fromEntries(ESTADOS.map((e) => ['todos os tickets em ' + e, mut((o) => { for (const t of o.tickets) t.estado = e; })])),
  ...Object.fromEntries(PAPEIS.map((p) => ['agente com papel ' + p, mut((o) => { o.agentes[0].papel = p; })])),
};

// [nome, caminho que o erro tem de citar, mutação]
const INVALIDOS = [
  ['sem versao', 'versao', (o) => del(o, 'versao')],
  ['versao 2 (esquema desconhecido)', 'versao', (o) => { o.versao = 2; }],
  ['sem projeto', 'projeto', (o) => del(o, 'projeto')],
  ['projeto não é texto', 'projeto', (o) => { o.projeto = 42; }],
  ['objetivo não é texto', 'objetivo', (o) => { o.objetivo = ['a']; }],
  ['sem modo', 'modo', (o) => del(o, 'modo')],
  ['modo não é texto', 'modo', (o) => { o.modo = 7; }],
  ['sem tickets', 'tickets', (o) => del(o, 'tickets')],
  ['tickets não é lista', 'tickets', (o) => { o.tickets = { id: 'T-01' }; }],
  ['sem agentes', 'agentes', (o) => del(o, 'agentes')],
  ['agentes não é lista', 'agentes', (o) => { o.agentes = 'dev-t03'; }],
  ['estado desconhecido no 3.º ticket', 'tickets[2].estado', (o) => { o.tickets[2].estado = 'feito'; }],
  ['estado com maiúscula', 'tickets[0].estado', (o) => { o.tickets[0].estado = 'Main'; }],
  ['estado numérico', 'tickets[3].estado', (o) => { o.tickets[3].estado = 3; }],
  ['ticket sem estado', 'tickets[1].estado', (o) => del(o.tickets[1], 'estado')],
  ['ticket sem id', 'tickets[1].id', (o) => del(o.tickets[1], 'id')],
  ['ticket sem issue', 'tickets[2].issue', (o) => del(o.tickets[2], 'issue')],
  ['ticket sem titulo', 'tickets[0].titulo', (o) => del(o.tickets[0], 'titulo')],
  ['ticket sem rondas', 'tickets[3].rondas', (o) => del(o.tickets[3], 'rondas')],
  ['ticket nulo', 'tickets[2]', (o) => { o.tickets[2] = null; }],
  ['ticket é texto', 'tickets[1]', (o) => { o.tickets[1] = 'T-02'; }],
  ['papel desconhecido', 'agentes[0].papel', (o) => { o.agentes[0].papel = 'chefe'; }],
  ['agente sem papel', 'agentes[1].papel', (o) => del(o.agentes[1], 'papel')],
  ['agente sem nome', 'agentes[1].nome', (o) => del(o.agentes[1], 'nome')],
  ['agente sem ticket', 'agentes[0].ticket', (o) => del(o.agentes[0], 'ticket')],
  ['agente sem modelo', 'agentes[1].modelo', (o) => del(o.agentes[1], 'modelo')],
  ['agente sem checkpoint', 'agentes[1].checkpoint', (o) => del(o.agentes[1], 'checkpoint')],
  // «checkpoint (nome do ficheiro em .checkpoints/)»: um caminho não é um nome de ficheiro, e sairia da pasta
  ['checkpoint com ..', 'agentes[0].checkpoint', (o) => { o.agentes[0].checkpoint = '../segredo.md'; }],
  ['checkpoint com subpasta', 'agentes[1].checkpoint', (o) => { o.agentes[1].checkpoint = 'sub/critico.md'; }],
  ['checkpoint com barra invertida', 'agentes[1].checkpoint', (o) => { o.agentes[1].checkpoint = '..\\..\\x.md'; }],
  ['checkpoint absoluto (Windows)', 'agentes[0].checkpoint', (o) => { o.agentes[0].checkpoint = 'C:\\Windows\\win.ini'; }],
  ['checkpoint absoluto (POSIX)', 'agentes[0].checkpoint', (o) => { o.agentes[0].checkpoint = '/etc/passwd'; }],
  ['agente nulo', 'agentes[0]', (o) => { o.agentes[0] = null; }],
];

test('C1: o validador aceita cada painel válido do corpus (devolve [])', async () => {
  const u = await api();
  for (const [nome, obj] of Object.entries(VALIDOS)) assert.deepEqual(u.validar(obj), [], nome);
});

test(`C1: o validador recusa cada um dos ${INVALIDOS.length} inválidos, e todos os erros citam o caminho da única violação`, async () => {
  const u = await api();
  const falhas = [];
  for (const [nome, caminho, f] of INVALIDOS) {
    let erros;
    try { erros = u.validar(mut(f)); } catch (e) { falhas.push(`${nome}: o validador rebentou (${e.message})`); continue; }
    if (!Array.isArray(erros) || erros.length === 0) { falhas.push(`${nome}: aceite`); continue; }
    if (!erros.some((e) => String(e).includes(caminho))) falhas.push(`${nome}: nenhum erro cita «${caminho}»: ${JSON.stringify(erros)}`);
    const alheios = erros.filter((e) => !String(e).includes(caminho));
    if (alheios.length) falhas.push(`${nome}: erros noutros campos (alarme falso): ${JSON.stringify(alheios)}`);
  }
  assert.deepEqual(falhas, []);
});

test('C1: a raiz que não é objeto (null, lista, texto, número, booleano) é recusada sem rebentar', async () => {
  const u = await api();
  for (const v of [null, [], [base()], 'painel', 1, 0, true, false]) {
    let erros;
    assert.doesNotThrow(() => { erros = u.validar(v); }, JSON.stringify(v));
    assert.ok(Array.isArray(erros) && erros.length > 0, 'aceite: ' + JSON.stringify(v));
  }
});

test('C1 propriedade: 300 valores JSON gerados no lugar de um campo nunca fazem o validador rebentar, e um estado ou papel fora da lista é sempre recusado (semente 1010)', async (t) => {
  const u = await api();
  const SEED = 1010;
  t.diagnostic('semente ' + SEED);
  const r = rng(SEED);
  const valor = (d = 0) => {
    const k = Math.floor(r() * (d > 2 ? 5 : 7));
    return [() => null, () => true, () => r() * 1e6 - 5e5, () => Math.floor(r() * 10) - 3, () => pick(r, ['', ' ', 'x', '__proto__', 'constructor', 'MAIN', 'dev ', 'ativo', '0']),
      () => Array.from({ length: Math.floor(r() * 3) }, () => valor(d + 1)), () => Object.fromEntries(Array.from({ length: Math.floor(r() * 3) }, (_, i) => ['k' + i, valor(d + 1)]))][k]();
  };
  const sitios = [
    (o, v) => ['tickets[1].estado', () => { o.tickets[1].estado = v; }, typeof v !== 'string' || !ESTADOS.includes(v)],
    (o, v) => ['agentes[0].papel', () => { o.agentes[0].papel = v; }, typeof v !== 'string' || !PAPEIS.includes(v)],
    (o, v) => ['tickets[2]', () => { o.tickets[2] = v; }, true],
    (o, v) => ['agentes[1]', () => { o.agentes[1] = v; }, true],
    (o, v) => ['tickets', () => { o.tickets = v; }, !Array.isArray(v) || v.length > 0],
  ];
  const falhas = [];
  for (let i = 0; i < 300; i++) {
    const o = base(), v = valor();
    const [caminho, aplicar, invalido] = pick(r, sitios)(o, v);
    aplicar();
    let erros;
    try { erros = u.validar(o); } catch (e) { falhas.push(`#${i} ${caminho}=${JSON.stringify(v)}: rebentou (${e.message})`); continue; }
    if (invalido && !(Array.isArray(erros) && erros.some((e) => String(e).includes(caminho.replace(/\[\d+\]$/, ''))))) falhas.push(`#${i} ${caminho}=${JSON.stringify(v)}: aceite ou sem o caminho (${JSON.stringify(erros)})`);
  }
  assert.deepEqual(falhas.slice(0, 10), [], `${falhas.length} falhas`);
});

test('C1: o validador não altera o objeto que recebe', async () => {
  const u = await api();
  const o = base(), copia = structuredClone(o);
  u.validar(o);
  assert.deepEqual(o, copia);
});

// --- Ambíguos no contrato: ficam como todo até a PERGUNTA ter resposta do orquestrador ---
test('C1 (PERGUNTA 3): campos extra (ex.: agentes[].titulo, que o painel.json da referência usa) são aceites', { todo: 'PERGUNTA 3: campos extra aceites ou recusados?' }, async () => {
  const u = await api();
  assert.deepEqual(u.validar(mut((o) => { o.agentes[0].titulo = 'Lote 2'; o.extra = 1; })), []);
});
test('C1 (PERGUNTA 4): objetivo em falta é recusado com «objetivo» (o painel inicial do scaffold traz objetivo vazio)', { todo: 'PERGUNTA 4: objetivo obrigatório? vazio vale?' }, async () => {
  const u = await api();
  assert.ok(u.validar(mut((o) => del(o, 'objetivo'))).some((e) => e.includes('objetivo')));
  assert.deepEqual(u.validar(mut((o) => { o.objetivo = ''; })), []);
});
test('C1 (PERGUNTA 5): tipos — issue inteiro positivo, rondas inteiro ≥ 0, porta inteiro 1–65535, versao o número 1', { todo: 'PERGUNTA 5: tipos de issue, rondas, porta e versao' }, async () => {
  const u = await api();
  for (const [c, f] of [['tickets[0].issue', (o) => { o.tickets[0].issue = '#11'; }], ['tickets[0].rondas', (o) => { o.tickets[0].rondas = -1; }],
    ['tickets[0].rondas', (o) => { o.tickets[0].rondas = 1.5; }], ['agentes[0].porta', (o) => { o.agentes[0].porta = 'abc'; }],
    ['agentes[0].porta', (o) => { o.agentes[0].porta = 70000; }], ['versao', (o) => { o.versao = '1'; }]]) {
    assert.ok(u.validar(mut(f)).some((e) => e.includes(c)), c);
  }
});
test('C1 (PERGUNTA 6): modo fora de rigoroso/acelerado é recusado', { todo: 'PERGUNTA 6: valores válidos de modo' }, async () => {
  const u = await api();
  assert.ok(u.validar(mut((o) => { o.modo = 'turbo'; })).some((e) => e.includes('modo')));
});
test('C1 (PERGUNTA 7): ids de ticket e nomes de agente repetidos são recusados', { todo: 'PERGUNTA 7: duplicados' }, async () => {
  const u = await api();
  assert.ok(u.validar(mut((o) => { o.tickets[1].id = 'T-01'; })).some((e) => e.includes('tickets[1].id')));
  assert.ok(u.validar(mut((o) => { o.agentes[1].nome = 'dev-t03'; })).some((e) => e.includes('agentes[1].nome')));
});
