// painel.json v1 (F-10, #11): the validator, the shared reader, the update command and the file the scaffold generates. Standard library only.
// Seams: the reader (pure function), the command line on a temporary file, and the scaffold output.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validar, ler } from './painel-leitor.mjs';
import { aplicar, bloqueio } from './painel.mjs';
import { scaffold, LEITOR_NO_PROJETO } from './scaffold.mjs';

const CLI = fileURLToPath(new URL('./painel.mjs', import.meta.url));
const MIN = 60000, AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);
const temps = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'forge-painel-')); temps.push(d); return d; };
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const base = () => ({
  versao: 1, projeto: 'Exemplo', objetivo: 'Fechar o lote 1', modo: 'rigoroso',
  tickets: [
    { id: 'T-01', issue: 11, titulo: 'Primeiro', estado: 'main', rondas: 2 },
    { id: 'T-02', issue: 12, titulo: 'Segundo', estado: 'aprovado', rondas: 1 },
    { id: 'T-03', issue: 13, titulo: 'Terceiro', estado: 'critico', rondas: 1 },
    { id: 'T-04', issue: 14, titulo: 'Quarto', estado: 'falta', rondas: 0 },
  ],
  agentes: [
    { nome: 'dev-t03', papel: 'dev', ticket: 'T-03', modelo: 'sonnet', checkpoint: 'dev-t03.md', porta: 4801 },
    { nome: 'critico-t03', papel: 'critico', ticket: 'T-03', modelo: 'opus', checkpoint: 'critico-t03.md' },
  ],
});
const mut = (f) => { const o = base(); f(o); return o; };
const txt = (o) => JSON.stringify(o, null, 2) + '\n';

// --- 1. the validator ---
const VALIDOS = {
  base: base(),
  'esqueleto mínimo': { versao: 1, modo: 'acelerado', tickets: [], agentes: [] },
  'portas 1 e 65535, objetivo vazio': mut((o) => { o.agentes[0].porta = 1; o.agentes[1].porta = 65535; o.objetivo = ''; }),
  'campos extra aceites': mut((o) => { o.extra = [1]; o.tickets[0].nota = 'n'; o.agentes[0].titulo = 'x'; }),
};
const INVALIDOS = [
  ['versao', (o) => { o.versao = '1'; }], ['versao', (o) => { o.versao = 0; }], ['modo', (o) => { o.modo = 'turbo'; }],
  ['tickets', (o) => { delete o.tickets; }], ['agentes', (o) => { o.agentes = 'x'; }],
  ['tickets[2].estado', (o) => { o.tickets[2].estado = 'feito'; }], ['tickets[1].issue', (o) => { o.tickets[1].issue = 0; }],
  ['tickets[0].rondas', (o) => { o.tickets[0].rondas = -1; }], ['tickets[3].id', (o) => { delete o.tickets[3].id; }],
  ['tickets[1]', (o) => { o.tickets[1] = null; }], ['tickets[1].id', (o) => { o.tickets[1].id = 'T-01'; }],
  ['agentes[0].papel', (o) => { o.agentes[0].papel = 'chefe'; }], ['agentes[1].checkpoint', (o) => { o.agentes[1].checkpoint = '../fora.md'; }],
  ['agentes[1].checkpoint', (o) => { o.agentes[1].checkpoint = '/etc/passwd'; }], ['agentes[0].porta', (o) => { o.agentes[0].porta = 65536; }],
  ['agentes[1].nome', (o) => { o.agentes[1].nome = 'dev-t03'; }],
];

test('o validador aceita cada painel válido e recusa cada inválido citando o caminho do campo', () => {
  for (const [nome, o] of Object.entries(VALIDOS)) assert.deepEqual(validar(o), [], nome);
  for (const [caminho, f] of INVALIDOS) {
    const erros = validar(mut(f));
    assert.ok(erros.length > 0 && erros.every((e) => e.startsWith(caminho)), `${caminho}: ${JSON.stringify(erros)}`);
  }
  for (const raiz of [null, [], 'x', 1, true]) assert.ok(validar(raiz).length > 0);
});

// --- 2. the reader ---
test('o leitor devolve o modelo de vista esperado, com os sete estados na ordem fixa', () => {
  const m = ler(txt(base()), { 'dev-t03.md': AGORA - 12 * MIN }, AGORA);
  assert.deepEqual(m, {
    projeto: 'Exemplo', modo: 'rigoroso', objetivo: 'Fechar o lote 1',
    contagens: [['main', 1], ['aprovado', 1], ['critico', 1], ['dev', 0], ['reprovado', 0], ['espera', 0], ['falta', 1]],
    percentagem: 50,
    agentes: [
      { ...base().agentes[0], vida: 'sem sinal', minutos: 12 },
      { ...base().agentes[1], vida: 'a começar', minutos: null },
    ],
  });
});

test('o leitor nunca lança exceção: texto ausente, truncado ou inválido dá { erro, contagens: null, agentes: [] }', () => {
  const cheio = txt(base());
  const casos = [null, undefined, '', '  ', '[]', 'null', cheio.replace('"falta"', '"feito"'), '\uFEFF\uFEFF' + cheio];
  for (let n = 0; n < cheio.trimEnd().length; n += 7) casos.push(cheio.slice(0, n));
  for (const c of casos) {
    const m = ler(c, {}, AGORA);
    assert.deepEqual(Object.keys(m).sort(), ['agentes', 'contagens', 'erro']);
    assert.ok(m.erro.length > 0 && m.contagens === null && m.agentes.length === 0);
  }
  assert.deepEqual(ler('\uFEFF' + cheio, {}, AGORA), ler(cheio, {}, AGORA));
});

// --- 3. the life of an agent ---
test('minutos e vida: 0, 9, 10, 29, 30 e 31 min, sem ficheiro, e um mtime no futuro; o limiar conta o tempo real', () => {
  const o = base();
  const tabela = [[0, 'ativo', 0], [9 * MIN + 59900, 'ativo', 9], [10 * MIN, 'sem sinal', 10], [29 * MIN, 'sem sinal', 29], [29 * MIN + 59900, 'sem sinal', 29],
    [30 * MIN, 'parado?', 30], [31 * MIN, 'parado?', 31], [-5 * MIN, 'ativo', 0]];
  o.agentes = tabela.map((_, i) => ({ nome: 'a' + i, papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint: `c${i}.md` }));
  o.agentes.push({ nome: 'sem', papel: 'dev', ticket: 'T-01', modelo: 'x', checkpoint: 'sem.md' });
  const mtimes = Object.fromEntries(tabela.map(([ms], i) => [`c${i}.md`, AGORA - ms]));
  const visto = ler(txt(o), mtimes, AGORA).agentes.map((a) => [a.vida, a.minutos]);
  assert.deepEqual(visto, [...tabela.map(([, v, m]) => [v, m]), ['a começar', null]]);
});

// --- 4. the update command ---
const painelTmp = (o) => {
  const dir = join(tmp(), '.checkpoints');
  mkdirSync(dir);
  const file = join(dir, 'painel.json');
  if (o) writeFileSync(file, txt(o));
  return { dir, file };
};
const rng = (seed) => () => { // mulberry32
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('200 sequências de operações geradas (semente 5050): válido depois de cada passo, igual ao modelo de referência, e idempotente', (t) => {
  const SEED = 5050;
  t.diagnostic('semente ' + SEED);
  const r = rng(SEED), pick = (xs) => xs[Math.floor(r() * xs.length)];
  const ESTADOS = ['falta', 'espera', 'dev', 'critico', 'reprovado', 'aprovado', 'main'];
  const TEXTOS = ['Simples', 'com "aspas" e \\ barra', 'ação ç «x» 🚀', '- hífen', '__proto__', '$(x) %PATH%'];
  const { file } = painelTmp();
  for (let s = 0; s < 200; s++) {
    rmSync(file, { force: true });
    const ref = { versao: 1, modo: 'rigoroso', tickets: [], agentes: [] };
    for (let p = 0; p < 4; p++) {
      const k = pick(['ticket', 'agente', 'remover-agente', 'objetivo']);
      let args, aplica;
      if (k === 'ticket') {
        const x = { id: pick(['T-1', 'T-2', 'constructor']), issue: 1 + Math.floor(r() * 99), titulo: pick(TEXTOS), estado: pick(ESTADOS), rondas: Math.floor(r() * 4) };
        args = Object.fromEntries(Object.entries(x).map(([a, v]) => [a, String(v)]));
        aplica = () => { const i = ref.tickets.findIndex((y) => y.id === x.id); i < 0 ? ref.tickets.push(x) : (ref.tickets[i] = x); };
      } else if (k === 'agente') {
        const nome = pick(['a', 'b', '__proto__']);
        const x = { nome, papel: pick(['dev', 'critico', 'tester', 'outro']), ticket: pick(TEXTOS), modelo: 'sonnet', checkpoint: nome.replace(/\W/g, '_') + '.md', ...(r() < 0.5 && { porta: 4000 + Math.floor(r() * 99) }) };
        args = Object.fromEntries(Object.entries(x).map(([a, v]) => [a, String(v)]));
        aplica = () => { const i = ref.agentes.findIndex((y) => y.nome === x.nome); i < 0 ? ref.agentes.push(x) : (ref.agentes[i] = x); };
      } else if (k === 'remover-agente') {
        const nome = pick(['a', 'b', 'z']);
        args = { nome };
        aplica = () => { ref.agentes = ref.agentes.filter((y) => y.nome !== nome); };
      } else {
        const texto = pick(TEXTOS);
        args = { texto };
        aplica = () => { ref.objetivo = texto; };
      }
      const ctx = `sequência ${s}, passo ${p}: ${k} ${JSON.stringify(args)}`;
      aplicar(file, k, args);
      aplica();
      const uma = readFileSync(file);
      const o = JSON.parse(uma.toString());
      assert.deepEqual(validar(o), [], ctx);
      assert.deepEqual(o, ref, ctx);
      aplicar(file, k, args);
      assert.ok(readFileSync(file).equals(uma), ctx + ': aplicar 2× deu outro ficheiro');
    }
  }
});

const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 60000 });

test('uma operação recusada sai com 1, explica no stderr e deixa o ficheiro e a pasta como estavam', () => {
  const { dir, file } = painelTmp(base());
  const antes = readFileSync(file);
  for (const args of [['ticket', file, '--id=T-01', '--issue=0', '--titulo=x', '--estado=main', '--rondas=1'], ['ticket', file, '--id=T-01', '--issue=1', '--estado=main', '--rondas=1'],
    ['agente', file, '--nome=z', '--papel=chefe', '--ticket=T-01', '--modelo=x', '--checkpoint=z.md'], ['objetivo', file, '--texto=x', '--extra=1'], ['objetivo', file, 'sem-chave'], ['desconhecido', file]]) {
    const r = cli(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.ok(r.stderr.trim().length > 0);
    assert.ok(readFileSync(file).equals(antes));
    assert.deepEqual(readdirSync(dir), ['painel.json']);
  }
});

test('um painel.json truncado nunca é substituído; um painel.json ausente é criado com o esqueleto', () => {
  const cheio = txt(base());
  const { dir, file } = painelTmp();
  writeFileSync(file, cheio.slice(0, 40));
  assert.equal(cli('objetivo', file, '--texto=x').status, 1);
  assert.equal(readFileSync(file, 'utf8'), cheio.slice(0, 40));
  rmSync(file);
  assert.equal(cli('objetivo', file, '--texto=arrancar').status, 0);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { versao: 1, modo: 'rigoroso', tickets: [], agentes: [], objetivo: 'arrancar' });
  assert.deepEqual(readdirSync(dir), ['painel.json']);
});

test('escritores em paralelo: com o bloqueio, nenhuma atualização se perde e não sobra o .lock', async () => {
  const { dir, file } = painelTmp(base());
  const codigos = await Promise.all(Array.from({ length: 12 }, (_, i) => new Promise((res) => {
    spawn(process.execPath, [CLI, 'ticket', file, `--id=P-${i}`, `--issue=${100 + i}`, `--titulo=p${i}`, '--estado=dev', '--rondas=0'], { stdio: 'ignore' }).on('exit', res);
  })));
  assert.deepEqual(codigos, Array(12).fill(0));
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).tickets.length, 4 + 12);
  assert.deepEqual(readdirSync(dir), ['painel.json']);
});

test('com o .lock ocupado por outro, desiste ao fim de 5 s com código 1 e não toca no painel nem no .lock', () => {
  const { file } = painelTmp(base());
  const antes = readFileSync(file);
  writeFileSync(bloqueio(file), 'ocupado');
  const t0 = Date.now();
  assert.equal(cli('objetivo', file, '--texto=x').status, 1);
  assert.ok(Date.now() - t0 >= 4500);
  assert.ok(readFileSync(file).equals(antes));
  assert.equal(readFileSync(bloqueio(file), 'utf8'), 'ocupado');
});

// --- 5. the scaffold ---
test('o scaffold gera um painel.json inicial válido, com o projeto, o modo e zero tickets, e a cópia exata do leitor', async () => {
  const dest = join(tmp(), 'p');
  await scaffold({
    projectName: 'Ação Ünï 2', language: 'English', memory: { workspace: 'acme', project: 'billing' },
    models: { developer: { model: 'sonnet', effort: 'high' }, critic: { model: 'opus', effort: 'high' }, aux: { model: 'sonnet', effort: 'medium' } },
  }, { dest });
  const raw = readFileSync(join(dest, '.checkpoints/painel.json'), 'utf8');
  assert.deepEqual(validar(JSON.parse(raw)), []);
  assert.deepEqual(JSON.parse(raw), { versao: 1, projeto: 'Ação Ünï 2', modo: 'rigoroso', tickets: [], agentes: [] });
  assert.equal(ler(raw, {}, AGORA).percentagem, 0);
  assert.ok(readFileSync(join(dest, LEITOR_NO_PROJETO)).equals(readFileSync(new URL('./painel-leitor.mjs', import.meta.url))));
});

test('scaffold com force não apaga os tickets de um painel.json em uso; o leitor aceita mtimes null', async () => {
  const dest = join(tmp(), 'p');
  const respostas = {
    projectName: 'Acme', language: 'English', memory: { workspace: 'acme', project: 'billing' },
    models: { developer: { model: 'sonnet', effort: 'high' }, critic: { model: 'opus', effort: 'high' }, aux: { model: 'sonnet', effort: 'medium' } },
  };
  await scaffold(respostas, { dest });
  const file = join(dest, '.checkpoints/painel.json');
  aplicar(file, 'ticket', { id: 'T-01', issue: '1', titulo: 'x', estado: 'dev', rondas: '0' });
  const antes = readFileSync(file);
  await scaffold(respostas, { dest, force: true });
  assert.ok(readFileSync(file).equals(antes));
  assert.deepEqual(ler(txt(base()), null, AGORA).agentes.map((a) => a.vida), ['a começar', 'a começar']);
});
