// V-06 (#130), R1: o corpus de formatos reais de veredito e as outras correções da R1 (RESPOSTA do orquestrador na #130). Os críticos do forge
// publicam com BOM (Out-File do PowerShell), cabeçalho e bloco de código, e com o HEAD abreviado a 7 hex. A regra: uma etiqueta vale em qualquer
// linha do comentário; o último veredito do head decide; na dúvida recusa. Cada cenário corre o avancar contra o gh falso e a origem local.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { montaCenario, correAvancar, saida, prMerges, merges, issuesCriadas, limpa, PR } from './helpers.mjs';

after(limpa);

const X64 = 'd'.repeat(64);
const CAMPOS = 'BARRA: critérios de aceite — critérios visuais 0/0 — vencedor cego: empate (nosso era A)\nCRITÉRIOS: 5/5\nFALHAS (todas, numeradas): nenhuma';
const corpo = (v, head, extra = '') => `VEREDITO: ${v}\n${head === null ? '' : `HEAD: ${head}\n`}EXECUTOR: .forge/resultados/x-limpa-p1.json ${X64}\n${CAMPOS}${extra}`;
const real = (v, head) => `﻿## Crítico R2 — V-99 (PR #9110), HEAD ${head}\n\n\`\`\`\n${corpo(v, head)}\n\`\`\``.replaceAll('\n', '\r\n');
const check = (sha) => `CHECK-TICKET: VERDE ${sha} ${X64}`;

// monta o cenário com os comentários calculados a partir do head (m.H) e devolve o cenário e a corrida
async function corre(nome, comentarios, { posMerge = 'verde', ajusta } = {}) {
  const m = montaCenario({ nome, modo: 'forge', comentarios: [], pr: { isDraft: false, base: 'main', posMerge, headMuda: false } });
  const f = join(m.estado, 'cenario.json'), cen = JSON.parse(readFileSync(f, 'utf8'));
  cen.comentarios[PR] = comentarios(m.H).map((c, i) => ({ autor: 'conta-falsa', corpo: c, em: new Date(Date.UTC(2026, 10, 1, 9, i)).toISOString() }));
  ajusta?.(cen, m);
  writeFileSync(f, JSON.stringify(cen, null, 2));
  return { m, r: await correAvancar(m) };
}
const recusa = ({ m, r }) => {
  assert.equal(r.status, 2, saida(r));
  assert.equal(prMerges(r).length, 0, `fez merge\n${saida(r)}`);
  assert.deepEqual(r.refsDepois, m.refsAntes, 'a origem mudou');
};
const merge = ({ m, r }) => {
  assert.equal(r.status, 0, saida(r));
  assert.equal(prMerges(r).length, 1, saida(r));
  assert.equal(merges(r).length, 1, saida(r));
};
const T = { timeout: 300000 };

test('R1 formatos: APROVADO real (BOM, cabeçalho, bloco de código, CRLF, HEAD e CHECK-TICKET com 7 hex) faz o merge', T, async () => {
  merge(await corre('f-aprovado-real', (H) => [real('APROVADO', H.slice(0, 7)), check(H.slice(0, 7))]));
});

test('R1 formatos: veredito em negrito e HEAD numa lista também valem', T, async () => {
  merge(await corre('f-aprovado-negrito', (H) => [`**VEREDITO: APROVADO**\n- **HEAD:** ${H}\n- EXECUTOR: x.json ${X64}`, check(H)]));
});

test('R1 formatos: um REPROVADO real (BOM, cabeçalho, bloco de código, sha curto) depois do APROVADO real recusa', T, async () => {
  recusa(await corre('f-reprovado-depois', (H) => [real('APROVADO', H.slice(0, 7)), check(H), real('REPROVADO', H.slice(0, 7))]));
});

test('R1 formatos: um comentário com APROVADO e REPROVADO ao mesmo tempo recusa', T, async () => {
  recusa(await corre('f-ambos-no-mesmo', (H) => [`${corpo('APROVADO', H)}\n\n\`\`\`\nVEREDITO: REPROVADO\n\`\`\``, check(H)]));
});

test('R1 formatos: um REPROVADO sem HEAD depois do APROVADO vale para o head e recusa', T, async () => {
  recusa(await corre('f-reprovado-sem-head', (H) => [corpo('APROVADO', H), check(H), corpo('REPROVADO', null)]));
});

test('R1 formatos: APROVADO a seguir a um REPROVADO do mesmo head (o último decide) faz o merge', T, async () => {
  merge(await corre('f-aprovado-depois', (H) => [real('REPROVADO', H.slice(0, 7)), corpo('APROVADO', H.slice(0, 12)), check(H)]));
});

test('R1 formatos: dúvida recusa — APROVADO sem HEAD, só citado, com ressalvas, ou com HEAD de 6 hex', T, async () => {
  const casos = {
    'sem-head': (H) => [corpo('APROVADO', null), check(H)],
    citado: (H) => [`> ${corpo('APROVADO', H).replaceAll('\n', '\n> ')}`, check(H)],
    ressalvas: (H) => [`${corpo('APROVADO', H).replace('VEREDITO: APROVADO', 'VEREDITO: APROVADO COM RESSALVAS')}`, check(H)],
    'head-curto': (H) => [corpo('APROVADO', H.slice(0, 6)), check(H)],
    'head-errado': (H) => [corpo('APROVADO', `${H.slice(0, 6)}${H[6] === '0' ? '1' : '0'}`), check(H)],
    'check-vermelho-depois': (H) => [corpo('APROVADO', H), check(H), `CHECK-TICKET: VERMELHO ${H} ${X64}`],
  };
  for (const [nome, c] of Object.entries(casos)) recusa(await corre(`f-duvida-${nome}`, c));
});

test('R1 Closes: um PR sem «Closes #n» no corpo recusa (2) mesmo com as duas provas; «Fecha #n» vale', T, async () => {
  const sem = (cen) => { cen.pr.body = 'Referencia #9130, sem a linha que fecha.'; };
  recusa(await corre('f-sem-closes', (H) => [corpo('APROVADO', H), check(H)], { ajusta: sem }));
  merge(await corre('f-fecha', (H) => [corpo('APROVADO', H), check(H)], { ajusta: (cen) => { cen.pr.body = 'Texto.\n\nFecha #9130'; } }));
});

test('R1 regressao: sem a label no repo a issue abre-se na mesma, com o título «regressao: …», sem label; saída 1', T, async () => {
  const x = await corre('f-sem-label', (H) => [corpo('APROVADO', H), check(H)], { posMerge: 'vermelho', ajusta: (cen) => { cen.rotulos = cen.rotulos.filter((l) => l !== 'regressao'); } });
  assert.equal(x.r.status, 1, saida(x.r));
  const criadas = issuesCriadas(x.r);
  assert.equal(criadas.length, 1, saida(x.r));
  assert.ok(criadas[0].title.startsWith('regressao:'), criadas[0].title);
  assert.deepEqual(criadas[0].labels, []);
});

test('R1 fase velha: um proxima-fase.json anterior nunca sobrevive a uma recusa nem a um pós-merge vermelho (proximas vazio e motivo)', T, async () => {
  const velho = JSON.stringify({ spec: 9100, geradoEm: '2026-10-01T00:00:00.000Z', proximas: [{ numero: 9105, titulo: 'V-15: velha' }] });
  for (const [nome, comentarios, posMerge, codigo] of [['recusa', (H) => [corpo('REPROVADO', H), check(H)], 'verde', 2], ['vermelho', (H) => [corpo('APROVADO', H), check(H)], 'vermelho', 1]]) {
    const m = montaCenario({ nome: `f-velha-${nome}`, modo: 'forge', comentarios: [], pr: { isDraft: false, base: 'main', posMerge, headMuda: false } });
    const f = join(m.estado, 'cenario.json'), cen = JSON.parse(readFileSync(f, 'utf8'));
    cen.comentarios[PR] = comentarios(m.H).map((c, i) => ({ autor: 'conta-falsa', corpo: c, em: new Date(Date.UTC(2026, 10, 1, 9, i)).toISOString() }));
    writeFileSync(f, JSON.stringify(cen, null, 2));
    mkdirSync(join(m.trab, '.forge'), { recursive: true });
    writeFileSync(join(m.trab, '.forge', 'proxima-fase.json'), velho);
    const r = await correAvancar(m);
    assert.equal(r.status, codigo, saida(r));
    const fase = JSON.parse(readFileSync(join(m.trab, '.forge', 'proxima-fase.json'), 'utf8'));
    assert.deepEqual(fase.proximas, [], `${nome}: ficou a fase velha`);
    assert.equal(typeof fase.motivo, 'string', `${nome}: sem motivo`);
    assert.ok(existsSync(join(m.trab, '.forge', 'proxima-fase.json')));
  }
});
