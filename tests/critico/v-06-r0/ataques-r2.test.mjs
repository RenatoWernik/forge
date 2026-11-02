// Crítico R2 do V-06 (#130, PR #144, HEAD 8a89800): ataques só contra a regra nova do veredito (RESPOSTA do orquestrador, #130 6561930327)
// e contra a correção 2 (fase velha). Copiado tal como estava no crítico (E:\Guilda\.checkpoints\critico-forge-v06-r2-scripts\ataques-r2.test.mjs);
// só mudaram os imports dos helpers e do avancar.
// B1: REPROVADO/APROVADO com sha curto (7 hex) de OUTRO head (o P1 do mesmo PR).
// B2: dois comentários com o mesmo createdAt: o último na ordem do gh decide; um REPROVADO depois do APROVADO recusa.
// B3: um HEAD de 7 hex que é prefixo de dois shas (H e OUTRO): o ambíguo nunca aprova OUTRO e um REPROVADO ambíguo bloqueia H.
// B4: correção 2 — uma recusa de argumentos não pode deixar o proxima-fase.json da corrida anterior.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { montaCenario, correAvancar, saida, prMerges, merges, limpa, PR } from './helpers.mjs';
import { provasDe } from '../../../scripts/avancar.mjs';
after(limpa);

const X64 = 'e'.repeat(64);
const corpo = (v, head) => `VEREDITO: ${v}\nHEAD: ${head}\nEXECUTOR: .forge/resultados/x-limpa-p1.json ${X64}\nCRITÉRIOS: 5/5`;
const real = (v, head) => `\uFEFF## Crítico R3 — V-99, HEAD ${head}\r\n\r\n\`\`\`\r\n${corpo(v, head).replaceAll('\n', '\r\n')}\r\n\`\`\``;
const check = (sha) => `CHECK-TICKET: VERDE ${sha} ${X64}`;
const T = { timeout: 300000 };

// comentários calculados a partir de { H, P1 }; mesmaHora: todos com o mesmo createdAt
async function corre(nome, comentarios, { mesmaHora = false, modo = 'forge' } = {}) {
  const m = montaCenario({ nome, modo, comentarios: [], pr: { isDraft: false, base: 'main', posMerge: 'verde', headMuda: false } });
  const f = join(m.estado, 'cenario.json'), cen = JSON.parse(readFileSync(f, 'utf8'));
  cen.comentarios[PR] = comentarios(m).map((c, i) => ({ autor: 'conta-falsa', corpo: c, em: new Date(Date.UTC(2026, 10, 1, 9, mesmaHora ? 0 : i)).toISOString() }));
  writeFileSync(f, JSON.stringify(cen, null, 2));
  return { m, r: await correAvancar(m) };
}
const recusa = ({ m, r }) => {
  assert.equal(prMerges(r).length, 0, `fez pr merge\n${saida(r)}`);
  assert.equal(merges(r).length, 0, saida(r));
  assert.deepEqual(r.refsDepois, m.refsAntes, 'a origem mudou');
  assert.equal(r.status, 2, saida(r));
};
const merge = ({ r }) => { assert.equal(r.status, 0, saida(r)); assert.equal(merges(r).length, 1, saida(r)); };

test('B1.a: APROVADO com sha curto de outro head (P1) e CHECK do head: recusa, 0 merge', T, async () => {
  recusa(await corre('b1a', ({ H, P1 }) => [real('APROVADO', P1.slice(0, 7)), check(H)]));
});
test('B1.b: APROVADO do head, depois REPROVADO com sha curto de OUTRO head (P1): não bloqueia (o REPROVADO não é deste head)', T, async () => {
  merge(await corre('b1b', ({ H, P1 }) => [corpo('APROVADO', H), check(H), real('REPROVADO', P1.slice(0, 7))]));
});
test('B1.c: APROVADO de P1 (curto) depois do APROVADO do head: o último do head continua a ser o do head; CHECK de P1 por último recusa', T, async () => {
  recusa(await corre('b1c', ({ H, P1 }) => [corpo('APROVADO', H), check(H), real('APROVADO', P1.slice(0, 7)), check(P1.slice(0, 7))]));
});

test('B2.a: APROVADO e REPROVADO do head com o mesmo createdAt (REPROVADO depois na ordem do gh): recusa', T, async () => {
  recusa(await corre('b2a', ({ H }) => [corpo('APROVADO', H), check(H), real('REPROVADO', H.slice(0, 7))], { mesmaHora: true }));
});
test('B2.b: mesma hora, REPROVADO sem HEAD depois do APROVADO real: recusa', T, async () => {
  recusa(await corre('b2b', ({ H }) => [real('APROVADO', H.slice(0, 7)), check(H), 'VEREDITO: REPROVADO\nFALHAS: 1. x'], { mesmaHora: true }));
});
test('B2.c: mesma hora, CHECK-TICKET VERMELHO do head depois do VERDE: recusa', T, async () => {
  recusa(await corre('b2c', ({ H }) => [corpo('APROVADO', H), check(H), `CHECK-TICKET: VERMELHO ${H.slice(0, 7)} ${X64}`], { mesmaHora: true }));
});

test('B3: HEAD de 7 hex que é prefixo de dois shas (H e OUTRO)', () => {
  const P = 'abcdef1', H = P + 'a'.repeat(33), OUTRO = P + 'b'.repeat(33);
  const v = (d, h) => ({ body: corpo(d, h) }), ck = (s, e = 'VERDE') => ({ body: `CHECK-TICKET: ${e} ${s} ${X64}` });
  assert.notEqual(provasDe([v('APROVADO', OUTRO), ck(H)], H), null, 'APROVADO do sha completo OUTRO aprovou H');
  assert.notEqual(provasDe([v('APROVADO', H), ck(OUTRO)], H), null, 'CHECK do sha completo OUTRO aprovou H');
  assert.notEqual(provasDe([v('APROVADO', H), ck(H), v('REPROVADO', P)], H), null, 'REPROVADO com o prefixo ambíguo não bloqueou H');
  assert.notEqual(provasDe([v('APROVADO', H), ck(H), ck(P, 'VERMELHO')], H), null, 'CHECK VERMELHO com o prefixo ambíguo não bloqueou H');
  assert.notEqual(provasDe([v('APROVADO', P), ck(P), v('REPROVADO', H)], H), null, 'REPROVADO completo de H depois do APROVADO ambíguo não bloqueou');
  assert.equal(provasDe([v('APROVADO', H), ck(H), v('REPROVADO', OUTRO)], H), null, 'REPROVADO do sha completo OUTRO bloqueou H');
});

test('B4 (correção 2): recusa de argumentos (--modo projeto sem --integracao) com um proxima-fase.json velho: saída 2 e a fase velha não fica', T, async () => {
  const m = montaCenario({ nome: 'b4', modo: 'projeto', comentarios: [], pr: { isDraft: false, base: 'main', posMerge: 'verde', headMuda: false } });
  mkdirSync(join(m.trab, '.forge'), { recursive: true });
  const velho = JSON.stringify({ spec: 9100, geradoEm: '2026-10-01T00:00:00.000Z', proximas: [{ numero: 9105, titulo: 'V-15: velha' }] });
  const f = join(m.trab, '.forge', 'proxima-fase.json');
  writeFileSync(f, velho);
  const r = await correAvancar(m);
  assert.equal(r.status, 2, saida(r));
  assert.equal(prMerges(r).length, 0, saida(r));
  assert.ok(!existsSync(f) || readFileSync(f, 'utf8') !== velho, `a fase velha ficou intacta numa recusa\n${saida(r)}`);
});