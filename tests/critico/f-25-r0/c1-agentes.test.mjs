// F-25 C1: os agentes vêm do motor ($.agent.list, agent.spawn, tool.call e turn.complete com agentId); o painel.json só junta,
// pelo nome, ticket, papel, checkpoint e porta. Oráculo: o $ falso com relógio controlado e as linhas literais do contrato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, MIN, AGORA, criar, runtime, projeto, agente, linhas, bloco, flush, ate } from './helpers.mjs';

const spawn = (name, subagentType = 'general-purpose') => ({ tool_use_id: `tu-${name}`, prompt: 'faz', description: `tarefa de ${name}`, subagentType, background: true, fork: false, name });

// A fixture do oráculo: o motor lista 3 agentes do painel.json (running, waiting, completed) e um sem ficha; o painel.json tem
// também «orfao», que o motor não conhece; um agent.spawn, um tool.call e dois turn.complete com agentId
const cenario = async () => {
  const p = projeto();
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  r.ctl.agentes = [agente('a1', 'dev-t02', 'running'), agente('a2', 'critico-t02', 'waiting'), agente('a3', 'tester-x', 'completed'), agente('a4', 'sem-ficha', 'running', 'Explore')];
  await painel.evento('agent.spawn', r.$, spawn('dev-t02'), { agentId: 'a1', model: 'claude-sonnet-5-5' });
  await painel.evento('agent.spawn', r.$, spawn('sem-ficha', 'Explore'), { agentId: 'a4', model: 'claude-haiku-5-5' });
  await painel.volta(r.$);
  await r.ctl.avancar(3 * S);
  await painel.evento('turn.complete', r.$, { agentId: 'a2' });
  await r.ctl.avancar(3 * S);
  await painel.evento('tool.call', r.$, { agentId: 'a1', tool: 'Read', input: {} });
  await r.ctl.avancar(2 * S);
  await painel.evento('turn.complete', r.$, { agentId: 'a4' });
  await r.ctl.avancar(2 * S);
  const antes = r.log.agentList.length;
  await painel.volta(r.$);
  await flush();
  return { r, painel, antes, txt: await painel.ecra(r.$, 200) };
};

test('C1: cada volta chama $.agent.list()', async () => {
  const { r, antes } = await cenario();
  assert.equal(r.log.agentList.length, antes + 1, 'a volta não chamou $.agent.list() exatamente 1 vez');
});

test('C1: um agente ativo mostra «● <nome> · <ativo|à espera> · sinal há <N s>», com o sinal do último tool.call ou turn.complete', async () => {
  const { txt } = await cenario();
  const ls = linhas(txt);
  for (const l of ['● dev-t02 · ativo · sinal há 4 s', '● critico-t02 · à espera · sinal há 7 s', '● sem-ficha · ativo · sinal há 2 s'])
    assert.ok(ls.includes(l), `falta a linha «${l}»:\n${txt}`);
});

test('C1: os terminados não têm linha «●»; ficam numa só linha «terminaram: ✓ <nome> <N> min»', async () => {
  const { txt } = await cenario();
  const ls = linhas(txt);
  assert.equal(bloco(txt, 'tester-x'), null, `um agente completed aparece como ativo:\n${txt}`);
  const t = ls.filter((l) => l.includes('terminaram'));
  assert.equal(t.length, 1, `não há exatamente uma linha «terminaram:»:\n${txt}`);
  assert.match(t[0], /^terminaram: /);
  assert.match(t[0], /✓ tester-x \d+ min/);
});

test('C1: junção pelo nome: o agente do motor leva o ticket, o papel e a porta do painel.json, mas não o modelo dele', async () => {
  const { txt } = await cenario();
  const b = bloco(txt, 'dev-t02');
  assert.ok(b, `sem bloco de dev-t02:\n${txt}`);
  assert.match(b, /T-02/);
  assert.match(b, /\bdev\b/);
  assert.match(b, /4801/);
  assert.doesNotMatch(b, /modelo-do-json/, 'o modelo veio do painel.json, que só junta ticket, papel, checkpoint e porta');
  assert.match(bloco(txt, 'critico-t02') ?? '', /T-02/);
});

test('C1: um agente do motor sem entrada no painel.json aparece com o ticket «—» e o papel «agente»', async () => {
  const { txt } = await cenario();
  const b = bloco(txt, 'sem-ficha');
  assert.ok(b, `sem bloco de sem-ficha:\n${txt}`);
  assert.match(b, /—/);
  assert.match(b, /\bagente\b/);
});

test('C1: um agente do painel.json que o motor não lista continua com a vida pelo checkpoint, marcado « · só painel.json»', async () => {
  const { txt } = await cenario();
  const l = linhas(txt).find((x) => x.startsWith('● orfao · '));
  assert.ok(l, `sem a linha de orfao:\n${txt}`);
  assert.match(l, /parado\?/, 'a vida não é a do checkpoint (45 min = parado?)');
  assert.match(l, / · só painel\.json$/);
  for (const n of ['dev-t02', 'critico-t02', 'sem-ficha']) assert.doesNotMatch(bloco(txt, n), /só painel\.json/, n + ' é do motor');
});

test('C1: o sinal em minutos: «sinal há 2 min»', async () => {
  const p = projeto();
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  r.ctl.agentes = [agente('a1', 'dev-t02', 'running')];
  await painel.evento('agent.spawn', r.$, spawn('dev-t02'), { agentId: 'a1', model: 'claude-sonnet-5-5' });
  await painel.volta(r.$);
  await painel.evento('tool.call', r.$, { agentId: 'a1', tool: 'Bash', input: {} });
  await r.ctl.avancar(2 * MIN);
  await painel.volta(r.$);
  assert.ok(linhas(await painel.ecra(r.$, 200)).includes('● dev-t02 · ativo · sinal há 2 min'));
});

test('C1: ✓ para completed, ✕ para failed e killed; N = minutos desde o fim; ao fim de 30 min saem do painel', async () => {
  const p = projeto({ painel: { versao: 1, modo: 'rigoroso', tickets: [], agentes: [] }, checkpoints: {} });
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  r.ctl.agentes = [agente('b1', 'feito-z', 'running'), agente('b2', 'falhou-y', 'running'), agente('b3', 'morto-w', 'running')];
  await painel.volta(r.$);
  await r.ctl.avancar(MIN);
  r.ctl.agentes = [agente('b1', 'feito-z', 'completed'), agente('b2', 'falhou-y', 'failed'), agente('b3', 'morto-w', 'killed')];
  await painel.volta(r.$);
  await r.ctl.avancar(2 * MIN);
  await painel.volta(r.$);
  let txt = await painel.ecra(r.$, 200);
  const t = linhas(txt).filter((l) => l.includes('terminaram'));
  assert.equal(t.length, 1, `não há exatamente uma linha «terminaram:»:\n${txt}`);
  for (const s of ['✓ feito-z 2 min', '✕ falhou-y 2 min', '✕ morto-w 2 min']) assert.ok(t[0].includes(s), `falta «${s}» em «${t[0]}»`);
  for (const n of ['feito-z', 'falhou-y', 'morto-w']) assert.equal(bloco(txt, n), null, n + ' terminou e aparece como ativo');
  await r.ctl.avancar(27 * MIN);
  await painel.volta(r.$);
  txt = await painel.ecra(r.$, 200);
  assert.ok(txt.includes('✓ feito-z 29 min'), `aos 29 min ainda conta:\n${txt}`);
  await r.ctl.avancar(2 * MIN);
  await painel.volta(r.$);
  txt = await painel.ecra(r.$, 200);
  assert.doesNotMatch(txt, /feito-z|falhou-y|morto-w/, `passados 30 min do fim, ainda aparecem:\n${txt}`);
});

test('C1: um agente que sai da lista conta como terminado só passados 15 s do lançamento', async () => {
  const p = projeto();
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  r.ctl.agentes = [agente('c1', 'sumiu', 'running')];
  await painel.evento('agent.spawn', r.$, spawn('sumiu'), { agentId: 'c1', model: 'claude-haiku-5-5' });
  await painel.volta(r.$);
  r.ctl.agentes = [];
  await r.ctl.avancar(10 * S);
  await painel.volta(r.$);
  let txt = await painel.ecra(r.$, 200);
  assert.match(linhas(txt).find((l) => l.startsWith('● sumiu · ')) ?? '', /^● sumiu · ativo · /, `aos 10 s do lançamento ainda é ativo:\n${txt}`);
  await r.ctl.avancar(6 * S);
  await painel.volta(r.$);
  txt = await painel.ecra(r.$, 200);
  assert.equal(bloco(txt, 'sumiu'), null, `aos 16 s, fora da lista, continua ativo:\n${txt}`);
  assert.match(linhas(txt).find((l) => l.includes('terminaram')) ?? '', /sumiu/, `aos 16 s não está em «terminaram:»:\n${txt}`);
});

for (const modo of ['rejeita', 'pendura']) {
  test(`C1: um agent.list que ${modo === 'rejeita' ? 'rejeita' : 'não responde em 4 s'} deixa os agentes da volta anterior`, async () => {
    const p = projeto();
    const r = runtime({ raiz: p.raiz });
    const painel = await criar();
    r.ctl.agentes = [agente('a1', 'dev-t02', 'running')];
    await painel.evento('agent.spawn', r.$, spawn('dev-t02'), { agentId: 'a1', model: 'claude-sonnet-5-5' });
    await painel.volta(r.$);
    await r.ctl.avancar(20 * S);
    r.ctl.agentes = modo;
    const v = painel.volta(r.$);
    await flush();
    await r.ctl.avancar(4 * S);
    assert.equal((await ate(v)).feito, true, 'a volta não acabou aos 4 s do relógio falso');
    const txt = await painel.ecra(r.$, 200);
    assert.match(linhas(txt).find((l) => l.startsWith('● dev-t02 · ')) ?? '', /^● dev-t02 · ativo · sinal há \d+ s$/, `o agente da volta anterior desapareceu:\n${txt}`);
    assert.doesNotMatch(linhas(txt).find((l) => l.includes('terminaram')) ?? '', /dev-t02/, 'uma lista que falhou não termina ninguém');
  });
}