// F-10 critério 4: o utilitário de atualização produz SEMPRE um painel.json válido e é idempotente.
// Oráculo: propriedade com 25 sequências de 4 operações (semente 4040, impressa), contra um modelo de referência em memória;
// mais leituras concorrentes durante 20 escritas, escritores em paralelo, caminhos com espaços e acentos, e um ficheiro enorme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { api, base, txt, painelTmp, runUtil, runUtilAsync, readJson, rng, pick, ESTADOS, PAPEIS, FAKE_HOME, walk } from './helpers.mjs';

const TEXTOS = ['Simples', 'Título "com" aspas', 'barra \\ invertida', 'ação ç Ü «x»', 'emoji 🚀✅', '$(whoami) `id` %PATH%', "'; process.exit(1); '", '- começa por hífen', 'x'.repeat(2000), '{"versao":2}', '__proto__'];
const NOMES = ['dev-a', 'critico-b', 'tester c', '__proto__', 'ação'];
const IDS = ['T-01', 'T-02', 'T-09', 'constructor', 'Ç-1'];

const valido = async (u, file, ctx) => {
  const raw = readFileSync(file, 'utf8');
  let o;
  try { o = JSON.parse(raw); } catch (e) { assert.fail(`${ctx}: o ficheiro não é JSON (${e.message}): ${raw.slice(0, 120)}`); }
  assert.deepEqual(u.validar(o), [], ctx + ': o painel.json ficou inválido');
  return o;
};
const porId = (xs, k) => Object.fromEntries(xs.map((x) => [x[k], x]));
// Os tipos de issue, rondas e porta são a PERGUNTA 5: aqui compara-se o valor numérico, seja qual for o tipo guardado
const num = (x) => { const y = { ...x }; for (const k of ['issue', 'rondas', 'porta']) if (k in y) y[k] = Number(y[k]); return y; };

test('C4: cada operação aplicada uma vez faz o que diz, e o ficheiro continua válido', async () => {
  const u = await api();
  const { file, proj } = painelTmp();
  const t = { id: 'T-02', issue: 12, titulo: 'Segundo, revisto', estado: 'reprovado', rondas: 3 };
  const a = { nome: 'tester-1', papel: 'tester', ticket: 'T-02', modelo: 'haiku', checkpoint: 'tester-1.md', porta: 4900 };
  const passos = [
    [u.argsTicket(file, t), (o) => assert.deepEqual(num(porId(o.tickets, 'id')['T-02']), t)],
    [u.argsTicket(file, { ...t, id: 'T-05', issue: 15 }), (o) => assert.equal(o.tickets.length, 5)],
    [u.argsAgente(file, a), (o) => assert.deepEqual(num(porId(o.agentes, 'nome')['tester-1']), a)],
    [u.argsRemoverAgente(file, 'dev-t03'), (o) => assert.deepEqual(o.agentes.map((x) => x.nome).sort(), ['critico-t03', 'tester-1'])],
    [u.argsObjetivo(file, 'Novo objetivo «já»'), (o) => assert.equal(o.objetivo, 'Novo objetivo «já»')],
  ];
  for (const [args, ver] of passos) {
    const r = runUtil(u, args, proj);
    assert.equal(r.status, 0, args.join(' ') + '\n' + r.out);
    ver(await valido(u, file, args.join(' ')));
  }
  const o = readJson(file);
  assert.deepEqual([o.versao, o.projeto, o.modo], [1, 'Projeto Exemplo', 'rigoroso'], 'campos de topo alterados por operações que não lhes tocam');
});

test('C4 propriedade: 25 sequências de 4 operações geradas (semente 4040) — depois de cada passo o ficheiro é válido, igual ao modelo de referência, e aplicar a mesma operação 2× dá o mesmo ficheiro, byte a byte', async (t) => {
  const u = await api();
  const SEED = 4040;
  t.diagnostic('semente ' + SEED);
  const r = rng(SEED);
  for (let s = 0; s < 25; s++) {
    const { file, proj } = painelTmp();
    const ref = base();
    for (let p = 0; p < 4; p++) {
      const k = pick(r, ['ticket', 'ticket', 'agente', 'agente', 'remover', 'objetivo']);
      let args, aplicar;
      if (k === 'ticket') {
        const x = { id: pick(r, IDS), issue: 1 + Math.floor(r() * 500), titulo: pick(r, TEXTOS), estado: pick(r, ESTADOS), rondas: Math.floor(r() * 4) };
        args = u.argsTicket(file, x);
        aplicar = () => { const i = ref.tickets.findIndex((y) => y.id === x.id); i < 0 ? ref.tickets.push(x) : (ref.tickets[i] = x); };
      } else if (k === 'agente') {
        const nome = pick(r, NOMES);
        const x = { nome, papel: pick(r, PAPEIS), ticket: pick(r, IDS), modelo: pick(r, ['opus', 'sonnet', 'haiku']), checkpoint: nome.replace(/\W/g, '_') + '.md', ...(r() < 0.5 && { porta: 4000 + Math.floor(r() * 1000) }) };
        args = u.argsAgente(file, x);
        aplicar = () => { const i = ref.agentes.findIndex((y) => y.nome === x.nome); i < 0 ? ref.agentes.push(x) : (ref.agentes[i] = x); };
      } else if (k === 'remover') {
        const nome = pick(r, [...NOMES, 'dev-t03', 'critico-t03']);
        args = u.argsRemoverAgente(file, nome);
        aplicar = () => { ref.agentes = ref.agentes.filter((y) => y.nome !== nome); };
      } else {
        const x = pick(r, TEXTOS);
        args = u.argsObjetivo(file, x);
        aplicar = () => { ref.objetivo = x; };
      }
      const ctx = `sequência ${s}, passo ${p}: ${k} ${JSON.stringify(args.slice(1)).slice(0, 200)}`;
      const r1 = runUtil(u, args, proj);
      assert.equal(r1.status, 0, ctx + '\n' + r1.out);
      aplicar();
      const o = await valido(u, file, ctx);
      const ordena = (x) => ({ ...x, tickets: x.tickets.map(num).sort((a, b) => (a.id < b.id ? -1 : 1)), agentes: x.agentes.map(num).sort((a, b) => (a.nome < b.nome ? -1 : 1)) });
      assert.deepEqual(ordena(o), ordena(ref), ctx + ': o ficheiro não corresponde às operações aplicadas');
      const uma = readFileSync(file);
      const r2 = runUtil(u, args, proj);
      assert.equal(r2.status, 0, ctx + ' (2.ª vez)\n' + r2.out);
      assert.ok(readFileSync(file).equals(uma), ctx + ': aplicar 2× não deu o mesmo ficheiro');
    }
  }
});

test('C4: uma operação inválida (estado ou papel fora da lista) não deixa o ficheiro inválido nem o altera', async () => {
  const u = await api();
  const { file, proj } = painelTmp();
  const antes = readFileSync(file);
  for (const args of [u.argsTicket(file, { id: 'T-01', issue: 11, titulo: 'x', estado: 'feito', rondas: 1 }),
    u.argsAgente(file, { nome: 'z', papel: 'chefe', ticket: 'T-01', modelo: 'opus', checkpoint: 'z.md' }),
    u.argsAgente(file, { nome: 'z', papel: 'dev', ticket: 'T-01', modelo: 'opus', checkpoint: '../../fora.md' })]) {
    runUtil(u, args, proj);
    await valido(u, file, args.join(' '));
    assert.ok(readFileSync(file).equals(antes), 'o ficheiro mudou com uma operação inválida: ' + args.join(' '));
  }
});

test('C4: um painel.json corrompido (truncado a meio) nunca é substituído — os bytes ficam intactos (perda de dados)', async () => {
  const u = await api();
  const cheio = txt(base());
  for (const corte of [0.5, 0.9]) {
    const truncado = cheio.slice(0, Math.floor(cheio.length * corte));
    const { file, proj } = painelTmp(truncado);
    for (const args of [u.argsObjetivo(file, 'x'), u.argsTicket(file, { id: 'T-09', issue: 9, titulo: 'n', estado: 'falta', rondas: 0 }), u.argsRemoverAgente(file, 'dev-t03')]) {
      runUtil(u, args, proj);
      assert.equal(readFileSync(file, 'utf8'), truncado, 'o utilitário reescreveu um painel corrompido: ' + args.join(' '));
    }
  }
});

test('C4: caminhos com espaços e acentos funcionam', async () => {
  const u = await api();
  const { file, proj } = painelTmp(base(), 'pasta com espaços/ação Ünï çã');
  const r = runUtil(u, u.argsObjetivo(file, 'ok'), proj);
  assert.equal(r.status, 0, r.out);
  assert.equal((await valido(u, file, 'acentos')).objetivo, 'ok');
});

test('C4: o utilitário não escreve fora da pasta do painel.json (nem no projeto, nem no HOME)', async () => {
  const u = await api();
  const { file, proj, dir } = painelTmp();
  writeFileSync(join(proj, 'outro.txt'), 'x');
  const fora = () => [...walk(proj).filter((f) => !f.startsWith(dir + sep)), ...walk(FAKE_HOME)].sort();
  const antes = fora();
  for (const args of [u.argsObjetivo(file, 'a'), u.argsTicket(file, { id: 'T-07', issue: 7, titulo: 't', estado: 'dev', rondas: 0 }), u.argsAgente(file, { nome: 'n', papel: 'outro', ticket: 'T-07', modelo: 'haiku', checkpoint: 'n.md' }), u.argsRemoverAgente(file, 'n')]) {
    assert.equal(runUtil(u, args, proj).status, 0, args.join(' '));
  }
  assert.deepEqual(fora(), antes);
});

test('C4: escrita atómica — um leitor que lê sem parar durante 20 escritas nunca vê o ficheiro ausente, vazio ou com JSON partido', async () => {
  const u = await api();
  const o = base();
  o.tickets = Array.from({ length: 3000 }, (_, i) => ({ id: 'T-' + i, issue: i + 1, titulo: 'ticket número ' + i + ' com texto para encher', estado: ESTADOS[i % 7], rondas: i % 3 }));
  const { file, proj } = painelTmp(o);
  const vistos = [];
  let leituras = 0;
  for (let i = 0; i < 20; i++) {
    let fim = false;
    const filho = runUtilAsync(u, u.argsObjetivo(file, 'objetivo ' + i), proj).then((c) => { fim = true; return c; });
    while (!fim) {
      try { JSON.parse(readFileSync(file, 'utf8')); leituras++; } catch (e) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) vistos.push(`escrita ${i}: ${e.code ?? e.message.slice(0, 80)}`);
      }
      await new Promise((res) => setImmediate(res));
    }
    assert.equal(await filho, 0, 'escrita ' + i + ' falhou');
  }
  assert.deepEqual(vistos.slice(0, 10), [], `${vistos.length} leituras inválidas em ${leituras}`);
  assert.equal(readJson(file).objetivo, 'objetivo 19');
});

test('C4: 3 rondas de 8 escritores em paralelo deixam sempre um painel.json válido (nunca corrompido) e com os tickets que já existiam', async () => {
  const u = await api();
  const o = base();
  o.tickets = Array.from({ length: 3000 }, (_, i) => ({ id: 'T-' + i, issue: i + 1, titulo: 'ticket número ' + i + ' com texto para encher', estado: ESTADOS[i % 7], rondas: 0 }));
  const { file, proj } = painelTmp(o);
  for (let ronda = 0; ronda < 3; ronda++) {
    await Promise.all(Array.from({ length: 8 }, (_, i) => runUtilAsync(u, u.argsTicket(file, { id: `P-${ronda}-${i}`, issue: 9000 + i, titulo: 'paralelo ' + i, estado: 'dev', rondas: 0 }), proj)));
    const d = await valido(u, file, 'escritores em paralelo, ronda ' + ronda);
    assert.ok(d.tickets.filter((t) => t.id.startsWith('T-')).length === 3000, 'perderam-se tickets que já existiam');
  }
});

test('C4: num painel enorme (20 000 tickets), uma operação leva menos de 5 s e preserva os outros tickets', async () => {
  const u = await api();
  const o = base();
  o.tickets = Array.from({ length: 20000 }, (_, i) => ({ id: 'T-' + i, issue: i + 1, titulo: 't' + i, estado: ESTADOS[i % 7], rondas: 0 }));
  const { file, proj } = painelTmp(o);
  const t0 = Date.now();
  const r = runUtil(u, u.argsTicket(file, { id: 'T-123', issue: 124, titulo: 'mudado', estado: 'main', rondas: 2 }), proj);
  const ms = Date.now() - t0;
  assert.equal(r.status, 0, r.out);
  assert.ok(ms < 5000, `levou ${ms} ms`);
  const d = await valido(u, file, 'enorme');
  assert.equal(d.tickets.length, 20000);
  assert.equal(porId(d.tickets, 'id')['T-123'].titulo, 'mudado');
  assert.equal(porId(d.tickets, 'id')['T-19999'].titulo, 't19999');
});

// --- Ambíguos ---
test('C4 (PERGUNTA 10): uma operação recusada sai com código ≠ 0', { todo: 'PERGUNTA 10: código de saída de uma operação recusada' }, async () => {
  const u = await api();
  const { file, proj } = painelTmp();
  assert.notEqual(runUtil(u, u.argsTicket(file, { id: 'T-01', issue: 11, titulo: 'x', estado: 'feito', rondas: 1 }), proj).status, 0);
});
test('C4 (PERGUNTA 11): sobre um painel.json que não existe, o utilitário falha sem criar nada', { todo: 'PERGUNTA 11: ficheiro ausente — criar ou recusar?' }, async () => {
  const u = await api();
  const { file, proj } = painelTmp(undefined);
  assert.notEqual(runUtil(u, u.argsObjetivo(file, 'x'), proj).status, 0);
  assert.ok(!existsSync(file));
});
test('C4 (PERGUNTA 12): um painel.json válido com BOM (o Out-File do PowerShell 5.1 escreve-o) é aceite e continua válido', { todo: 'PERGUNTA 12: BOM aceite?' }, async () => {
  const u = await api();
  const { file, proj } = painelTmp('﻿' + txt(base()));
  assert.equal(runUtil(u, u.argsObjetivo(file, 'com bom'), proj).status, 0);
  assert.equal(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')).objetivo, 'com bom');
});
test('C4 (PERGUNTA 13): 8 escritores em paralelo não perdem atualizações (os 8 tickets ficam lá)', { todo: 'PERGUNTA 13: exige-se bloqueio entre escritores?' }, async () => {
  const u = await api();
  const { file, proj } = painelTmp();
  await Promise.all(Array.from({ length: 8 }, (_, i) => runUtilAsync(u, u.argsTicket(file, { id: 'P-' + i, issue: 200 + i, titulo: 'p', estado: 'dev', rondas: 0 }), proj)));
  assert.equal(readJson(file).tickets.filter((t) => t.id.startsWith('P-')).length, 8);
});
test('C4 (PERGUNTA 14): depois das operações, a pasta .checkpoints/ só tem o painel.json (sem temporários esquecidos)', { todo: 'PERGUNTA 14: temporários esquecidos contam?' }, async () => {
  const u = await api();
  const { file, proj, dir } = painelTmp();
  runUtil(u, u.argsObjetivo(file, 'x'), proj);
  assert.deepEqual(readdirSync(dir), ['painel.json']);
});
