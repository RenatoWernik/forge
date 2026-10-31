// F-25 C3: o relógio rearma-se. criarRelogio() dá { armar, vigiar, volta } com estado próprio; armar cancela o timer anterior e cria
// $.clock.every(5000, volta); vigiar rearma e dá uma volta quando a última tem mais de 15 s; a volta tem guarda (presa > 20 s
// liberta-se) e cada chamada a $ tem 4 s (corrida com $.clock.sleep). Oráculo: o $ falso com relógio controlado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, criar, runtime, projeto, agente, linhas, flush, ate, quota, iso, AGORA, H } from './helpers.mjs';

const PANE = 'forge-painel';
const ativos = (r) => r.everys().filter((t) => !t.cancelado);

test('C3: session.start com o pane do forge aberto arma 1 every de 5000 ms; com o pane fechado, nenhum; o comando regista-se sempre', async () => {
  for (const [paineis, n] of [[[PANE], 1], [[], 0], [['outro-pane'], 0]]) {
    const r = runtime({ raiz: projeto().raiz, paineis });
    const painel = await criar();
    await painel.evento('session.start', r.$, { source: 'startup' });
    await flush();
    assert.equal(r.everys().length, n, `panes ${JSON.stringify(paineis)}: ${r.everys().length} every`);
    assert.ok(r.everys().every((t) => t.ms === 5000), 'o every não é de 5000 ms');
    assert.ok(r.log.comandos.some((c) => c.name === 'forge-painel'), 'o session.start deixou de registar o comando');
    assert.deepEqual(r.log.abertos, [], 'o session.start abriu o painel (nunca abre sozinho)');
  }
});

test('C3: dois session.start com o pane aberto: o primeiro timer é cancelado e só o segundo fica armado', async () => {
  const r = runtime({ raiz: projeto().raiz, paineis: [PANE] });
  const painel = await criar();
  await painel.evento('session.start', r.$, { source: 'startup' });
  await painel.evento('session.start', r.$, { source: 'resume' });
  await flush();
  assert.equal(r.everys().length, 2);
  assert.deepEqual(r.everys().map((t) => t.cancelado), [true, false]);
});

test('C3: o command.run do /forge-painel arma sempre (e cancela o anterior); o ui.close cancela', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  const res = await painel.evento('command.run', r.$, { command: 'forge-painel', args: '' });
  assert.equal(typeof res?.text, 'string');
  await painel.evento('command.run', r.$, { command: 'forge-painel', args: '' });
  await flush();
  assert.deepEqual(r.everys().map((t) => [t.ms, t.cancelado]), [[5000, true], [5000, false]]);
  await painel.evento('ui.close', r.$, { id: PANE });
  assert.deepEqual(ativos(r), [], 'o ui.close não cancelou o timer');
});

test('C3: o timer chama a volta: cada disparo lê os agentes', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  await painel.evento('command.run', r.$, { command: 'forge-painel', args: '' });
  await flush();
  const n = r.log.agentList.length;
  await r.ctl.avancar(5 * S);
  await r.ctl.disparar();
  assert.equal(r.log.agentList.length, n + 1, 'o disparo do every não deu uma volta');
});

const EVENTOS = {
  'tool.call': [{ tool: 'Read', input: {} }],
  'turn.complete': [{ stopReason: 'end_turn' }],
  'prompt.submit': [{ prompt: 'olá', isMeta: false }],
  'agent.spawn': [{ tool_use_id: 'tu-1', prompt: 'faz', description: 'x', subagentType: 'Explore', background: true, fork: false, name: 'novo' }, { agentId: 'n1', model: 'claude-haiku-5-5' }],
  'session.measure': [{ context: { percentUsed: 10 }, rateLimits: [], changed: ['context'] }],
};
for (const [ev, [e, res]] of Object.entries(EVENTOS)) {
  test(`C3: vigiar em ${ev}: 16 s depois da última volta rearma e dá 1 volta; aos 10 s, nada`, async () => {
    for (const [ms, esperado] of [[16 * S, 1], [10 * S, 0]]) {
      const r = runtime({ raiz: projeto().raiz });
      const painel = await criar();
      await painel.volta(r.$);
      await flush();
      const [nEvery, nList] = [r.everys().length, r.log.agentList.length];
      await r.ctl.avancar(ms);
      await painel.evento(ev, r.$, e, res);
      await flush();
      assert.equal(r.everys().length - nEvery, esperado, `${ms / S} s: ${r.everys().length - nEvery} every novos`);
      assert.equal(r.log.agentList.length - nList, esperado, `${ms / S} s: ${r.log.agentList.length - nList} voltas`);
      assert.ok(ativos(r).length <= 1, 'ficou mais de um timer armado');
      assert.deepEqual(r.log.abertos, [], 'o vigia abriu o painel (nunca abre sozinho)');
    }
  });
}

test('C3: guarda: uma volta que corre impede a seguinte de ler; aos 19 s ainda guarda, aos 21 s está presa e liberta-se', async () => {
  const r = runtime({ raiz: projeto().raiz });
  const painel = await criar();
  r.ctl.agentes = 'pendura';
  r.ctl.usage = 'pendura';
  r.ctl.lerPendura = true;
  r.ctl.sleepPreso = true;
  void painel.volta(r.$);
  await flush();
  const lidas = r.leituras();
  assert.ok(r.log.agentList.length === 1, 'a primeira volta não leu os agentes');
  await r.ctl.avancar(S);
  const v2 = await ate(painel.volta(r.$));
  assert.equal(v2.feito, true, 'a segunda volta ficou à espera da primeira em vez de sair');
  assert.equal(r.leituras(), lidas, 'a segunda volta leu com outra a correr');
  await r.ctl.avancar(18 * S);
  await ate(painel.volta(r.$), 500);
  assert.equal(r.leituras(), lidas, 'aos 19 s a guarda já não guardava');
  await r.ctl.avancar(2 * S);
  void painel.volta(r.$);
  await flush();
  assert.equal(r.log.agentList.length, 2, 'aos 21 s a guarda presa não foi libertada');
});

test('C3: um $.fs.read que nunca resolve não para as outras leituras: agentes e quota atualizam-se na mesma volta, que acaba aos 4 s', async () => {
  const p = projeto();
  const r = runtime({ raiz: p.raiz });
  const painel = await criar();
  r.ctl.agentes = [agente('a1', 'dev-t02', 'running')];
  r.ctl.rateLimits = [{ kind: 'five_hour', percentUsed: 30, resetsAt: iso(AGORA + H) }];
  r.ctl.lerPendura = true;
  let feita = false;
  const v = painel.volta(r.$).then(() => { feita = true; });
  await flush();
  assert.equal(r.log.agentList.length, 1, 'os agentes não se leram em paralelo com o painel.json');
  assert.equal(r.log.usage.length, 1, 'a quota não se leu em paralelo com o painel.json');
  await r.ctl.avancar(3999);
  assert.equal(feita, false, 'a volta acabou antes dos 4 s');
  await r.ctl.avancar(1);
  assert.equal((await ate(v)).feito, true, 'a volta não acabou aos 4 s do relógio falso');
  const txt = await painel.ecra(r.$, 200);
  assert.ok(linhas(txt).some((l) => l.startsWith('● dev-t02 · ativo · ')), `os agentes não se atualizaram:\n${txt}`);
  assert.ok((quota(txt) ?? []).includes('5 h 30% · reinicia 13:00'), `a quota não se atualizou:\n${txt}`);
});