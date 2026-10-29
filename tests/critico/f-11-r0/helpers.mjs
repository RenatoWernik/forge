// Ronda −1 do F-11 (#12): utilitários partilhados pelos ataques ao mod do painel. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import,
// e todas as pastas temporárias criadas aqui são apagadas no `after` do ficheiro de teste que as criou. Nada é instalado no
// Claude Code real: o mod corre contra um runtime falso (`runtime()` abaixo), nunca contra o motor.
//
// PONTE (PERGUNTA 1 da Ronda −1, o mesmo mecanismo do F-10). O contrato deixa livres o sítio e os nomes dos módulos do mod.
// Para os ataques não fixarem nomes, o dev escreve na Ronda 0 `tests/ponte/f-11.mjs`, que só importa do pacote e adapta a
// forma. Sem ciclos, sem condições, sem fs, sem JSON.parse e sem relógio (o c0-ponte.test.mjs verifica). Exporta:
//   dados($, agora)     -> Promise<modelo>  a função de dados do mod (o seam do contrato), a correr contra o runtime `$`;
//                          resolve no modelo que o mod mostra: os campos do leitor do F-10 (projeto, modo, objetivo, contagens,
//                          percentagem, agentes[] com vida e minutos; ou erro, contagens: null, agentes: []). Campos a mais
//                          (tokens, portas, ...) são aceites. `agora` em ms; o runtime falso dá o mesmo valor em $.clock.now().
//   iniciar($)          -> Promise          o que o hook `session.start` do mod faz (sem o next). Corre contra o runtime falso,
//                          que regista cada chamada. Resposta 8: só regista o comando, nunca abre o painel sozinho.
//   abrir($)            -> Promise<{ text }> o que o hook `command.run` do comando do painel faz (o resultado do hook).
//                          Resposta 8: sem forge.json, o text diz «este projeto não é um projeto forge» e nada é lido.
//   pulso(ultimaAcao, ultimaMensagem, agora) -> { estado, autonomia }   ms; estado 'ativo' | 'a pensar' | 'parado';
//                          autonomia 'autónomo' | 'comigo' (comparado sem maiúsculas). ultimaMensagem = a última mensagem do utilizador.
//                          ultimaAcao ou ultimaMensagem podem ser undefined (resposta 5).
//   linhaPulso(acoes, ultimaMensagem, agora) -> string   a linha do pulso que o mod mostra; acoes = ms das ações do orquestrador
//                          (lista, pode ser vazia); ultimaMensagem pode ser undefined. Resposta 5: sem ação ou sem mensagem,
//                          15 barras vazias (o «·» da referência) e «sem atividade».
//   portas(saida, plataforma) -> number[]   as portas em escuta na saída literal; plataforma = process.platform ('win32' | 'darwin' | 'linux')
//   texto(modelo, largura) -> string        o painel em texto simples (resposta 4), a partir do modelo que dados() devolve
//   modulo              -> string           caminho absoluto do módulo de hooks do mod (o que o hooks.json do plugin lista)
//   modulos             -> string[]         caminhos absolutos de TODOS os ficheiros de código do mod (hooks, dados, portas, ...)
// As respostas do orquestrador às PERGUNTAS da Ronda −1 (comentário de 2026-10-29 na #12) fazem parte do contrato e estão
// citadas como «resposta N».
import { after } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, lstatSync, readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PONTE = join(ROOT, 'tests/ponte/f-11.mjs');
export const BASE = '4d437e8';

const temps = [];
export const tmp = (prefix = 'critico-f11-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f11-home-');
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
export const FAKE_HOME = fake;
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

let ponte;
export const api = async () => {
  if (!existsSync(PONTE)) throw new Error('ponte em falta: tests/ponte/f-11.mjs (o dev escreve-a na Ronda 0; ver o topo de helpers.mjs)');
  ponte ??= await import(pathToFileURL(PONTE).href);
  return ponte;
};
export const leitor = () => import(pathToFileURL(join(ROOT, 'scripts/painel-leitor.mjs')).href);

export const MIN = 60000;
export const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);
export const ESTADOS = ['main', 'aprovado', 'critico', 'dev', 'reprovado', 'espera', 'falta'];
export const PAPEIS = ['dev', 'critico', 'tester', 'outro'];

// Gerador determinístico (mulberry32): toda a propriedade imprime a semente
export const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
export const txt = (obj) => JSON.stringify(obj, null, 2) + '\n';

// Caminho comparável: absoluto, separador /, sem maiúsculas no Windows (que não as distingue)
export const norm = (p) => { const r = resolve(p).replace(/\\/g, '/'); return process.platform === 'win32' ? r.toLowerCase() : r; };

const FORGE_JSON = { language: 'Português', langTag: 'pt-PT', plainStyle: true, models: {} };

// Projeto temporário. painel: objeto, texto literal, ou null (sem painel.json). checkpoints: { ficheiro: minutos atrás }
// (negativo = no futuro). semCheckpoints: sem a pasta .checkpoints. forge: com .claude/forge.json. nome: pasta (espaços, acentos)
export const projeto = ({ painel = null, checkpoints = {}, semCheckpoints = false, forge = true, nome = 'Projeto Coração ñ' } = {}) => {
  const raiz = join(tmp(), nome);
  mkdirSync(raiz, { recursive: true });
  if (forge) { mkdirSync(join(raiz, '.claude'), { recursive: true }); writeFileSync(join(raiz, '.claude/forge.json'), JSON.stringify(FORGE_JSON, null, 2) + '\n'); }
  const dir = join(raiz, '.checkpoints');
  const file = join(dir, 'painel.json');
  if (!semCheckpoints) {
    mkdirSync(dir, { recursive: true });
    if (painel !== null) writeFileSync(file, typeof painel === 'string' ? painel : txt(painel));
    for (const [f, min] of Object.entries(checkpoints)) {
      const c = join(dir, f);
      writeFileSync(c, '# checkpoint\n');
      const t = (AGORA - min * MIN) / 1000;
      utimesSync(c, t, t);
    }
  }
  return { raiz, dir, file };
};

// O oráculo do critério 3: o leitor partilhado do F-10 sobre o mesmo texto e os mtimes reais da pasta .checkpoints
export const esperado = async ({ dir, file }, agora = AGORA) => {
  const { ler } = await leitor();
  const texto = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  const mtimes = existsSync(dir) ? Object.fromEntries(readdirSync(dir).map((n) => [n, statSync(join(dir, n)).mtimeMs])) : {};
  return ler(texto, mtimes, agora);
};

// O que o mod mostra, reduzido aos campos do modelo esperado (campos a mais no mod são aceites, também em cada agente)
export const projetar = (modelo, exp) => {
  if (modelo === null || typeof modelo !== 'object') return modelo;
  const out = {};
  for (const k of Object.keys(exp)) {
    if (k === 'agentes' && Array.isArray(modelo.agentes)) out.agentes = modelo.agentes.map((a, i) => (exp.agentes[i] && a && typeof a === 'object' ? Object.fromEntries(Object.keys(exp.agentes[i]).map((c) => [c, a[c]])) : a));
    else out[k] = modelo[k];
  }
  return out;
};

// Runtime falso do motor (a forma de `$` vem dos tipos do Claude Code: fs, session, clock, process, ui, command, plugin).
// O fs é verdadeiro sobre a pasta temporária e regista cada chamada; um caminho relativo resolve-se contra `cwd`.
// fs.write grava (é tudo tmp) e fica registado. process.run NUNCA executa nada: devolve `saidas[argv[0]]` ou vazio.
// Um substantivo ou método que o runtime não conhece resolve undefined e fica em `log.desconhecidos`.
export const runtime = ({ raiz, cwd = raiz, agora = AGORA, saidas = {} } = {}) => {
  const log = { fs: [], escritas: [], processos: [], abertos: [], comandos: [], timers: [], sessao: [], desconhecidos: [] };
  const abs = (p) => (isAbsolute(String(p)) ? String(p) : join(cwd, String(p ?? '.')));
  const kind = (s) => (s.isFile() ? 'file' : s.isDirectory() ? 'dir' : 'other');
  const conhecido = {
    fs: {
      read: async (p, o) => { log.fs.push(['read', abs(p)]); const b = readFileSync(abs(p)); return o?.as === 'bytes' ? { base64: b.toString('base64') } : b.toString('utf8'); },
      write: async (p, text) => { log.escritas.push(abs(p)); mkdirSync(resolve(abs(p), '..'), { recursive: true }); writeFileSync(abs(p), String(text)); },
      list: async (p) => {
        const d = abs(p ?? '.');
        log.fs.push(['list', d]);
        return readdirSync(d).map((name) => { const s = lstatSync(join(d, name)); return { name, kind: s.isSymbolicLink() ? 'other' : kind(s), size: s.isFile() ? s.size : 0, mtimeMs: s.isFile() ? s.mtimeMs : 0, isLink: s.isSymbolicLink() }; });
      },
      exists: async (p) => { log.fs.push(['exists', abs(p)]); return existsSync(abs(p)); },
      stat: async (p, o) => { log.fs.push(['stat', abs(p)]); const s = statSync(abs(p)); return { kind: kind(s), size: s.size, mtimeMs: s.mtimeMs, isLink: lstatSync(abs(p)).isSymbolicLink(), ...(o?.resolve && { realPath: resolve(abs(p)) }) }; },
    },
    session: {
      root: async () => { log.sessao.push('root'); return raiz; },
      cwd: async () => { log.sessao.push('cwd'); return cwd; },
      id: async () => 'sessao-falsa',
      model: async () => 'claude-opus-5-5',
      turns: async () => 0,
      messages: async () => { log.sessao.push('messages'); return []; },
    },
    agent: { list: async () => { log.sessao.push('agent.list'); return []; } },
    clock: {
      now: async () => agora,
      every: (ms) => { log.timers.push(['every', ms]); return () => {}; },
      after: (ms) => { log.timers.push(['after', ms]); return () => {}; },
    },
    process: {
      run: async (argv, init) => { log.processos.push([...argv]); const o = saidas[argv[0]]; return { exitCode: o === undefined ? 1 : 0, stdout: o ?? '', stderr: '', ...(init && {}) }; },
    },
    ui: {
      open: async (o) => { log.abertos.push(o); return { isPlaced: true }; },
      status: () => {}, toast: () => {}, log: () => {},
    },
    command: { register: async (c) => { log.comandos.push(c); } },
    plugin: { root: ROOT, name: 'forge' },
  };
  const desconhecido = (noun) => new Proxy({}, { get: (_, m) => (typeof m === 'symbol' || m === 'then' ? undefined : async () => { log.desconhecidos.push(`${noun}.${m}`); return undefined; }) });
  const embrulha = (noun, o) => new Proxy(o, { get: (t, m) => (typeof m === 'symbol' || m in t || m === 'then' ? t[m] : (log.desconhecidos.push(`${noun}.${String(m)}`), async () => undefined)) });
  const $ = new Proxy({}, { get: (_, k) => (typeof k === 'symbol' || k === 'then' ? undefined : k in conhecido ? (k === 'plugin' ? conhecido.plugin : embrulha(k, conhecido[k])) : desconhecido(k)) });
  return { $, log };
};

// Corpus do critério 3 (as fixtures do F-10 que a spec nomeia, mais os casos de limite pedidos à Ronda −1)
const ag = (nome, papel, ticket, modelo, checkpoint, porta) => ({ nome, papel, ticket, modelo, checkpoint, ...(porta !== undefined && { porta }) });
const base = () => ({
  versao: 1, projeto: 'Projeto Exemplo', objetivo: 'Fechar o lote 1', modo: 'rigoroso',
  tickets: [
    { id: 'T-01', issue: 11, titulo: 'Primeiro', estado: 'main', rondas: 2 },
    { id: 'T-02', issue: 12, titulo: 'Segundo', estado: 'aprovado', rondas: 1 },
    { id: 'T-03', issue: 13, titulo: 'Terceiro', estado: 'critico', rondas: 1 },
    { id: 'T-04', issue: 14, titulo: 'Quarto', estado: 'falta', rondas: 0 },
  ],
  agentes: [ag('dev-t03', 'dev', 'T-03', 'sonnet', 'dev-t03.md', 4801), ag('critico-t03', 'critico', 'T-03', 'opus', 'critico-t03.md')],
});
// n agentes com semente fixa: papel, modelo e idade do checkpoint (ou sem ficheiro) sorteados
export const comAgentes = (n, seed) => {
  const r = rng(seed), o = base(), checkpoints = {};
  o.agentes = Array.from({ length: n }, (_, i) => {
    const f = `agente-${i}.md`, idade = pick(r, [null, 0, 5, 9, 10, 29, 30, 45, 90, -3]);
    if (idade !== null) checkpoints[f] = idade;
    return ag(`agente-${i}`, pick(r, PAPEIS), pick(r, ['T-01', 'T-02', 'T-03']), pick(r, ['opus', 'sonnet', 'haiku', 'claude-opus-5-5']), f, r() < 0.3 ? 4000 + i : undefined);
  });
  return { painel: o, checkpoints };
};
const LONGO = 'desenvolvedor-coração-ação-pão-ñandú-über-'.repeat(3);
export const CORPUS = () => {
  const b = base();
  return {
    vazio: { painel: { versao: 1, modo: 'acelerado', tickets: [], agentes: [] } },
    completo: { painel: b, checkpoints: { 'dev-t03.md': 3, 'critico-t03.md': 0 } },
    'agente sem sinal e parado?': { painel: b, checkpoints: { 'dev-t03.md': 12, 'critico-t03.md': 45 } },
    'limiares 10 e 30 min': { painel: b, checkpoints: { 'dev-t03.md': 10, 'critico-t03.md': 30 } },
    'checkpoint no futuro': { painel: b, checkpoints: { 'dev-t03.md': -5 } },
    'tickets em todos os estados': { painel: { ...b, tickets: ESTADOS.flatMap((e, i) => Array.from({ length: i + 1 }, (_, j) => ({ id: `${e}-${j}`, issue: 100 + i * 10 + j, titulo: e, estado: e, rondas: j }))) } },
    'campo inválido': { painel: { ...b, tickets: [{ ...b.tickets[0], estado: 'feito' }] } },
    'JSON truncado': { painel: txt(b).slice(0, 120) },
    'texto vazio': { painel: '' },
    'com BOM': { painel: '﻿' + txt(b), checkpoints: { 'dev-t03.md': 1 } },
    'campos a mais': { painel: { ...b, extra: [1], agentes: [{ ...b.agentes[0], titulo: 'x' }] }, checkpoints: { 'dev-t03.md': 2 } },
    'painel ausente': { painel: null },
    'sem .checkpoints': { painel: null, semCheckpoints: true },
    '0 agentes': comAgentes(0, 11),
    '1 agente': comAgentes(1, 12),
    '9 agentes': comAgentes(9, 13),
    '30 agentes': comAgentes(30, 14),
    'nomes longos e acentos': {
      painel: { ...b, projeto: 'Coração da Floresta — ünïcødé 🚀 '.repeat(4), objetivo: 'Pôr o painel a mostrar ação, coração e pão: '.repeat(8),
        tickets: [{ id: 'F-11-ÁÉÍÓÚ-çãõ', issue: 12, titulo: 'Título muito longo com acentuação: '.repeat(6), estado: 'dev', rondas: 0 }],
        agentes: [ag(LONGO, 'dev', 'F-11-ÁÉÍÓÚ-çãõ', 'claude-opus-5-5[1m]', 'desenvolvedor-ação.md', 65535), ag('crítico-ñ', 'critico', 'F-11-ÁÉÍÓÚ-çãõ', 'opus', 'crítico-ñ.md')] },
      checkpoints: { 'desenvolvedor-ação.md': 11, 'crítico-ñ.md': 31 },
    },
  };
};

export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((n) => walk(join(abs, n))));
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const buildProject = async (answers, dest) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  await scaffold(answers, { dest });
  return dest;
};
export const corpusAnswers = () => {
  const dir = join(ROOT, 'scripts/corpus/answers');
  return readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => ({ name: n, value: JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^﻿/, '')) }));
};
