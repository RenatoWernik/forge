// Ronda −1 do F-10 (#11): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import,
// e todas as pastas temporárias criadas aqui são apagadas no `after` do ficheiro de teste que as criou.
//
// PONTE (PERGUNTA 1 da Ronda −1). O contrato deixa livres os nomes das funções do leitor e os subcomandos do utilitário.
// Para os ataques não fixarem nomes, o dev escreve na Ronda 0 a ponte `tests/ponte/f-10.mjs`, que só importa do pacote e
// adapta a forma. Sem ciclos, sem condições, sem fs, sem JSON.parse e sem relógio (o c0-ponte.test.mjs verifica). Exporta:
//   validar(obj)            -> string[]   mensagens de erro do validador do pacote; [] = válido. O objeto já vem analisado.
//   ler(texto, mtimes, agora) -> modelo   o leitor do pacote, tal e qual: texto do painel.json, { <checkpoint>: mtime em ms }, agora em ms
//   contagens(modelo)       -> [estado, n][]  as contagens por estado, na ordem em que o modelo as tem
//   percentagem(modelo)     -> number     a percentagem feita, de 0 a 100
//   objetivo(modelo)        -> string
//   agentes(modelo)         -> { nome, vida, minutos }[]  vida em 'a começar' | 'ativo' | 'sem sinal' | 'parado?'; minutos number | null
//   utilitario              -> string     caminho absoluto do script da linha de comando (corre com `node <utilitario> ...args`)
//   argsTicket(ficheiro, { id, issue, titulo, estado, rondas })                       -> string[]  define (cria ou substitui) o ticket `id`
//   argsAgente(ficheiro, { nome, papel, ticket, modelo, checkpoint, porta? })          -> string[]  define (cria ou substitui) o agente `nome`
//   argsRemoverAgente(ficheiro, nome) -> string[]
//   argsObjetivo(ficheiro, texto)     -> string[]
//   leitorFonte             -> string     caminho absoluto da fonte única do leitor no pacote
//   leitorNoProjeto         -> string     caminho relativo da cópia do leitor no projeto gerado
//   erro(modelo)            -> string | undefined   a mensagem do modelo de erro (resposta 15); undefined num painel válido
//   bloqueio(ficheiro)      -> string     caminho do .lock que o utilitário cria em exclusivo para esse painel.json (resposta 13)
// As respostas do orquestrador às PERGUNTAS da Ronda −1 (comentário de 2026-10-29 na #11) fazem parte do contrato e estão citadas como «resposta N».
import { after } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PONTE = join(ROOT, 'tests/ponte/f-10.mjs');
export const BASE = 'd8572ed';

const temps = [];
export const tmp = (prefix = 'critico-f10-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f10-home-');
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
  if (!existsSync(PONTE)) throw new Error('ponte em falta: tests/ponte/f-10.mjs (o dev escreve-a na Ronda 0; ver o topo de helpers.mjs)');
  ponte ??= await import(pathToFileURL(PONTE).href);
  return ponte;
};

export const ESTADOS = ['falta', 'espera', 'dev', 'critico', 'reprovado', 'aprovado', 'main'];
// Ordem das contagens (resposta 2 do orquestrador na #11): a da Guilda, sempre com os 7 estados, incluindo os de zero
export const ORDEM = ['main', 'aprovado', 'critico', 'dev', 'reprovado', 'espera', 'falta'];
export const MODOS = ['acelerado', 'rigoroso'];
export const PAPEIS = ['dev', 'critico', 'tester', 'outro'];
export const MIN = 60000;
export const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);

// Painel válido de base: todos os campos do esquema v1; um agente com porta e outro sem; um checkpoint que não existe
export const base = () => ({
  versao: 1,
  projeto: 'Projeto Exemplo',
  objetivo: 'Fechar o lote 1',
  modo: 'rigoroso',
  tickets: [
    { id: 'T-01', issue: 11, titulo: 'Primeiro', estado: 'main', rondas: 2 },
    { id: 'T-02', issue: 12, titulo: 'Segundo', estado: 'aprovado', rondas: 1 },
    { id: 'T-03', issue: 13, titulo: 'Terceiro', estado: 'critico', rondas: 1 },
    { id: 'T-04', issue: 14, titulo: 'Quarto', estado: 'falta', rondas: 0 },
  ],
  agentes: [
    { nome: 'dev-t03', papel: 'dev', ticket: 'T-03', modelo: 'sonnet', checkpoint: 'desenvolvedor-t03.md', porta: 4801 },
    { nome: 'critico-t03', papel: 'critico', ticket: 'T-03', modelo: 'opus', checkpoint: 'critico-t03.md' },
  ],
});
export const txt = (obj) => JSON.stringify(obj, null, 2) + '\n';

// Gerador determinístico (mulberry32): toda a propriedade imprime a semente
export const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

// Utilitário da linha de comando: sempre com HOME falso e cwd na pasta temporária do teste
export const runUtil = (u, args, cwd) => {
  const r = spawnSync(process.execPath, [u.utilitario, ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 60000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), err: r.stderr || '' };
};
export const runUtilAsync = (u, args, cwd) => new Promise((res) => {
  const c = spawn(process.execPath, [u.utilitario, ...args], { cwd, env: sandboxEnv(), stdio: 'ignore' });
  c.on('exit', (code) => res(code));
});

// Pasta de projeto temporária com .checkpoints/painel.json; `nome` permite espaços e acentos no caminho
export const painelTmp = (obj = base(), nome = 'proj') => {
  const dir = join(tmp(), nome, '.checkpoints');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'painel.json');
  if (obj !== null) writeFileSync(file, typeof obj === 'string' ? obj : txt(obj));
  return { dir, file, proj: join(dir, '..') };
};
export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((n) => walk(join(abs, n))));
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

export const buildProject = async (answers, dest) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  await scaffold(answers, { dest });
  return dest;
};
export const corpusAnswers = () => {
  const dir = join(ROOT, 'scripts/corpus/answers');
  return readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => ({ name: n, value: JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^\uFEFF/, '')) }));
};
