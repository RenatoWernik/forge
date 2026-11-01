// Ronda −1 do F-24 (#80), C2 e comentário do orquestrador (ponto 1): o vigia do contexto `.claude/hooks/forge-contexto.mjs`.
// Oráculo: transcripts JSONL de fixture (helpers.mjs), a pasta temporária do estado em TMPDIR/TEMP/TMP do teste, e o JSON literal do contrato.
// Cada chamada sai com 0 em ≤ 2 s; «nada» = stdout vazio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, basename } from 'node:path';
import * as H from './helpers.mjs';

const tempo = (r) => assert.ok(r.ms <= 2000, `o hook demorou ${r.ms} ms (limite 2 s): ${H.mostra(r)}`);
const calado = (r, porque) => { assert.equal(r.status, 0, H.mostra(r)); tempo(r); assert.equal(r.stdout.trim(), '', `${porque}: ${H.mostra(r)}`); };
const avisa = (r, evento, n, nivel = 'WARNING') => { assert.equal(r.status, 0, H.mostra(r)); tempo(r); assert.deepEqual(H.saidaHook(r), H.avisoEsperado(evento, n, nivel), H.mostra(r)); };
const em = (c, p, o = {}) => H.transcript(c.tr, [H.utilizador(), H.assistente(H.pct(p), o)]);

test('C2: 84 % não imprime nada, mesmo com output_tokens que o levariam acima de 85 % se contassem', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(em(c, 84, { saida: 20000 })), '84 % avisou');
});

for (const evento of ['UserPromptSubmit', 'PostToolUse']) {
  test(`C2: 85 % no ${evento} imprime o CONTEXT WARNING literal com o hookEventName ${evento}`, async () => {
    const c = await H.cenarioContexto();
    avisa(c.chama(em(c, 85), { evento }), evento, 85);
  });
}

test('C2: só nas transições: 85 WARNING, 86 nada, 90 CRITICAL, 91 nada, 50 nada, 85 WARNING outra vez (mesma sessão)', async () => {
  const c = await H.cenarioContexto();
  const passo = (p, evento = 'UserPromptSubmit') => c.chama(em(c, p), { evento });
  avisa(passo(85), 'UserPromptSubmit', 85);
  calado(passo(86, 'PostToolUse'), '86 % depois de 85 % repetiu o aviso');
  avisa(passo(90, 'PostToolUse'), 'PostToolUse', 90, 'CRITICAL');
  calado(passo(91), '91 % depois de 90 % repetiu o aviso');
  calado(passo(87), '87 % depois de 90 % avisou (não houve passagem de baixo de 85 %)');
  calado(passo(50), '50 % avisou');
  avisa(passo(85), 'UserPromptSubmit', 85);
});

test('C2: o <n> é o inteiro de baixo da percentagem (85,9 % dá 85%, 90,9 % dá 90%)', async () => {
  const c = await H.cenarioContexto();
  avisa(c.chama(H.transcript(c.tr, [H.assistente(171800)])), 'UserPromptSubmit', 85);
  avisa(c.chama(H.transcript(c.tr, [H.assistente(181800)])), 'UserPromptSubmit', 90, 'CRITICAL');
});

test('C2: de baixo de 85 % direto para 92 % imprime um só JSON, o CONTEXT CRITICAL', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(em(c, 40)), '40 % avisou');
  avisa(c.chama(em(c, 92)), 'UserPromptSubmit', 92, 'CRITICAL');
});

test('C2: entradas isSidechain: true mais recentes são ignoradas, nos dois sentidos', async () => {
  const a = await H.cenarioContexto();
  calado(a.chama(H.transcript(a.tr, [H.assistente(H.pct(50)), H.utilizador('x', true), H.assistente(H.pct(95), { lateral: true })])), 'contou uma entrada lateral de 95 %');
  const b = await H.cenarioContexto();
  avisa(b.chama(H.transcript(b.tr, [H.assistente(H.pct(85)), H.assistente(H.pct(10), { lateral: true })])), 'UserPromptSubmit', 85);
});

test('C2: conta a ÚLTIMA entrada assistant (não a maior), mesmo com entradas user depois dela', async () => {
  const a = await H.cenarioContexto();
  calado(a.chama(H.transcript(a.tr, [H.assistente(H.pct(95)), H.utilizador(), H.assistente(H.pct(50))])), 'usou uma entrada anterior de 95 %');
  const b = await H.cenarioContexto();
  avisa(b.chama(H.transcript(b.tr, [H.assistente(H.pct(30)), H.assistente(H.pct(85)), H.utilizador('resultado da ferramenta'), H.utilizador()])), 'UserPromptSubmit', 85);
});

test('C2: modelo terminado em [1m] usa a janela de 1000000 (850000 avisa 85 %, 170000 fica calado)', async () => {
  const a = await H.cenarioContexto();
  avisa(a.chama(H.transcript(a.tr, [H.assistente(850000, { modelo: 'claude-opus-5-5[1m]' })])), 'UserPromptSubmit', 85);
  const b = await H.cenarioContexto();
  calado(b.chama(H.transcript(b.tr, [H.assistente(170000, { modelo: 'claude-opus-5-5[1m]' })])), '17 % de 1M avisou (usou a janela de 200000)');
});

test('C2: FORGE_CONTEXT_WINDOW=1000 manda, também sobre o [1m]', async () => {
  const a = await H.cenarioContexto();
  avisa(a.chama(H.transcript(a.tr, [H.assistente(850)]), { env: { FORGE_CONTEXT_WINDOW: '1000' } }), 'UserPromptSubmit', 85);
  const b = await H.cenarioContexto();
  avisa(b.chama(H.transcript(b.tr, [H.assistente(905, { modelo: 'claude-opus-5-5[1m]' })]), { env: { FORGE_CONTEXT_WINDOW: '1000' } }), 'UserPromptSubmit', 90, 'CRITICAL');
});

for (const v of ['0', '-5', 'abc', '1.5', '', '1e3']) {
  test(`C2: FORGE_CONTEXT_WINDOW=${JSON.stringify(v)} não é um inteiro > 0 e cai na janela do modelo (170000 de 200000 = 85 %)`, async () => {
    const c = await H.cenarioContexto();
    avisa(c.chama(em(c, 85), { env: { FORGE_CONTEXT_WINDOW: v } }), 'UserPromptSubmit', 85);
  });
}

test('C2: falha aberta: transcript em falta, uma pasta, sem usage, só entradas user, linhas partidas, stdin vazio ou que não é JSON: nada, exit 0', async () => {
  const c = await H.cenarioContexto();
  calado(c.chama(join(c.tr, 'nao-existe.jsonl')), 'transcript em falta');
  calado(c.chama(c.tr), 'transcript que é uma pasta');
  calado(c.chama(H.transcript(c.tr, [H.utilizador(), H.assistente(H.pct(90), { semUsage: true })], 'sem-usage.jsonl')), 'sem usage');
  calado(c.chama(H.transcript(c.tr, [H.utilizador(), H.utilizador()], 'so-user.jsonl')), 'só user');
  calado(c.chama(H.transcript(c.tr, ['{"type":"assistant","message":{"usage":', 'lixo'], 'partido.jsonl')), 'linhas partidas');
  for (const input of ['', 'isto não é JSON', '[]', 'null']) {
    const r = H.corre(c.proj, join(c.proj, H.CONTEXTO), { input, env: { CLAUDE_PROJECT_DIR: c.proj, TMPDIR: c.estado, TEMP: c.estado, TMP: c.estado } });
    calado(r, `stdin ${JSON.stringify(input)}`);
  }
});

test('C2: o nível vive em <tmpdir>/forge-contexto-<sha256(session_id) em 16 hex>.json e não fica mais nada na pasta temporária', async () => {
  const c = await H.cenarioContexto();
  const sessao = 'sessão-f24/ünicode e espaços';
  avisa(c.chama(em(c, 85), { sessao }), 'UserPromptSubmit', 85);
  avisa(c.chama(em(c, 90), { sessao }), 'UserPromptSubmit', 90, 'CRITICAL');
  const f = H.ficheiroEstado(c.estado, sessao);
  assert.ok(H.existsSync(f), 'falta o ficheiro de estado ' + basename(f));
  assert.deepEqual(H.readdirSync(c.estado), [basename(f)], 'sobras na pasta temporária (escrita por temp e rename)');
});

test('C2: cada session_id tem o seu nível: o aviso de uma sessão não cala o da outra', async () => {
  const c = await H.cenarioContexto();
  const tr = em(c, 85);
  avisa(c.chama(tr, { sessao: 's-um' }), 'UserPromptSubmit', 85);
  avisa(c.chama(tr, { sessao: 's-dois' }), 'UserPromptSubmit', 85);
  calado(c.chama(tr, { sessao: 's-um' }), 'repetiu o aviso de s-um');
});

test('C2 (comentário do orquestrador, ponto 1): com o payload de um subagente (agent_id, agent_type) fica calado, e não gasta o aviso da sessão principal', async () => {
  const c = await H.cenarioContexto();
  const tr = em(c, 85);
  for (const evento of ['PostToolUse', 'UserPromptSubmit']) calado(c.chama(tr, { evento, agente: { agent_id: 'a7f3c2e1b9', agent_type: 'critic' } }), `avisou um subagente no ${evento}`);
  calado(c.chama(em(c, 92), { evento: 'PostToolUse', agente: { agent_id: 'a7f3c2e1b9', agent_type: 'general-purpose' } }), 'avisou um subagente a 92 %');
  avisa(c.chama(tr, { evento: 'PostToolUse' }), 'PostToolUse', 85);
});

test('C2 (comentário do orquestrador, ponto 1): com o transcript de um subagente (subagents/agent-*.jsonl, só isSidechain: true) fica calado', async () => {
  const c = await H.cenarioContexto();
  const tr = H.transcript(join(c.tr, 'sessao-1', 'subagents'), [H.utilizador('tarefa', true), H.assistente(H.pct(95), { lateral: true }), H.utilizador('resultado', true)], 'agent-a7f3c2e1b9.jsonl');
  calado(c.chama(tr, { evento: 'PostToolUse' }), 'avisou com o transcript de um subagente');
});

test('C2: um transcript real de 16 MB a 85 % avisa em ≤ 2 s', async () => {
  const c = await H.cenarioContexto();
  const grande = 'x'.repeat(1500);
  const es = [];
  for (let i = 0; i < 5000; i++) { es.push(H.utilizador(grande + i)); es.push(H.assistente(H.pct(10 + (i % 70)))); es.push(H.utilizador(grande)); }
  es.push(H.assistente(H.pct(85)));
  const tr = H.transcript(c.tr, es, 'grande.jsonl');
  avisa(c.chama(tr), 'UserPromptSubmit', 85);
});