// F-25: o F-11 continua a valer. O painel nunca abre sozinho (resposta 8), nunca mostra tokens (resposta 7) e fora de um projeto
// forge não lê ficheiros nem corre processos, com o relógio, o vigia e os eventos novos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, AGORA, H, criar, runtime, projeto, agente, iso, flush } from './helpers.mjs';

const EVENTOS = [
  ['session.start', { source: 'startup' }],
  ['prompt.submit', { prompt: 'olá', isMeta: false }],
  ['tool.call', { tool: 'Read', input: {} }],
  ['agent.spawn', { tool_use_id: 'tu', prompt: 'p', description: 'd', subagentType: 'Explore', background: true, fork: false, name: 'x' }, { agentId: 'x1', model: 'claude-haiku-5-5' }],
  ['tool.call', { agentId: 'x1', tool: 'Bash', input: {} }],
  ['turn.complete', { agentId: 'x1' }],
  ['session.measure', { context: { percentUsed: 50 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(AGORA + H) }], changed: ['rateLimits'] }],
];
const percorrer = async (painel, r) => {
  for (const [ev, e, res] of EVENTOS) { await painel.evento(ev, r.$, e, res); await flush(); await r.ctl.avancar(16 * S); }
  await r.ctl.disparar();
  await painel.volta(r.$);
  await flush();
};

for (const paineis of [[], ['forge-painel']]) {
  test(`F-11: com o pane ${paineis.length ? 'aberto' : 'fechado'}, nenhum evento, timer ou volta abre o painel`, async () => {
    const r = runtime({ raiz: projeto().raiz, paineis });
    r.ctl.agentes = [agente('x1', 'x', 'running')];
    const painel = await criar();
    await percorrer(painel, r);
    assert.deepEqual(r.log.abertos, []);
  });
}

test('F-11: o painel nunca mostra tokens, mesmo com o usage a trazê-los', async () => {
  const r = runtime({ raiz: projeto().raiz });
  r.ctl.agentes = [agente('x1', 'x', 'running')];
  r.ctl.rateLimits = [{ kind: 'five_hour', percentUsed: 20, resetsAt: iso(AGORA + H) }];
  const painel = await criar();
  await percorrer(painel, r);
  for (const L of [34, 60, 200]) assert.doesNotMatch(await painel.ecra(r.$, L), /\btok|123456|200000/i);
});

test('F-11: fora de um projeto forge, nenhum evento, timer, volta ou comando lê ficheiros, corre processos ou abre o painel', async () => {
  const p = projeto({ forge: false });
  const r = runtime({ raiz: p.raiz, paineis: ['forge-painel'] });
  r.ctl.agentes = [agente('x1', 'x', 'running')];
  const painel = await criar();
  await percorrer(painel, r);
  const res = await painel.evento('command.run', r.$, { command: 'forge-painel', args: '' });
  await flush();
  await r.ctl.disparar();
  assert.match(res?.text ?? '', /este projeto não é um projeto forge/);
  const lidos = r.log.fs.filter(([op]) => op !== 'exists').map(([op, f]) => `${op} ${f}`);
  assert.deepEqual(lidos, [], 'leu ficheiros fora de um projeto forge');
  assert.ok(r.log.fs.every(([, f]) => /forge\.json$/.test(f)), 'perguntou por outro ficheiro além do forge.json');
  assert.deepEqual(r.log.processos, []);
  assert.deepEqual(r.log.abertos, []);
});