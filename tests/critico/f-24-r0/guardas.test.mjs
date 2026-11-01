// Ronda −1 do F-24 (#80): guardas dos oráculos. Verdes na base: provam que as fixtures, os goldens e o arnês dizem o que o contrato diz,
// para que um ataque vermelho seja culpa da entrega e não do oráculo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as H from './helpers.mjs';

test('guarda: com TZ=Europe/Lisbon, o Node desta máquina dá WET (UTC+0) a 31/10 e 01/11/2026 e WEST (UTC+1) em julho', () => {
  const r = H.corre(H.ROOT, '-e', { args: ['process.stdout.write(JSON.stringify([new Date(2026,9,31,17,0).getTime(), new Date(2026,10,1,0,2).getTime(), new Date(2026,6,1,12,0).getTime()]))'], env: { TZ: H.TZ } });
  assert.equal(r.status, 0, H.mostra(r));
  assert.deepEqual(JSON.parse(r.stdout), [Date.UTC(2026, 9, 31, 17, 0), Date.UTC(2026, 10, 1, 0, 2), Date.UTC(2026, 6, 1, 11, 0)]);
  assert.deepEqual(H.formas(H.local(2026, 10, 31, 19, 0)), { local: '2026-10-31 19:00', cron: '0 19 31 10 *' });
  assert.deepEqual(H.formas(H.local(2026, 11, 1, 0, 1)), { local: '2026-11-01 00:01', cron: '1 0 1 11 *' });
});

test('guarda: o os.tmpdir() de um filho é a pasta de TMPDIR/TEMP/TMP que o teste lhe dá, e o nome do estado é o sha256 em 16 hex', async () => {
  const c = await H.cenarioContexto();
  const r = H.corre(c.proj, '-e', { args: ['process.stdout.write(require("os").tmpdir())'], env: { TMPDIR: c.estado, TEMP: c.estado, TMP: c.estado } });
  assert.equal(r.stdout.replace(/[\\/]+$/, '').toLowerCase(), c.estado.replace(/[\\/]+$/, '').toLowerCase());
  assert.equal(H.ficheiroEstado('x', 'abc'), join('x', 'forge-contexto-' + 'ba7816bf8f01cfea' + '.json'));
  assert.equal(createHash('sha256').update('abc').digest('hex').slice(0, 16), 'ba7816bf8f01cfea');
});

test('guarda: as fixtures de transcript somam os três campos de usage na percentagem pedida, e o output_tokens fica fora', () => {
  for (const p of [50, 84, 85, 86, 90, 92]) {
    const e = H.assistente(H.pct(p), { saida: 20000 });
    const u = e.message.usage;
    assert.equal(u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens, H.pct(p));
    assert.equal(Math.floor((100 * H.pct(p)) / H.JANELA), p);
  }
  assert.equal(Math.floor((100 * 171800) / H.JANELA), 85); // 85,9 %: o <n> é 85
  assert.equal(Math.floor((100 * H.pct(84)) / H.JANELA) < 85 && Math.floor((100 * (H.pct(84) + 20000)) / H.JANELA) >= 85, true, 'o caso 84 % só passa de 85 % se o output_tokens contar');
});

test('guarda: o aviso esperado é o JSON do contrato, com o evento e o nível no sítio certo', () => {
  const w = H.avisoEsperado('PostToolUse', 85);
  assert.equal(w.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(w.hookSpecificOutput.additionalContext.startsWith('CONTEXT WARNING: 85% of the context is used. Save .checkpoints/orchestrator.md'));
  assert.ok(w.hookSpecificOutput.additionalContext.endsWith('Never ask the user to open a new session.'));
  assert.ok(H.avisoEsperado('UserPromptSubmit', 90, 'CRITICAL').hookSpecificOutput.additionalContext.startsWith('CONTEXT CRITICAL: 90% '));
});

test('guarda: a fixture do C5 é um painel.json válido, e o leitor partilhado dá 9 ativo, 10 e 31 parados, um sem ficheiro', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5());
  const { validar, ler } = await H.leitor();
  const texto = H.readFileSync(join(H.CP(proj), 'painel.json'), 'utf8');
  assert.deepEqual(validar(JSON.parse(texto)), []);
  const { statSync } = await import('node:fs');
  const mt = {};
  for (const n of ['dev-a.md', 'dev-b.md', 'dev-d.md', 'critico-e.md']) mt[n] = statSync(join(H.CP(proj), n)).mtimeMs;
  assert.equal(H.existsSync(join(H.CP(proj), 'tester-c.md')), false);
  const v = ler(texto, mt, H.AGORA).agentes.map((a) => [a.nome, a.vida, a.minutos]);
  assert.deepEqual(v, [['dev-a', 'ativo', 9], ['dev-b', 'sem sinal', 10], ['tester-c', 'a começar', null], ['dev-d', 'parado?', 45], [H.NOME_SUJO, 'parado?', 31]]);
  assert.equal(Math.floor((H.AGORA - statSync(join(H.CP(proj), 'orchestrator.md')).mtimeMs) / H.MIN), 3);
});

test('guarda: o vigia do F-13 acorda na fixture do C5 os mesmos três agentes da golden, com o nome limpo da mesma maneira', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5());
  const r = H.corre(proj, join(H.ROOT, 'scripts/hooks/forge-vigia-de-agentes.mjs'), { input: '{}', env: { CLAUDE_PROJECT_DIR: proj, ...H.relogio() } });
  assert.equal(r.status, 0, H.mostra(r));
  const l = H.linhas(r.stdout).filter((x) => x.startsWith('- '));
  assert.deepEqual(l, ['- dev-b (ticket T2): 10 min since the last checkpoint', '- tester-c (ticket T3): no checkpoint file yet', `- ${H.NOME_LIMPO} (ticket T5): 31 min since the last checkpoint`]);
  const g = H.golden('c5.txt');
  for (const n of ['dev-b', 'tester-c', H.NOME_LIMPO]) assert.ok(g.some((x) => x.startsWith(`wake: ${n} (ticket `)), 'golden sem ' + n);
  assert.equal(g.filter((x) => x.startsWith('wake: ')).length, 3);
});

test('guarda: o forge.json gerado tem minutesWithoutProgress 30 e o painel.json gerado não tem agentes', async () => {
  const proj = await H.gerar();
  assert.equal(JSON.parse(H.le('.claude/forge.json', proj)).escalation.minutesWithoutProgress.value, 30);
  assert.deepEqual(JSON.parse(H.le('.checkpoints/painel.json', proj)).agentes, []);
});

const limpar = [];
after(() => { for (const f of limpar) f(); });
test('guarda: o check.cjs --env corre na caixa do F-20a com o espião e imprime linhas ok/FAIL (o arnês do C6 está vivo)', async () => {
  const proj = await H.gerar(), sb = H.caixa();
  limpar.push(() => H.rmSync(sb.dir, { recursive: true, force: true }));
  const r = await H.correCheck(proj, H.ambiente(sb, H.relogio()));
  assert.ok(r.linhas.some((l) => /^(ok {4}|FAIL {2})/.test(l)), r.out.slice(0, 1500));
  assert.ok(r.linhas.some((l) => l.startsWith('ok    invariants:')), 'o check não chegou às linhas de texto:\n' + r.out.slice(0, 1500));
});

test('guarda: a merge-base com a origin/main existe e tem o vigia do F-13 e a lista do scaffold.test.mjs', () => {
  assert.match(H.mergeBase(), /^[0-9a-f]{40}$/);
  assert.ok(H.naBase('scripts/hooks/forge-vigia-de-agentes.mjs')?.includes('forge idle watch'));
  assert.ok(H.naBase('scripts/scaffold.test.mjs')?.includes("'.claude/painel-vida.mjs',"));
});