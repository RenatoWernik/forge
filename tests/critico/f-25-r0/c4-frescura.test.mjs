// F-25 C4: frescura visível. 1.ª linha «⟳ atualizado há <N> s · <AO VIVO|ATRASADO|PARADO>» (N desde a última volta concluída:
// < 15 s, < 60 s, ≥ 60 s); «⚠ relógio parado: escreve /forge-painel para o rearmar» a partir de 30 s; o aviso de painel.json atrasado
// quando o .md mais recente de .checkpoints/ passa o painel.json em mais de 60 s; nenhuma linha passa de bodyColumns.
// Oráculo: o texto do painel com projetos de fixture num relógio controlado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { S, MIN, H, AGORA, criar, runtime, projeto, base, ag, agente, linhas, largura, iso, flush, ate } from './helpers.mjs';

const RELOGIO = '⚠ relógio parado: escreve /forge-painel para o rearmar';
const depois = async (ms, opcoes = {}) => {
  const r = runtime({ raiz: projeto(opcoes).raiz });
  const painel = await criar();
  await painel.volta(r.$);
  await r.ctl.avancar(ms);
  return painel.ecra(r.$, 200);
};

for (const [s, selo] of [[0, 'AO VIVO'], [14, 'AO VIVO'], [15, 'ATRASADO'], [59, 'ATRASADO'], [60, 'PARADO'], [600, 'PARADO']]) {
  test(`C4: ${s} s depois da última volta concluída, a 1.ª linha é «⟳ atualizado há ${s} s · ${selo}»`, async () => {
    const txt = await depois(s * S);
    assert.equal(linhas(txt)[0], `⟳ atualizado há ${s} s · ${selo}`, txt);
  });
}

test('C4: o N conta desde a volta concluída, não desde a que começou', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  r.ctl.agentes = 'pendura';
  const v = painel.volta(r.$);
  await flush();
  await r.ctl.avancar(4 * S);
  assert.equal((await ate(v)).feito, true, 'a volta não acabou aos 4 s do relógio falso');
  await r.ctl.avancar(10 * S);
  assert.equal(linhas(await painel.ecra(r.$, 200))[0], '⟳ atualizado há 10 s · AO VIVO');
});

for (const [s, com] of [[29, false], [30, true]]) {
  test(`C4: aos ${s} s sem volta, ${com ? 'aparece' : 'não aparece'} o aviso do relógio parado`, async () => {
    const txt = await depois(s * S);
    assert.equal(linhas(txt).includes(RELOGIO), com, txt);
    assert.equal(linhas(txt).filter((l) => l.includes('relógio parado')).length, com ? 1 : 0, 'aviso com outro texto');
  });
}

const atraso = (txt) => linhas(txt).filter((l) => l.includes('sem alterações'));
const CASOS = [
  ['61 s de diferença (min)', 361 * S, { 'dev-t02.md': 300 * S, 'critico-t02.md': 50 * MIN }, '⚠ painel.json sem alterações há 6 min, mas dev-t02.md é de há 5 min'],
  ['75 s de diferença (s)', 125 * S, { 'dev-t02.md': 50 * S }, '⚠ painel.json sem alterações há 2 min, mas dev-t02.md é de há 50 s'],
  ['horas', 2 * H, { 'critico-t02.md': 5 * MIN, 'dev-t02.md': 20 * MIN }, '⚠ painel.json sem alterações há 2 h, mas critico-t02.md é de há 5 min'],
  ['59 s de diferença', 359 * S, { 'dev-t02.md': 300 * S }, null],
  ['60 s de diferença', 360 * S, { 'dev-t02.md': 300 * S }, null],
  ['o .md mais antigo do que o painel.json', 0, { 'dev-t02.md': 300 * S }, null],
];
for (const [nome, painelHa, checkpoints, esperado] of CASOS) {
  test(`C4: painel.json atrasado, ${nome}: ${esperado ? 'aviso literal' : 'sem aviso'}`, async () => {
    const txt = await depois(0, { painelHa, checkpoints });
    assert.deepEqual(atraso(txt), esperado ? [esperado] : [], txt);
  });
}

test('C4: só conta o .md mais recente: painel.json, *.tmp*, outros ficheiros e pastas não dão aviso falso', async () => {
  const p = projeto({ painelHa: 10 * MIN, checkpoints: { 'dev-t02.md': 10 * MIN } });
  const novo = (rel) => { writeFileSync(join(p.dir, rel), '{}'); utimesSync(join(p.dir, rel), AGORA / 1000, AGORA / 1000); };
  for (const f of ['painel.json.tmp-1234', 'nota.md.tmp-99', 'painel.json.4321.tmp', 'notas.txt', 'estado.json']) novo(f);
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  await painel.volta(r.$);
  const txt = await painel.ecra(r.$, 200);
  assert.deepEqual(atraso(txt), [], txt);
});

test('C4: a 34 e a 60 colunas nenhuma linha passa da largura, com todos os avisos, agentes, terminados e quota', async () => {
  const longo = 'desenvolvedor-coração-ação-'.repeat(3);
  const p = projeto({
    painel: { ...base(), projeto: 'Coração da Floresta 🚀 '.repeat(4), objetivo: 'Pôr o painel a mostrar ação e pão '.repeat(5), agentes: [...base().agentes, ag(longo, 'dev', 'T-02-ÁÉÍÓÚ-muito-comprido', `${longo}.md`, 65535)] },
    painelHa: 3 * H, checkpoints: { 'dev-t02.md': 61 * S, 'orfao.md': 45 * MIN, [`${longo}-checkpoint-muito-comprido.md`]: 10 * S },
  });
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  r.ctl.agentes = [agente('a1', 'dev-t02', 'running'), agente('a2', longo, 'waiting'), agente('a3', `${longo}-terminado`, 'failed'), agente('a4', 'ok', 'completed')];
  r.ctl.rateLimits = [{ kind: 'five_hour', percentUsed: 99.9, resetsAt: iso(AGORA + H) }, { kind: 'seven_day', percentUsed: 41.5, resetsAt: iso(AGORA - MIN) }, { kind: 'um_limite_de_gasto_com_nome_comprido', percentUsed: 120, resetsAt: iso(AGORA + 2 * H) }];
  await painel.volta(r.$);
  writeFileSync(p.file, '{ partido');
  await r.ctl.avancar(S);
  await painel.volta(r.$);
  await r.ctl.avancar(45 * S);
  for (const L of [34, 60]) {
    const ls = linhas(await painel.ecra(r.$, L));
    const largas = ls.filter((l) => largura(l) > L);
    assert.deepEqual(largas, [], `${L} colunas`);
    assert.ok(ls.some((l) => l.startsWith('⚠ relógio')) && ls.some((l) => l.startsWith('⚠ painel.json ilegív')) && ls[0].startsWith('⟳'), `${L} colunas: faltam avisos:\n${ls.join('\n')}`);
    assert.doesNotMatch(ls.join('\n'), /\btok/i, 'o painel mostra tokens');
  }
});