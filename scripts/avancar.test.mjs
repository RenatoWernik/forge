// Testes do avanço automático (V-06, #130): as provas do PR, os bloqueios e a fase seguinte, por classe de entradas, mais o uso da linha de
// comandos. O comportamento contra o gh (merge, pós-merge, recusas, token) é provado pelos ataques de tests/critico/v-06-r0/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bloqueiosDe, proximas, provasDe, ticketsDe } from './avancar.mjs';

const AVANCAR = fileURLToPath(new URL('./avancar.mjs', import.meta.url));
const H = 'a'.repeat(40), OUTRO = 'b'.repeat(40), X64 = 'c'.repeat(64);
const veredito = (v, head = H, extra = `EXECUTOR: .forge/resultados/${head}-limpa-p1.json ${X64}\n`) => ({ body: `VEREDITO: ${v}\nHEAD: ${head}\n${extra}CRITÉRIOS: 5/5` });
const check = (estado = 'VERDE', sha = H, h64 = X64) => ({ body: `CHECK-TICKET: ${estado} ${sha} ${h64}`.trim() });

test('provasDe: aceita só o último VEREDITO APROVADO e o último CHECK-TICKET VERDE, os dois do head', () => {
  assert.equal(provasDe([veredito('APROVADO'), check()], H), null);
  assert.equal(provasDe([veredito('REPROVADO', OUTRO), check('VERDE', OUTRO), veredito('APROVADO'), check()], H), null);
  assert.equal(provasDe([veredito('APROVADO'), check(), { body: 'CRLF' }, { body: `VEREDITO: APROVADO\r\nHEAD: ${H}\r\nEXECUTOR: f ${X64}\r\n` }], H), null);
});

test('provasDe: formatos reais — BOM, cabeçalho, bloco de código, negrito, lista, sha de 7 hex; o último veredito do head decide', () => {
  const real = (v, head) => ({ body: `﻿## Crítico R2 — HEAD ${head}\r\n\r\n\`\`\`\r\n${veredito(v, head).body.replaceAll('\n', '\r\n')}\r\n\`\`\`` });
  assert.equal(provasDe([real('APROVADO', H.slice(0, 7)), check('VERDE', H.slice(0, 7))], H), null);
  assert.equal(provasDe([{ body: `**VEREDITO: APROVADO**\n- **HEAD:** ${H}\n- EXECUTOR: f ${X64}` }, check()], H), null);
  assert.equal(provasDe([veredito('APROVADO'), check(), real('REPROVADO', OUTRO), real('REPROVADO', H.slice(0, 7)), real('APROVADO', H.slice(0, 7))], H), null, 'o REPROVADO de outro head não conta; o APROVADO posterior ao do head decide');
  assert.notEqual(provasDe([real('REPROVADO', H.slice(0, 7)), real('APROVADO', H.slice(0, 7)), real('REPROVADO', H.slice(0, 40))], H), null);
});

test('ticketsDe: «Closes #n», «Fixes #n», «Fecha #n» no corpo; «Referencia #n» não fecha nada', () => {
  assert.deepEqual(ticketsDe('Closes #130'), [130]);
  assert.deepEqual(ticketsDe('texto\n\nfecha #7 e Resolves #8'), [7, 8]);
  assert.deepEqual(ticketsDe('Referencia #130'), []);
  assert.deepEqual(ticketsDe(null), []);
});

test('provasDe: recusa por classe — sem prova, prova do último não aprova, prova de outro sha, prova incompleta', () => {
  const casos = [
    ['sem comentários', []],
    ['sem VEREDITO', [{ body: 'A rever' }, check()]],
    ['VEREDITO só citado no meio do comentário', [{ body: `> VEREDITO: APROVADO\nHEAD: ${H}` }, check()]],
    ['o último VEREDITO é REPROVADO', [veredito('APROVADO'), check(), veredito('REPROVADO')]],
    ['APROVADO com ressalvas não é APROVADO', [{ body: `VEREDITO: APROVADO COM RESSALVAS\nHEAD: ${H}\nEXECUTOR: f ${X64}` }, check()]],
    ['APROVADO de outro head', [veredito('APROVADO', OUTRO), check()]],
    ['HEAD abreviado a 6 hex', [veredito('APROVADO', H.slice(0, 6)), check()]],
    ['HEAD de 7 hex que não é prefixo', [veredito('APROVADO', 'abcdef0'), check()]],
    ['REPROVADO depois do APROVADO, com BOM', [veredito('APROVADO'), check(), { body: `﻿${veredito('REPROVADO').body}` }]],
    ['REPROVADO depois do APROVADO, com cabeçalho e bloco de código', [veredito('APROVADO'), check(), { body: `## Crítico R2\n\n\`\`\`\n${veredito('REPROVADO').body}\n\`\`\`` }]],
    ['REPROVADO depois do APROVADO, em CRLF e em negrito', [veredito('APROVADO'), check(), { body: `**VEREDITO: REPROVADO**\r\nHEAD: ${H}\r\n` }]],
    ['REPROVADO depois do APROVADO, só citado', [veredito('APROVADO'), check(), { body: `> VEREDITO: REPROVADO\n> HEAD: ${H}` }]],
    ['REPROVADO sem HEAD depois do APROVADO', [veredito('APROVADO'), check(), { body: 'VEREDITO: REPROVADO' }]],
    ['APROVADO e REPROVADO no mesmo comentário', [{ body: `${veredito('APROVADO').body}\nVEREDITO: REPROVADO` }, check()]],
    ['APROVADO sem HEAD', [{ body: `VEREDITO: APROVADO\nEXECUTOR: f ${X64}` }, check()]],
    ['APROVADO só citado', [{ body: `> ${veredito('APROVADO').body.replaceAll('\n', '\n> ')}` }, check()]],
    ['CHECK-TICKET VERDE só citado', [veredito('APROVADO'), { body: `> CHECK-TICKET: VERDE ${H} ${X64}` }]],
    ['sem EXECUTOR', [veredito('APROVADO', H, ''), check()]],
    ['EXECUTOR sem sha256', [veredito('APROVADO', H, 'EXECUTOR: .forge/resultados/x.json\n'), check()]],
    ['sem CHECK-TICKET', [veredito('APROVADO')]],
    ['CHECK-TICKET de outro sha', [veredito('APROVADO'), check('VERDE', OUTRO)]],
    ['o último CHECK-TICKET é VERMELHO', [veredito('APROVADO'), check(), check('VERMELHO')]],
    ['CHECK-TICKET VERDE sem sha256 do relatório', [veredito('APROVADO'), { body: `CHECK-TICKET: VERDE ${H}` }]],
  ];
  for (const [nome, comentarios] of casos) assert.notEqual(provasDe(comentarios, H), null, nome);
});

const issue = (number, title, bloqueio, state = 'OPEN', spec = 1) => ({ number, title, state, body: `Parte da spec #${spec}.\n\n**Bloqueado por:** ${bloqueio}\n\nResto.` });
const PACOTE = [issue(11, 'V-01: a', '—', 'CLOSED'), issue(12, 'V-02: b', 'V-01.'), issue(13, 'V-03: c', 'V-01, V-02'), issue(14, 'V-04: d', '#12 e V-03 (medição)')];

test('bloqueiosDe: #n, ids resolvidos pelo prefixo do título, «—» sem bloqueios, parênteses ignorados, o que não se entende fica preso', () => {
  assert.deepEqual(bloqueiosDe(PACOTE[0].body, PACOTE), []);
  assert.deepEqual(bloqueiosDe(PACOTE[2].body, PACOTE), [11, 12]);
  assert.deepEqual(bloqueiosDe(PACOTE[3].body, PACOTE), [12, 13]);
  assert.deepEqual(bloqueiosDe('**Bloqueado por:** V-99', PACOTE), [null], 'id sem issue no pacote');
  assert.deepEqual(bloqueiosDe('**Bloqueado por:** depois da reunião', PACOTE), [null], 'texto sem #n nem id');
  assert.deepEqual(bloqueiosDe('sem linha de bloqueios', PACOTE), []);
  const duplo = [...PACOTE, issue(15, 'V-01: repetido', '—')];
  assert.deepEqual(bloqueiosDe('**Bloqueado por:** V-01', duplo), [null], 'id ambíguo');
});

test('proximas: abertas do pacote com todos os bloqueios fechados; as de outro pacote, as fechadas e as excluídas ficam de fora', () => {
  const outro = issue(20, 'V-01: de outro pacote', '—', 'OPEN', 2);
  const todas = [...PACOTE, outro, issue(21, 'V-09: presa a uma de outro pacote', '#20')];
  assert.deepEqual(proximas(todas, 1, new Set(), new Set()).map((p) => p.numero), [12]);
  assert.deepEqual(proximas(todas, 1, new Set([12]), new Set([12])).map((p) => p.numero), [13], 'o ticket do PR (#12) feito: solta só a #13');
  assert.deepEqual(proximas(todas, 1, new Set([12]), new Set([12, 13])), [], 'a excluída não volta');
  assert.deepEqual(proximas(todas, 1, new Set(), new Set([12])).map((p) => p.numero), [], 'excluída e as presas a ela');
  assert.deepEqual(proximas(todas, 2, new Set(), new Set()).map((p) => p.numero), [20], 'o pacote 2 só tem a #20');
  assert.equal(proximas(todas, 1, new Set(), new Set())[0].titulo, 'V-02: b');
});

test('uso: argumentos inválidos saem com 2 antes de qualquer chamada ao gh', () => {
  const corre = (...a) => spawnSync(process.execPath, [AVANCAR, ...a], { encoding: 'utf8', env: { ...process.env, PATH: '' } });
  for (const a of [[], ['--pr', '0', '--repo', 'a/b', '--modo', 'forge'], ['--pr', '5', '--repo', 'x', '--modo', 'forge'], ['--pr', '5', '--repo', 'a/b', '--modo', 'tudo'],
    ['--pr', '5', '--repo', 'a/b', '--modo', 'projeto'], ['--pr', '5', '--repo', 'a/b', '--modo', 'projeto', '--integracao', '--x'],
    ['--pr', '5', '--repo', 'a/b', '--modo', 'forge', '--integracao', 'int'], ['--pr', '5', '--desconhecido', 'x']]) {
    const r = corre(...a);
    assert.equal(r.status, 2, `${a.join(' ')}\n${r.stdout}${r.stderr}`);
  }
});
