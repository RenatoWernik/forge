// F-13 critério 3: o vigia (3), com um relógio injetado, fica calado aos 9 min 59 s, avisa aos 10 min 01 s com o nome do agente e o do
// ticket, não avisa um agente sem ticket ativo (ticket em main ou aprovado) e, sem painel.json, não escreve nada e sai com 0.
// Oráculo: painéis no esquema do F-10 com os mtimes dos checkpoints controlados (utimes) e o «agora» injetado pela ponte (relogio).
// O «agora» é uma data fixa: um vigia que use o relógio real em vez do injetado falha o caso dos 9 min 59 s.
// As respostas 4a a 4e do orquestrador na #14 (2026-10-29) fazem parte do contrato: a vida é a do leitor do F-10, sem recálculo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { api, gerar, hooksDe, correrScript, aviso, mostra, mkdirSync, writeFileSync } from './helpers.mjs';

const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);
const S = 1000;

let proj;
const projeto = async () => (proj ??= await gerar(hooksDe(true, true, true)));

const entrada = (u, p) => ({
  session_id: 'critico-f13', transcript_path: join(p, 'transcript.jsonl'), cwd: p, permission_mode: 'default', hook_event_name: u.eventoVigia,
  prompt: 'continua', source: 'startup', tool_name: 'Bash', tool_input: { command: 'git status' }, tool_response: { stdout: '' }, tool_use_id: 'toolu_critico_f13',
});

// agentes: [{ nome, ticket, estado, idade (ms antes de AGORA; null = sem ficheiro de checkpoint) }]; cada agente tem o seu checkpoint
// e o seu ticket, salvo `estado: null` (o ticket não existe em tickets[]); `texto` substitui o painel.json inteiro
const montar = async (agentes, texto) => {
  const p = await projeto();
  const dir = join(p, '.checkpoints');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const painel = {
    versao: 1, projeto: 'Projeto Exemplo', objetivo: 'Fechar o lote 1', modo: 'rigoroso',
    tickets: agentes.filter((a) => a.estado !== null).map((a, i) => ({ id: a.ticket, issue: 40 + i, titulo: 'Titulo ' + a.ticket, estado: a.estado, rondas: 1 })),
    agentes: agentes.map((a) => ({ nome: a.nome, papel: 'dev', ticket: a.ticket, modelo: 'sonnet', checkpoint: a.nome + '.md' })),
  };
  writeFileSync(join(dir, 'painel.json'), texto ?? JSON.stringify(painel, null, 2) + '\n');
  for (const a of agentes.filter((x) => x.idade !== null)) {
    const f = join(dir, a.nome + '.md');
    writeFileSync(f, '# checkpoint\n');
    const t = (AGORA - a.idade) / 1000;
    utimesSync(f, t, t);
  }
  return p;
};
const vigiar = async (p) => {
  const u = await api();
  return correrScript(p, u.scripts.vigia, entrada(u, p), u.relogio(AGORA));
};
const menciona = (txt, a) => txt.includes(a.nome) && (txt.includes(a.ticket) || txt.includes('Titulo ' + a.ticket));

test('C3: aos 9 min 59 s o vigia fica calado (saída 0, nada no contexto)', async () => {
  const r = await vigiar(await montar([{ nome: 'dev-alfa', ticket: 'T-41', estado: 'dev', idade: (9 * 60 + 59) * S }]));
  assert.equal(aviso(r), '', mostra(r));
});

test('C3: aos 10 min 01 s o vigia avisa, com o nome do agente e o do ticket', async () => {
  const a = { nome: 'dev-alfa', ticket: 'T-41', estado: 'dev', idade: (10 * 60 + 1) * S };
  const r = await vigiar(await montar([a]));
  const txt = aviso(r);
  assert.ok(txt, 'não avisou: ' + mostra(r));
  assert.ok(menciona(txt, a), 'o aviso não tem o nome do agente e o do ticket: ' + JSON.stringify(txt));
});

test('C3: com dois agentes, avisa só o que passou dos 10 min (o de 9 min 59 s não aparece no aviso)', async () => {
  const parado = { nome: 'dev-alfa', ticket: 'T-41', estado: 'dev', idade: (10 * 60 + 1) * S };
  const vivo = { nome: 'critico-beta', ticket: 'T-52', estado: 'critico', idade: (9 * 60 + 59) * S };
  const txt = aviso(await vigiar(await montar([parado, vivo])));
  assert.ok(txt && menciona(txt, parado), 'não avisou o parado: ' + JSON.stringify(txt));
  assert.ok(!txt.includes(vivo.nome), 'aviso falso: nomeou o agente de 9 min 59 s: ' + JSON.stringify(txt));
});

// resposta 4e do orquestrador (#14): espera e falta também contam como ativos
for (const estado of ['dev', 'critico', 'reprovado', 'espera', 'falta']) {
  test(`C3: um agente com o ticket em «${estado}» (ativo), parado há 45 min, é avisado`, async () => {
    const a = { nome: 'dev-gama', ticket: 'T-63', estado, idade: 45 * 60 * S };
    const txt = aviso(await vigiar(await montar([a])));
    assert.ok(txt && menciona(txt, a), JSON.stringify(txt));
  });
}

for (const estado of ['main', 'aprovado']) {
  test(`C3: um agente sem ticket ativo (ticket em «${estado}»), parado há 10 min 01 s, não é avisado`, async () => {
    const r = await vigiar(await montar([{ nome: 'dev-delta', ticket: 'T-74', estado, idade: (10 * 60 + 1) * S }]));
    assert.equal(aviso(r), '', mostra(r));
  });
}

test('C3: sem painel.json o vigia não escreve nada (stdout e stderr vazios) e sai com 0', async () => {
  const p = await projeto();
  rmSync(join(p, '.checkpoints'), { recursive: true, force: true });
  const r = await vigiar(p);
  assert.equal(r.status, 0, mostra(r));
  assert.equal(r.stdout, '', mostra(r));
  assert.equal(r.stderr, '', mostra(r));
});

// ---- Respostas 4a a 4d do orquestrador (#14, 2026-10-29): o vigia segue a vida do leitor partilhado do F-10 e nunca a recalcula ----

test('C3 (resposta 4a): exatamente aos 10 min 00 s o vigia avisa (no F-10 é «sem sinal»)', async () => {
  const a = { nome: 'dev-alfa', ticket: 'T-41', estado: 'dev', idade: 10 * 60 * S };
  const txt = aviso(await vigiar(await montar([a])));
  assert.ok(txt && menciona(txt, a), JSON.stringify(txt));
});

test('C3 (resposta 4a): um checkpoint com data no futuro conta como 0 min no F-10 e o vigia fica calado', async () => {
  const r = await vigiar(await montar([{ nome: 'dev-alfa', ticket: 'T-41', estado: 'dev', idade: -5 * 60 * S }]));
  assert.equal(aviso(r), '', mostra(r));
});

test('C3 (resposta 4b): um agente ativo sem ficheiro de checkpoint é avisado, com o agente e o ticket', async () => {
  const a = { nome: 'dev-epsilon', ticket: 'T-85', estado: 'dev', idade: null };
  const r = await vigiar(await montar([a]));
  const txt = aviso(r);
  assert.ok(txt && menciona(txt, a), mostra(r));
});

test('C3 (respostas 4b e 1): um agente sem checkpoint num ticket em main não é avisado', async () => {
  const r = await vigiar(await montar([{ nome: 'dev-epsilon', ticket: 'T-85', estado: 'main', idade: null }]));
  assert.equal(aviso(r), '', mostra(r));
});

for (const [nome, texto] of [
  ['JSON partido', '{ "versao": 1, "projeto": "P", '],
  ['fora do esquema (modo e agente inválidos)', JSON.stringify({ versao: 1, projeto: 'P', modo: 'turbo', tickets: [], agentes: [{ nome: 'dev-x', papel: 'chefe', ticket: 'T-1', modelo: 'm', checkpoint: '../fora.md' }] })],
]) {
  test(`C3 (resposta 4c): com um painel.json inválido (${nome}) o vigia sai com 0, não escreve nada no contexto e põe uma linha de aviso no stderr`, async () => {
    const r = await vigiar(await montar([], texto));
    assert.equal(r.status, 0, mostra(r));
    assert.equal(r.stdout, '', mostra(r));
    const err = r.stderr.trim();
    assert.ok(err !== '' && !/\r?\n/.test(err), 'o stderr tem de ter uma linha de aviso: ' + mostra(r));
  });
}

test('C3 (resposta 4d): um agente cujo ticket não existe em tickets[] é avisado, com o id do ticket tal como está', async () => {
  const a = { nome: 'dev-zeta', ticket: 'T-9Z orfao', estado: null, idade: (10 * 60 + 1) * S };
  const r = await vigiar(await montar([a]));
  const txt = aviso(r);
  assert.ok(txt && txt.includes(a.nome) && txt.includes(a.ticket), mostra(r));
});
