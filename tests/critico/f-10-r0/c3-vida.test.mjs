// F-10 critério 3: minutos desde o último checkpoint e estado da vida, a partir do mtime e de um relógio injetado.
//   sem ficheiro: «a começar»; < 10 min: ativo; 10 a < 30: «sem sinal»; ≥ 30: «parado?».
// Oráculo: a tabela literal abaixo (0, 9, 10, 29, 30, 31 min e sem ficheiro), com três relógios diferentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, base, txt, AGORA, MIN } from './helpers.mjs';

const TABELA = [[0, 'ativo'], [9, 'ativo'], [10, 'sem sinal'], [29, 'sem sinal'], [30, 'parado?'], [31, 'parado?'], [600, 'parado?']];

const painel = () => {
  const o = base();
  o.agentes = [...TABELA.map(([m]) => m), 'sem'].map((m) => ({ nome: 'a' + m, papel: 'dev', ticket: 'T-01', modelo: 'sonnet', checkpoint: `cp-${m}.md` }));
  return o;
};

for (const agora of [AGORA, Date.UTC(2030, 0, 1, 0, 0, 0), Date.UTC(2026, 2, 29, 1, 30, 0)]) {
  test(`C3: minutos e vida batem com a tabela literal (relógio ${new Date(agora).toISOString()})`, async () => {
    const u = await api();
    const mtimes = Object.fromEntries(TABELA.map(([m]) => [`cp-${m}.md`, agora - m * MIN]));
    const ag = u.agentes(u.ler(txt(painel()), mtimes, agora));
    const visto = Object.fromEntries(ag.map((a) => [a.nome, [a.minutos, a.vida]]));
    const esperado = Object.fromEntries([...TABELA.map(([m, v]) => ['a' + m, [m, v]]), ['asem', [null, 'a começar']]]);
    assert.deepEqual(visto, esperado);
  });
}

test('C3: o relógio injetado manda — o mesmo mtime dá vidas diferentes com relógios diferentes', async () => {
  const u = await api();
  const o = base(); o.agentes = [{ nome: 'x', papel: 'dev', ticket: 'T-01', modelo: 'sonnet', checkpoint: 'x.md' }];
  const vida = (agora) => u.agentes(u.ler(txt(o), { 'x.md': AGORA }, agora))[0].vida;
  assert.deepEqual([vida(AGORA + 5 * MIN), vida(AGORA + 15 * MIN), vida(AGORA + 45 * MIN)], ['ativo', 'sem sinal', 'parado?']);
});

test('C3: só o checkpoint do próprio agente conta (mtimes de outros ficheiros não o tornam ativo)', async () => {
  const u = await api();
  const o = base(); o.agentes = [{ nome: 'x', papel: 'dev', ticket: 'T-01', modelo: 'sonnet', checkpoint: 'x.md' }];
  const ag = u.agentes(u.ler(txt(o), { 'y.md': AGORA, 'X.MD': AGORA, 'x.md.tmp': AGORA }, AGORA));
  assert.deepEqual([ag[0].vida, ag[0].minutos], ['a começar', null]);
});

// Resposta 8: os limiares contam sobre o tempo real, sem arredondar; os minutos mostrados arredondam-se para baixo
test('C3 (resposta 8): limiares sobre o tempo real — 9:59,9 ativo, 10:00 sem sinal, 29:59,9 sem sinal, 30:00 parado?; minutos para baixo', async () => {
  const u = await api();
  const o = base(); o.agentes = [{ nome: 'x', papel: 'dev', ticket: 'T-01', modelo: 'sonnet', checkpoint: 'x.md' }];
  const ver = (ms) => { const a = u.agentes(u.ler(txt(o), { 'x.md': AGORA - ms }, AGORA))[0]; return [a.vida, a.minutos]; };
  const TABELA = [[30000, 'ativo', 0], [59999, 'ativo', 0], [9 * MIN + 59900, 'ativo', 9], [10 * MIN - 1, 'ativo', 9], [10 * MIN, 'sem sinal', 10], [10 * MIN + 30000, 'sem sinal', 10],
    [29 * MIN + 59900, 'sem sinal', 29], [30 * MIN - 1, 'sem sinal', 29], [30 * MIN, 'parado?', 30], [30 * MIN + 59999, 'parado?', 30]];
  assert.deepEqual(TABELA.map(([ms]) => ver(ms)), TABELA.map(([, v, m]) => [v, m]));
});

// Resposta 9: um mtime no futuro dá ativo com 0 minutos
test('C3 (resposta 9): um mtime no futuro (1 s, 5 min, 1 dia) dá «ativo» com 0 minutos, nunca minutos negativos', async () => {
  const u = await api();
  const o = base(); o.agentes = [{ nome: 'x', papel: 'dev', ticket: 'T-01', modelo: 'sonnet', checkpoint: 'x.md' }];
  for (const ms of [1000, 5 * MIN, 24 * 60 * MIN]) {
    const a = u.agentes(u.ler(txt(o), { 'x.md': AGORA + ms }, AGORA))[0];
    assert.deepEqual([a.vida, a.minutos], ['ativo', 0], ms + ' ms no futuro');
  }
});