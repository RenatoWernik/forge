// The panel mod (F-11, #12): its data function against a fake runtime, the listening-port parser, the orchestrator pulse and
// the text panel. Standard library only; nothing is installed in Claude Code, the mod runs against the fake `$` below.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ler } from './painel-leitor.mjs';
import { dados, iniciar, abrir, pulso, linhaPulso, portas, texto, NAO_FORGE } from './mod-painel.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MIN = 60000, AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);
const temps = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'forge-mod-')); temps.push(d); return d; };
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const base = () => ({
  versao: 1, projeto: 'Exemplo', objetivo: 'Fechar o lote 1', modo: 'rigoroso',
  tickets: [
    { id: 'T-01', issue: 11, titulo: 'Primeiro', estado: 'main', rondas: 2 },
    { id: 'T-02', issue: 12, titulo: 'Segundo', estado: 'critico', rondas: 1 },
  ],
  agentes: [
    { nome: 'dev-t02', papel: 'dev', ticket: 'T-02', modelo: 'sonnet', checkpoint: 'dev-t02.md', porta: 4801 },
    { nome: 'critico-t02', papel: 'critico', ticket: 'T-02', modelo: 'opus', checkpoint: 'critico-t02.md' },
  ],
});

// A project in a temporary folder: painel = object, literal text or null; checkpoints = { file: minutes ago }
const projeto = ({ painel = base(), checkpoints = {}, forge = true } = {}) => {
  const raiz = join(tmp(), 'Projeto Ação');
  const dir = join(raiz, '.checkpoints');
  mkdirSync(dir, { recursive: true });
  if (forge) { mkdirSync(join(raiz, '.claude')); writeFileSync(join(raiz, '.claude/forge.json'), '{}\n'); }
  if (painel !== null) writeFileSync(join(dir, 'painel.json'), typeof painel === 'string' ? painel : JSON.stringify(painel));
  for (const [f, min] of Object.entries(checkpoints)) {
    writeFileSync(join(dir, f), '#\n');
    utimesSync(join(dir, f), (AGORA - min * MIN) / 1000, (AGORA - min * MIN) / 1000);
  }
  return { raiz, dir };
};

// The fake `$`: a real fs over the temporary folder that logs every call; process.run never runs anything
const runtime = ({ raiz, cwd = raiz, saidas = {} }) => {
  const log = { leituras: [], processos: [], abertos: [], comandos: [], escritas: [] };
  const $ = {
    fs: {
      read: async (p) => { log.leituras.push(p); return readFileSync(p, 'utf8'); },
      list: async (p) => { log.leituras.push(p); return readdirSync(p).map((name) => { const s = statSync(join(p, name)); return { name, kind: s.isFile() ? 'file' : 'dir', size: s.size, mtimeMs: s.isFile() ? s.mtimeMs : 0, isLink: false }; }); },
      exists: async (p) => existsSync(p),
      write: async (p) => { log.escritas.push(p); },
    },
    session: { root: async () => raiz, cwd: async () => cwd, messages: async () => { log.leituras.push('messages'); return []; } },
    process: { run: async (argv) => { log.processos.push(argv); return { exitCode: argv[0] in saidas ? 0 : 1, stdout: saidas[argv[0]] ?? '', stderr: '' }; } },
    ui: { open: async (o) => { log.abertos.push(o); return { isPlaced: true }; } },
    command: { register: async (c) => { log.comandos.push(c); } },
    clock: { now: async () => AGORA },
  };
  return { $, log };
};

const mtimes = (dir) => Object.fromEntries(readdirSync(dir).map((n) => [n, statSync(join(dir, n)).mtimeMs]));

// --- criterion 2: no absolute paths, session ids or project names in the mod ---
test('o código do mod não tem caminhos absolutos, UUIDs nem nomes de projeto', () => {
  // [u] and [H] keep the words themselves out of this file, which the F-10 scan also reads
  const PROIBIDO = [/[A-Z]:[\\/]/, /\/Users\//, /\/home\//, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /g[u]ilda/i, /Agent[H]omes/i];
  const ficheiros = ['hooks/painel.tsx', 'hooks/hooks.json', 'scripts/mod-painel.mjs', 'types/index.d.ts', 'tsconfig.json', '.claude-plugin/plugin.json'];
  const achados = [];
  for (const f of ficheiros) {
    readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/).forEach((l, i) => { for (const re of PROIBIDO) if (re.test(l)) achados.push(`${f}:${i + 1}: ${l.trim()}`); });
  }
  assert.deepEqual(achados, []);
});

// --- criterion 3: the model is the shared reader's on the same text and mtimes ---
const FIXTURES = {
  completo: { checkpoints: { 'dev-t02.md': 3, 'critico-t02.md': 45 } },
  vazio: { painel: { versao: 1, modo: 'acelerado', tickets: [], agentes: [] } },
  'agente parado': { checkpoints: { 'dev-t02.md': 31 } },
  'campo inválido': { painel: { ...base(), modo: 'turbo' } },
  'JSON truncado': { painel: '{"versao": 1, "modo"' },
  ausente: { painel: null },
  'com BOM': { painel: '﻿' + JSON.stringify(base()) },
};
for (const [nome, caso] of Object.entries(FIXTURES)) {
  test(`«${nome}»: o modelo do mod é o do leitor partilhado, sem escrever`, async () => {
    const p = projeto(caso);
    const { $, log } = runtime({ raiz: p.raiz });
    const m = await dados($, AGORA);
    const ficheiro = join(p.dir, 'painel.json');
    const exp = ler(existsSync(ficheiro) ? readFileSync(ficheiro, 'utf8') : undefined, mtimes(p.dir), AGORA);
    assert.deepEqual({ ...m, agentes: m.agentes.map(({ portaViva, ...a }) => a) }, exp);
    assert.deepEqual(log.escritas, []);
  });
}

test('a porta de um agente é viva só quando está em escuta; sem a lista de portas, não se sabe (sem alarme)', async () => {
  const p = projeto();
  const ouvir = '  TCP    127.0.0.1:4801         0.0.0.0:0              LISTENING       15232\r\n';
  const vivo = await dados(runtime({ raiz: p.raiz, saidas: { netstat: ouvir, lsof: 'node 1 u 3u IPv4 0x1 0t0 TCP 127.0.0.1:4801 (LISTEN)\n' } }).$, AGORA);
  assert.equal(vivo.agentes[0].portaViva, true);
  const morto = await dados(runtime({ raiz: p.raiz, saidas: { netstat: '', lsof: '' } }).$, AGORA);
  assert.equal(morto.agentes[0].portaViva, false);
  const semLista = await dados(runtime({ raiz: p.raiz }).$, AGORA);
  assert.equal(semLista.agentes[0].portaViva, undefined);
  assert.equal('portaViva' in semLista.agentes[1], false);
});

// --- criterion 4: listening ports from real outputs ---
const SAIDAS = [
  ['win32', '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1696\r\n  TCP    127.0.0.1:4801         127.0.0.1:50612        ESTABLISHED     15232\r\n  TCP    [::1]:5173             [::]:0                 LISTENING       20480\r\n', [135, 5173]],
  ['win32', '  TCP    0.0.0.0:3000           0.0.0.0:0              ESCUTA          30112\r\n  TCP    10.0.0.7:61020         20.42.65.92:443        TEMPO_ESPERA    0\r\n', [3000]],
  ['darwin', 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 43121 u 24u IPv6 0x8f 0t0 TCP [::1]:5174 (LISTEN)\nrapportd 512 u 4u IPv4 0x8f 0t0 TCP *:49152 (LISTEN)\n', [5174, 49152]],
  ['linux', 'LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*\nLISTEN 0      4096 [::ffff:127.0.0.1]:6379          *:*\n', [53, 6379]],
];
for (const [so, saida, esperadas] of SAIDAS) {
  test(`portas em escuta (${so}): ${esperadas.join(', ')}`, () => {
    assert.deepEqual(portas(saida, so).sort((a, b) => a - b), esperadas);
  });
}
test('portas: saída vazia, lixo ou porta fora de 1..65535 dão []', () => {
  for (const so of ['win32', 'darwin', 'linux']) for (const s of ['', 'garbage:99999 LISTEN', '  TCP    0.0.0.0:0  0.0.0.0:0  LISTENING  1\r\n']) assert.deepEqual(portas(s, so), []);
});

// --- criterion 5: activation by .claude/forge.json ---
test('sem .claude/forge.json: regista o comando, não abre o painel, não lê ficheiros nem corre processos', async () => {
  const p = projeto({ forge: false });
  const { $, log } = runtime({ raiz: p.raiz, saidas: { netstat: '' } });
  await iniciar($);
  const m = await dados($, AGORA);
  const r = await abrir($);
  assert.equal(log.comandos.length, 1);
  assert.deepEqual([log.abertos, log.leituras, log.processos], [[], [], []]);
  assert.equal(m.contagens, null);
  assert.match(r.text, new RegExp(NAO_FORGE));
});

test('com .claude/forge.json: o arranque só regista o comando; o comando refresca e abre o painel', async () => {
  const p = projeto();
  const { $, log } = runtime({ raiz: p.raiz });
  await iniciar($);
  assert.deepEqual([log.comandos.length, log.abertos.length, log.leituras.length], [1, 0, 0]);
  let refrescado = 0;
  const r = await abrir($, async () => { refrescado++; });
  assert.deepEqual([refrescado, log.abertos.length], [1, 1]);
  assert.doesNotMatch(r.text, new RegExp(NAO_FORGE));
});

test('a raiz é session.root(); com root() undefined, session.cwd()', async () => {
  const a = projeto({ checkpoints: { 'dev-t02.md': 1 } });
  const b = projeto({ painel: { versao: 1, modo: 'acelerado', tickets: [], agentes: [] } });
  const daRaiz = runtime({ raiz: a.raiz, cwd: b.raiz });
  assert.equal((await dados(daRaiz.$, AGORA)).agentes.length, 2);
  assert.ok(daRaiz.log.leituras.every((f) => f.startsWith(a.raiz)));
  assert.equal((await dados(runtime({ raiz: undefined, cwd: b.raiz }).$, AGORA)).agentes.length, 0);
});

// --- criterion 6: the orchestrator pulse ---
test('pulso: ativo abaixo de 2 min, «a pensar» até 10 min, parado a partir de 10 min', () => {
  const estado = (ms) => pulso(AGORA - ms, AGORA - ms - 5 * MIN, AGORA).estado;
  assert.deepEqual([0, 119999, 120000, 599999, 600000].map(estado), ['ativo', 'ativo', 'a pensar', 'a pensar', 'parado']);
});

test('pulso: autónomo só com a última ação mais de 60 s depois da última mensagem', () => {
  const msg = AGORA - 10 * MIN;
  assert.deepEqual([61000, 60001, 60000, 0, -MIN].map((d) => pulso(msg + d, msg, AGORA).autonomia), ['autónomo', 'autónomo', 'comigo', 'comigo', 'comigo']);
});

test('linha do pulso: sem ação ou sem mensagem, 15 «·» e «sem atividade»; com atividade, o estado', () => {
  for (const [acoes, msg] of [[[], AGORA], [[AGORA], undefined]]) assert.equal(linhaPulso(acoes, msg, AGORA), '·'.repeat(15) + ' sem atividade');
  const l = linhaPulso([AGORA - 3 * MIN], AGORA - 10 * MIN, AGORA);
  assert.match(l, /a pensar há 3 min · autónomo$/);
  assert.equal([...l][13], '█');
});

// --- the text panel (answer 4 of #12) ---
test('texto: nenhuma linha passa da largura, um nome longo é cortado com «…», mostra contagens e erro, sem tokens', async () => {
  const longo = 'desenvolvedor-coração-'.repeat(4);
  const p = projeto({ painel: { ...base(), projeto: '🚀 Coração '.repeat(8), agentes: [{ ...base().agentes[0], nome: longo }] }, checkpoints: { 'dev-t02.md': 2 } });
  const m = await dados(runtime({ raiz: p.raiz }).$, AGORA);
  for (const L of [40, 80, 120]) {
    const linhas = texto({ ...m, pulso: linhaPulso([AGORA], AGORA - MIN, AGORA) }, L).split('\n');
    assert.ok(linhas.every((l) => [...l].reduce((n, c) => n + (/\p{Extended_Pictographic}/u.test(c) ? 2 : 1), 0) <= L), L);
    assert.ok(linhas.some((l) => /\b1 main\b/.test(l)) && linhas.some((l) => /\b1 crítico\b/.test(l)));
    assert.doesNotMatch(linhas.join('\n'), /\btok/);
  }
  assert.ok(texto(m, 40).split('\n').includes('● ' + longo.slice(0, 37) + '…'));
  assert.match(texto({ erro: 'painel.json is missing', contagens: null, agentes: [] }, 40), /⚠ painel\.json is missing/);
});
