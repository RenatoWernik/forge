// Ronda −1 do F-24 (#80), C5: o relatório da retoma, `node .claude/retoma.mjs`, corrido da raiz do projeto, como o manual o escreve.
// Oráculo: a fixture do contrato (agentes a 9, 10 e 31 min, um sem checkpoint, um num ticket main; minutesWithoutProgress 30) e a golden
// golden/c5.txt; o erro do painel.json é o do leitor partilhado (scripts/painel-leitor.mjs, de que o projeto tem a cópia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as H from './helpers.mjs';

const ok0 = (r) => assert.equal(r.status, 0, H.mostra(r));

test('C5: a fixture do contrato dá a golden (orchestrator, wake de 10 min, sem checkpoint e 31 min, escalate de 31 ≥ 30, nomes limpos)', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5());
  const r = H.retoma(proj);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), H.golden('c5.txt'));
});

test('C5: sem .checkpoints/orchestrator.md a 1.ª linha é «orchestrator: .checkpoints/orchestrator.md missing» e o resto não muda', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5(), { orq: null });
  const r = H.retoma(proj);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), [H.C5_ORQ_FALTA, ...H.golden('c5.txt').slice(1)]);
});

test('C5: sem nenhum agente a acordar (só um a 9 min e um num ticket main) a saída é a linha do orchestrator e «nothing to resume»', async () => {
  const proj = await H.gerar();
  H.painel(proj, [H.FIXTURE_C5()[0], H.FIXTURE_C5()[3], { nome: 'dev-f', ticket: 'T6', estado: 'aprovado', min: 50, checkpoint: 'dev-f.md' }], { orq: 0 });
  const r = H.retoma(proj);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), ['orchestrator: .checkpoints/orchestrator.md saved 0 min ago', 'nothing to resume']);
});

test('C5: um projeto acabado de gerar (painel sem agentes) dá «nothing to resume»', async () => {
  const proj = await H.gerar();
  const r = H.retoma(proj);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), [H.C5_ORQ_FALTA, 'nothing to resume']);
});

test('C5: o limiar vem do .claude/forge.json: com minutesWithoutProgress 40 o agente de 31 min acorda mas não escala', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5());
  H.forgeJson(proj, (j) => { j.escalation.minutesWithoutProgress.value = 40; });
  const r = H.retoma(proj);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), H.golden('c5.txt').filter((l) => !l.startsWith('escalate: ')));
});

test('C5: N igual ao limiar escala (≥): 30 min com minutesWithoutProgress 30', async () => {
  const proj = await H.gerar();
  H.painel(proj, [{ nome: 'dev-g', ticket: 'T7', estado: 'espera', min: 30, checkpoint: 'dev-g.md' }]);
  const r = H.retoma(proj);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), [
    'orchestrator: .checkpoints/orchestrator.md saved 3 min ago',
    'wake: dev-g (ticket T7): 30 min since .checkpoints/dev-g.md; SendMessage to dev-g, or relaunch it from that file',
    'escalate: dev-g passed minutesWithoutProgress (30 min): pass it in args.vida',
  ]);
});

test('C5: o relógio é FORGE_VIGIA_NOW_MS: 20 min mais tarde o agente de 9 min acorda (29 min, ainda sem escalar)', async () => {
  const proj = await H.gerar();
  H.painel(proj, [H.FIXTURE_C5()[0]]);
  const r = H.retoma(proj, H.AGORA + 20 * H.MIN);
  ok0(r);
  assert.deepEqual(H.linhas(r.stdout), [
    'orchestrator: .checkpoints/orchestrator.md saved 23 min ago',
    'wake: dev-a (ticket T1): 29 min since .checkpoints/dev-a.md; SendMessage to dev-a, or relaunch it from that file',
  ]);
});

for (const [caso, texto] of [['ausente', undefined], ['truncado', '{"versao":1,"modo":"rigoroso","tickets":[],"agen'], ['inválido', '{"versao":1,"modo":"x","tickets":[],"agentes":[]}']]) {
  test(`C5: um painel.json ${caso} dá «painel.json: <erro do leitor>» e sai com 0`, async () => {
    const proj = await H.gerar();
    H.painel(proj, []);
    const f = join(H.CP(proj), 'painel.json');
    if (texto === undefined) H.rmSync(f); else H.writeFileSync(f, texto);
    const { ler } = await H.leitor();
    const erro = ler(texto, {}, H.AGORA).erro;
    const r = H.retoma(proj);
    ok0(r);
    assert.ok(H.linhas(r.stdout).includes('painel.json: ' + erro), `falta a linha «painel.json: ${erro}»: ${H.mostra(r)}`);
  });
}