// F-10 critério 4: o utilitário de atualização produz SEMPRE um painel.json válido e é idempotente.
// Oráculo: propriedade com 25 sequências de 4 operações (semente 4040, impressa), contra um modelo de referência em memória;
// mais leituras concorrentes durante 20 escritas, 20 escritores em paralelo, caminhos com espaços e acentos, e um ficheiro enorme.
// As respostas do orquestrador na #11 fazem parte do contrato: 3 (campos extra preservados), 5 (tipos inteiros), 10 (recusa: código 1,
// stderr, ficheiro intacto), 11 (ficheiro ausente: cria o esqueleto), 12 (lê BOM; escreve UTF-8 sem BOM e com LF), 13 (bloqueio .lock
// exclusivo, 5 s, código 1), 14 (sem temporários esquecidos depois de uma operação, concluída ou recusada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { api, base, txt, painelTmp, runUtil, runUtilAsync, readJson, rng, pick, ESTADOS, PAPEIS, MODOS, FAKE_HOME, walk } from './helpers.mjs';

const TEXTOS = ['Simples', 'Título "com" aspas', 'barra \\ invertida', 'ação ç Ü «x»', 'emoji 🚀✅', '$(whoami) `id` %PATH%', "'; process.exit(1); '", '- começa por hífen', 'x'.repeat(2000), '{"versao":2}', '__proto__'];
const NOMES = ['dev-a', 'critico-b', 'tester c', '__proto__', 'ação'];
const IDS = ['T-01', 'T-02', 'T-09', 'constructor', 'Ç-1'];

const valido = async (u, file, ctx) => {
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.startsWith('\uFEFF'), ctx + ': o utilitário escreveu BOM (resposta 12)');
  assert.ok(!raw.includes('\r'), ctx + ': o utilitário escreveu CR (resposta 12: só LF)');
  let o;
  try { o = JSON.parse(raw); } catch (e) { assert.fail(`${ctx}: o ficheiro não é JSON (${e.message}): ${raw.slice(0, 120)}`); }
  assert.deepEqual(u.validar(o), [], ctx + ': o painel.json ficou inválido');
  return o;
};
const porId = (xs, k) => Object.fromEntries(xs.map((x) => [x[k], x]));
// Painel com campos extra em sítios que as operações geradas nunca redefinem (resposta 3: aceites e preservados)
const baseExtra = () => {
  const o = base();
  o.extra = { a: [1, 'x', null], b: { c: true } };
  o.tickets[3].nota = 'nota «extra»';
  o.agentes[1].titulo = 'Lote 2';
  return o;
};
const restos = (dir) => readdirSync(dir).filter((n) => n !== 'painel.json').sort();

test('C4: cada operação aplicada uma vez faz o que diz, e o ficheiro continua válido', async () => {
  const u = await api();
  const { file, proj } = painelTmp();
  const t = { id: 'T-02', issue: 12, titulo: 'Segundo, revisto', estado: 'reprovado', rondas: 3 };
  const a = { nome: 'tester-1', papel: 'tester', ticket: 'T-02', modelo: 'haiku', checkpoint: 'tester-1.md', porta: 4900 };
  const passos = [
    [u.argsTicket(file, t), (o) => assert.deepEqual(porId(o.tickets, 'id')['T-02'], t)],
    [u.argsTicket(file, { ...t, id: 'T-05', issue: 15 }), (o) => assert.equal(o.tickets.length, 5)],
    [u.argsAgente(file, a), (o) => assert.deepEqual(porId(o.agentes, 'nome')['tester-1'], a)],
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
    const { file, proj } = painelTmp(baseExtra());
    const ref = baseExtra();
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
      const ordena = (x) => ({ ...x, tickets: [...x.tickets].sort((a, b) => (a.id < b.id ? -1 : 1)), agentes: [...x.agentes].sort((a, b) => (a.nome < b.nome ? -1 : 1)) });
      assert.deepEqual(ordena(o), ordena(ref), ctx + ': o ficheiro não corresponde às operações aplicadas');
      const uma = readFileSync(file);
      const r2 = runUtil(u, args, proj);
      assert.equal(r2.status, 0, ctx + ' (2.ª vez)\n' + r2.out);
      assert.ok(readFileSync(file).equals(uma), ctx + ': aplicar 2× não deu o mesmo ficheiro');
    }
  }
});

test('C4 (resposta 10): uma operação recusada sai com código 1, explica no stderr e deixa o ficheiro intacto, byte a byte, sem temporários', async () => {
  const u = await api();
  const { file, proj, dir } = painelTmp();
  const antes = readFileSync(file);
  const recusadas = [
    u.argsTicket(file, { id: 'T-01', issue: 11, titulo: 'x', estado: 'feito', rondas: 1 }),
    u.argsTicket(file, { id: 'T-01', issue: 0, titulo: 'x', estado: 'main', rondas: 1 }),
    u.argsTicket(file, { id: 'T-01', issue: 11, titulo: 'x', estado: 'main', rondas: -1 }),
    u.argsAgente(file, { nome: 'z', papel: 'chefe', ticket: 'T-01', modelo: 'opus', checkpoint: 'z.md' }),
    u.argsAgente(file, { nome: 'z', papel: 'dev', ticket: 'T-01', modelo: 'opus', checkpoint: '../../fora.md' }),
    u.argsAgente(file, { nome: 'z', papel: 'dev', ticket: 'T-01', modelo: 'opus', checkpoint: 'z.md', porta: 70000 }),
  ];
  for (const args of recusadas) {
    const r = runUtil(u, args, proj);
    assert.equal(r.status, 1, 'código de saída de uma operação recusada: ' + args.join(' ') + '\n' + r.out);
    assert.ok(r.err.trim().length > 0, 'sem mensagem no stderr: ' + args.join(' '));
    assert.ok(readFileSync(file).equals(antes), 'o ficheiro mudou com uma operação recusada: ' + args.join(' '));
    assert.deepEqual(restos(dir), [], 'temporários esquecidos depois de uma recusa (resposta 14)');
  }
});

test('C4: um painel.json corrompido (truncado a meio) é recusado com código 1 e nunca é substituído — os bytes ficam intactos (perda de dados)', async () => {
  const u = await api();
  const cheio = txt(base());
  for (const corte of [0.5, 0.9]) {
    const truncado = cheio.slice(0, Math.floor(cheio.length * corte));
    const { file, proj, dir } = painelTmp(truncado);
    for (const args of [u.argsObjetivo(file, 'x'), u.argsTicket(file, { id: 'T-09', issue: 9, titulo: 'n', estado: 'falta', rondas: 0 }), u.argsRemoverAgente(file, 'dev-t03')]) {
      const r = runUtil(u, args, proj);
      assert.equal(r.status, 1, 'código de saída: ' + args.join(' ') + '\n' + r.out);
      assert.equal(readFileSync(file, 'utf8'), truncado, 'o utilitário reescreveu um painel corrompido: ' + args.join(' '));
      assert.deepEqual(restos(dir), [], 'temporários esquecidos');
    }
  }
});

test('C4 (resposta 11): sobre um painel.json ausente, o utilitário cria o esqueleto válido (versao, modo, tickets, agentes) e aplica a operação', async () => {
  const u = await api();
  for (const [nome, args, ver] of [
    ['ticket', (f) => u.argsTicket(f, { id: 'T-01', issue: 1, titulo: 'primeiro', estado: 'dev', rondas: 0 }), (o) => { assert.deepEqual(o.tickets, [{ id: 'T-01', issue: 1, titulo: 'primeiro', estado: 'dev', rondas: 0 }]); assert.deepEqual(o.agentes, []); }],
    ['agente', (f) => u.argsAgente(f, { nome: 'a', papel: 'dev', ticket: 'T-01', modelo: 'opus', checkpoint: 'a.md' }), (o) => { assert.deepEqual(o.agentes, [{ nome: 'a', papel: 'dev', ticket: 'T-01', modelo: 'opus', checkpoint: 'a.md' }]); assert.deepEqual(o.tickets, []); }],
    ['objetivo', (f) => u.argsObjetivo(f, 'arrancar'), (o) => { assert.equal(o.objetivo, 'arrancar'); assert.deepEqual([o.tickets, o.agentes], [[], []]); }],
  ]) {
    const { file, proj, dir } = painelTmp(null);
    const r = runUtil(u, args(file), proj);
    assert.equal(r.status, 0, nome + '\n' + r.out);
    const o = await valido(u, file, 'ausente: ' + nome);
    assert.equal(o.versao, 1, nome);
    assert.ok(MODOS.includes(o.modo), nome + ': modo ' + o.modo);
    ver(o);
    assert.deepEqual(restos(dir), [], nome + ': temporários esquecidos');
  }
});

test('C4 (resposta 12): lê um painel.json com BOM e com CRLF, e escreve sempre UTF-8 sem BOM e com LF', async () => {
  const u = await api();
  for (const [nome, texto] of [['BOM', '\uFEFF' + txt(base())], ['CRLF', txt(base()).replace(/\n/g, '\r\n')], ['BOM e CRLF', '\uFEFF' + txt(base()).replace(/\n/g, '\r\n')]]) {
    const { file, proj } = painelTmp(texto);
    const r = runUtil(u, u.argsObjetivo(file, 'com ' + nome), proj);
    assert.equal(r.status, 0, nome + '\n' + r.out);
    const o = await valido(u, file, nome);
    assert.equal(o.objetivo, 'com ' + nome);
    assert.equal(o.tickets.length, 4, nome);
  }
});

test('C4 (resposta 3): os campos extra (no topo, num ticket e num agente) são aceites e preservados pelas operações sobre outros itens', async () => {
  const u = await api();
  const { file, proj } = painelTmp(baseExtra());
  for (const args of [u.argsObjetivo(file, 'x'), u.argsTicket(file, { id: 'T-01', issue: 11, titulo: 'mudado', estado: 'aprovado', rondas: 3 }),
    u.argsAgente(file, { nome: 'dev-t03', papel: 'dev', ticket: 'T-01', modelo: 'opus', checkpoint: 'd.md' }), u.argsRemoverAgente(file, 'inexistente')]) {
    const r = runUtil(u, args, proj);
    assert.equal(r.status, 0, args.join(' ') + '\n' + r.out);
    const o = await valido(u, file, args.join(' '));
    assert.deepEqual(o.extra, { a: [1, 'x', null], b: { c: true } }, 'campo extra do topo perdido ou alterado');
    assert.equal(porId(o.tickets, 'id')['T-04'].nota, 'nota «extra»', 'campo extra do ticket perdido');
    assert.equal(porId(o.agentes, 'nome')['critico-t03'].titulo, 'Lote 2', 'campo extra do agente perdido');
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

test('C4 (resposta 13): 2 rondas de 20 escritores em paralelo, cada um com um ticket diferente — saem todos com 0, os 20 ficam no ficheiro, nada se perde e não sobra o .lock', async () => {
  const u = await api();
  const o = base();
  o.tickets = Array.from({ length: 500 }, (_, i) => ({ id: 'T-' + i, issue: i + 1, titulo: 'ticket número ' + i + ' com texto para encher', estado: ESTADOS[i % 7], rondas: 0 }));
  const { file, proj, dir } = painelTmp(o);
  for (let ronda = 0; ronda < 2; ronda++) {
    const codigos = await Promise.all(Array.from({ length: 20 }, (_, i) => runUtilAsync(u, u.argsTicket(file, { id: `P-${ronda}-${i}`, issue: 9000 + i, titulo: 'paralelo ' + i, estado: 'dev', rondas: 0 }), proj)));
    assert.deepEqual(codigos, Array(20).fill(0), 'ronda ' + ronda + ': códigos de saída');
    const d = await valido(u, file, 'escritores em paralelo, ronda ' + ronda);
    const ids = new Set(d.tickets.map((t) => t.id));
    const perdidos = Array.from({ length: 20 }, (_, i) => `P-${ronda}-${i}`).filter((id) => !ids.has(id));
    assert.deepEqual(perdidos, [], 'atualizações perdidas na ronda ' + ronda);
    assert.equal(d.tickets.filter((t) => t.id.startsWith('T-')).length, 500, 'perderam-se tickets que já existiam');
    assert.deepEqual(restos(dir), [], 'sobrou o .lock ou um temporário');
  }
});

test('C4 (resposta 13): com o .lock ocupado por outro, o utilitário tenta de novo até 5 s, sai com código 1 e não toca no painel.json', async () => {
  const u = await api();
  const { file, proj } = painelTmp();
  const antes = readFileSync(file);
  const lock = u.bloqueio(file);
  writeFileSync(lock, 'ocupado');
  const t0 = Date.now();
  const r = runUtil(u, u.argsObjetivo(file, 'x'), proj);
  const ms = Date.now() - t0;
  assert.equal(r.status, 1, r.out);
  assert.ok(ms >= 4500 && ms < 10000, `desistiu ao fim de ${ms} ms (o contrato diz 5 s)`);
  assert.ok(readFileSync(file).equals(antes), 'o painel.json mudou sem o bloqueio');
  assert.equal(readFileSync(lock, 'utf8'), 'ocupado', 'o utilitário apagou ou reescreveu o .lock de outro processo');
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

test('C4 (resposta 14): depois de operações concluídas, a pasta .checkpoints/ não tem temporários nem .lock', async () => {
  const u = await api();
  const { file, proj, dir } = painelTmp();
  writeFileSync(join(dir, 'dev-t03.md'), '# checkpoint');
  for (const args of [u.argsObjetivo(file, 'x'), u.argsTicket(file, { id: 'T-07', issue: 7, titulo: 't', estado: 'dev', rondas: 0 }), u.argsAgente(file, { nome: 'n', papel: 'outro', ticket: 'T-07', modelo: 'haiku', checkpoint: 'n.md' }), u.argsRemoverAgente(file, 'n')]) {
    assert.equal(runUtil(u, args, proj).status, 0, args.join(' '));
    assert.deepEqual(restos(dir), ['dev-t03.md'], 'temporários esquecidos: ' + args.join(' '));
  }
});