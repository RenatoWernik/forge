// Ronda −1 do F-21a (#73): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem corre o graphify: HOME, USERPROFILE, CLAUDE_CONFIG_DIR, LOCALAPPDATA, APPDATA e XDG_* vão para pastas temporárias
// (caixa e ambiente do F-20a), DISABLE_AUTOUPDATER=1, e o espião (espiao.mjs) responde pelo graphify. O PATH dos processos lançados só tem a pasta
// do binário falso e a do git (o git corre de verdade, num repositório temporário). Sem rede.
//
// LEITURA DO CONTRATO (corpo da #73, sem comentários à data, 2026-10-31): os textos abaixo são LITERAIS, copiados do corpo da issue.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, generate, loadScaffold } from '../f-01-r0/helpers.mjs';
import { caixa, ambiente } from '../f-20a-r0/helpers.mjs';

export { ROOT, generate, loadScaffold, caixa };
export const BASE = '645120f'; // a main antes do F-21a (com o F-20a)
export const GRAPH = join(ROOT, 'templates/.claude/graph.mjs');
const ESPIAO = fileURLToPath(new URL('./espiao.mjs', import.meta.url));

// C1
export const UPDATED = (c) => `graph: updated at ${c}`;
export const NO_COMMIT = 'no commit';
export const NOTHING = 'graph: nothing to index yet';
export const NOT_FOUND = 'graph: graphify not found';
// a saída real da 0.9.97 numa pasta vazia (corpo da issue)
export const VAZIA_1 = 'Nothing to update or rebuild failed — check output above.';
export const VAZIA_2 = '[graphify watch] No code files found - nothing to rebuild.';
// C2
export const UNCHANGED = 'docs: unchanged';
export const CHANGED = /^docs: changed (\d+) files, (\d+) words: (.+)$/;
export const MARKED = (n) => `docs: marked ${n} files`;
export const CARIMBO = 'graphify-out/forge-docs.json';
// C3
export const L_FRESCA = 'Graphify: graph.json built at HEAD';
export const L_HOOKS = 'Graphify: post-commit and post-checkout hooks installed';
export const D_MISSING = '(missing: run node .claude/graph.mjs update)';
export const D_NO_COMMIT = '(no commit yet)';
export const D_STALE = (x, sha) => `(stale: built at ${x}, HEAD is ${sha}; run node .claude/graph.mjs update)`;
export const D_UNREADABLE = '(unreadable)';
// C4
export const CMD_UPDATE = 'node .claude/graph.mjs update';
export const CMD_DOCS = 'node .claude/graph.mjs docs';

export const STACK = /^\s+at .+(:\d+:\d+\)?|\(node:[^)]*\))$/m;
export const tmp = (p = 'critico-f21a-') => mkdtempSync(join(tmpdir(), p));
export const apaga = (p) => { try { rmSync(p, { recursive: true, force: true }); } catch {} };
export const fwd = (p) => p.replace(/\\/g, '/');
export const palavras = (s) => (String(s).match(/\S+/g) ?? []).length;
export const escreve = (raiz, rel, conteudo) => { const f = join(raiz, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, conteudo); return f; };

// a pasta do git da máquina (o único binário real que os processos lançados veem)
const GIT_DIR = (() => {
  for (const d of String(process.env.PATH ?? '').split(delimiter).filter(Boolean)) for (const n of ['git.exe', 'git']) if (existsSync(join(d, n))) return d;
  throw new Error('critico: git não encontrado no PATH');
})();
const envDe = (sb, log, cenario) => {
  const e = ambiente(sb, { PATH: [sb.pathDir, GIT_DIR].join(delimiter), GIT_CONFIG_NOSYSTEM: '1', CRITICO_LOG: log, NODE_OPTIONS: '--import=' + pathToFileURL(ESPIAO).href });
  if (cenario) e.CRITICO_GRAPHIFY = JSON.stringify(cenario); else delete e.CRITICO_GRAPHIFY;
  return e;
};
const lança = (sb, cenario, argv, cwd) => {
  const log = join(sb.dir, 'critico-' + Math.random().toString(36).slice(2) + '.log');
  writeFileSync(log, '');
  // um graphify "instalado" no PATH quando o cenário existe (para quem procura o binário antes de o lançar); nunca no cenário ENOENT
  const bin = join(sb.pathDir, 'graphify.exe');
  if (cenario) writeFileSync(bin, '{"fakeGraphify":true}'); else rmSync(bin, { force: true });
  const r = spawnSync(process.execPath, argv, { cwd, env: envDe(sb, log, cenario), encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const chamadas = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, out, linhas: out.split(/\r?\n/).filter((l) => l.trim()), chamadas, graphify: chamadas.filter((c) => c.nome === 'graphify') };
};

// node .claude/graph.mjs <args> na raiz (ou noutra pasta, pelo caminho absoluto), com o espião e o cenário do graphify (null = ENOENT)
export const grafo = (raiz, sb, args, { cenario = null, cwd = raiz } = {}) =>
  lança(sb, cenario, [cwd === raiz ? '.claude/graph.mjs' : join(raiz, '.claude/graph.mjs'), ...args], cwd);

// node .claude/check.cjs [--env] no projeto, com o espião (graphify em ENOENT, git real)
export const checkCjs = (proj, sb, args = ['--env']) => lança(sb, null, ['.claude/check.cjs', ...args], proj);
export const checkEnv = (proj, sb) => checkCjs(proj, sb);
// a linha do check que começa (depois de «ok    » ou «FAIL  ») pelo prefixo dado
export const linhasCom = (r, prefixo) => r.out.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2})/.test(l) && l.slice(6).startsWith(prefixo));

// .claude/ de um projeto gerado (uma vez por processo), copiado para uma raiz nova e vazia a cada chamada
let gerado = null;
export const raizNova = async (lixo) => {
  if (!gerado) { gerado = await generate(); lixo.push(gerado); }
  const r = tmp('critico-f21a-raiz-');
  lixo.push(r);
  cpSync(join(gerado, '.claude'), join(r, '.claude'), { recursive: true });
  return r;
};

// git real no projeto, com a config isolada (HOME temporário, sem config de sistema)
export const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.critico-sem-hooks', ...a], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
  if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr);
  return r.stdout.trim();
};
// um projeto gerado com repositório git: commits = 0 (HEAD sem commit), 1 ou mais
export const repo = async (lixo, commits = 1) => {
  const p = await generate();
  lixo.push(p);
  git(p, 'init', '-q', '-b', 'main');
  for (let i = 0; i < commits; i++) { writeFileSync(join(p, `critico-${i}.txt`), String(i)); git(p, 'add', '-A'); git(p, 'commit', '-q', '-m', 'critico ' + i); }
  return p;
};
export const grafoJson = (proj, conteudo) => escreve(proj, 'graphify-out/graph.json', typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
export const grafoDe = (commit) => ({ directed: false, multigraph: false, graph: {}, nodes: [{ id: 'critico', label: 'critico' }], links: [], built_at_commit: commit });