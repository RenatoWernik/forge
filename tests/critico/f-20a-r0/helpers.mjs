// Ronda −1 do F-20a (#70): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE, CLAUDE_CONFIG_DIR, LOCALAPPDATA, APPDATA, XDG_CONFIG_HOME e XDG_DATA_HOME vão para pastas
// temporárias, AI_MEMORY_BIN só existe quando o teste o põe, e nenhum ai-memory real corre: o espião (espiao.mjs) responde pelos binários falsos.
// Rede só para 127.0.0.1, num servidor HTTP falso com porta escolhida em runtime (nunca 4790, 49374 nem 49375). AI_MEMORY_URL aponta por omissão
// para uma porta fechada, para que nem a base (que ainda a lê, e cai na 49374) toque num servidor real.
//
// LEITURA DO CONTRATO (corpo da #70, sem comentários à data, 2026-10-31): os textos abaixo são LITERAIS, copiados do corpo da issue.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, generate, ANSWERS, loadScaffold } from '../f-01-r0/helpers.mjs';

export { ROOT, generate, ANSWERS, loadScaffold };
export const BASE = '101a181'; // a main antes do F-20a
export const MODULO = join(ROOT, 'templates/.claude/ai-memory.cjs');
const ESPIAO = fileURLToPath(new URL('./espiao.mjs', import.meta.url));

// C1
export const FAIL_BIN = 'FAIL  ai-memory: binary not found (looked in: AI_MEMORY_BIN, PATH, %LOCALAPPDATA%/ai-memory/ai-memory.exe, ~/Applications/ai-memory/ai-memory, ~/.local/bin/ai-memory)';
// C2
export const PREFIXO_SRV = (url) => `ai-memory: server answers at ${url} and is this project's`;
export const D_OFF = '(off: nothing answers; start it with node .claude/start-ai-memory.mjs)';
export const D_OUTRO = (url, x, y) => `(port conflict: the server at ${url} reports the data dir ${x}, not this project's ${y})`;
export const D_SEM_DIR = (url) => `(port conflict: the server at ${url} answers but did not report its data dir)`;
export const D_SEM_FORGE = '(not set up: .ai-memory.toml has no [forge] server_url and data_dir)';
export const D_SEM_BIN = '(no binary)';
// C3: os nomes das duas linhas não mudam
export const L_CAPTURA = 'ai-memory: .ai-memory.toml admits capture in this project';
export const L_PAGINA = 'ai-memory: page _rules/framework.md seeded';
// C4
export const D_MODULO = '(.claude/ai-memory.cjs missing)';

export const PROIBIDAS = [4790, 49374, 49375];
export const STACK = /^\s+at .+(:\d+:\d+\)?|\(node:[^)]*\))$/m;
export const tmp = (p = 'critico-f20a-') => mkdtempSync(join(tmpdir(), p));
export const fwd = (p) => p.replace(/\\/g, '/');

// O módulo do contrato, carregado de novo a cada chamada (o require lança enquanto o ficheiro não existir)
export const carregaModulo = () => {
  const req = createRequire(MODULO);
  delete req.cache[req.resolve(MODULO)];
  return req(MODULO);
};

// Caixa de areia de um cenário: pastas pessoais e de dados temporárias, e um PATH vazio (ou o que o cenário der)
export const caixa = () => {
  const d = tmp('critico-f20a-cx-');
  const sb = { dir: d, home: join(d, 'home'), local: join(d, 'localappdata'), pathDir: join(d, 'pathbin'), dataDir: fwd(join(d, 'aim-data')) };
  for (const p of [sb.home, sb.local, sb.pathDir, join(d, 'appdata'), join(d, 'xdgc'), join(d, 'xdgd')]) mkdirSync(p, { recursive: true });
  return sb;
};
const LIMPAR = ['PATH', 'HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR', 'LOCALAPPDATA', 'APPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'AI_MEMORY_BIN', 'AI_MEMORY_URL', 'AI_MEMORY_SERVER_URL', 'NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'CRITICO_LOG', 'TEMP', 'TMP'];
export const ambiente = (sb, extra = {}) => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!LIMPAR.includes(k.toUpperCase())) env[k] = v;
  Object.assign(env, {
    PATH: '', HOME: sb.home, USERPROFILE: sb.home, CLAUDE_CONFIG_DIR: join(sb.dir, 'cfg'), LOCALAPPDATA: sb.local, APPDATA: join(sb.dir, 'appdata'),
    XDG_CONFIG_HOME: join(sb.dir, 'xdgc'), XDG_DATA_HOME: join(sb.dir, 'xdgd'), TEMP: sb.dir, TMP: sb.dir, DISABLE_AUTOUPDATER: '1', AI_MEMORY_URL: 'http://127.0.0.1:9',
  });
  for (const [k, v] of Object.entries(extra)) { if (v === undefined) delete env[k]; else env[k] = v; }
  return env;
};

// Um binário falso: um ficheiro JSON que o espião lê. spec = { version, status: { code, out }, hook: { code, out }, readPage: { code, out } }
export const binFalso = (file, spec) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ fakeAim: true, ...spec })); return file; };
export const statusOut = (dataDir) => ({ code: 0, out: JSON.stringify({ data_dir: dataDir }) });
export const AIM_OK = (version, dataDir) => ({ version: 'ai-memory ' + version, status: statusOut(dataDir), hook: { code: 0, out: '{"admits_capture":true}' }, readPage: { code: 0, out: '# framework' } });

// .ai-memory.toml do projeto gerado, com ou sem a tabela [forge] que o F-20b escreve
const TOML_ORIGINAL = new Map();
export const toml = (proj, forge) => {
  const f = join(proj, '.ai-memory.toml');
  if (!TOML_ORIGINAL.has(proj)) TOML_ORIGINAL.set(proj, readFileSync(f, 'utf8'));
  const base = TOML_ORIGINAL.get(proj);
  writeFileSync(f, forge ? base.replace(/\s*$/, '\n') + `\n[forge]\nserver_url = "${forge.serverUrl}"\ndata_dir = "${forge.dataDir}"\nautostart = false\n` : base);
};
export const memoria = (proj) => { const t = readFileSync(join(proj, '.ai-memory.toml'), 'utf8'); const g = (k) => (t.match(new RegExp('^' + k + '\\s*=\\s*"([^"]+)"', 'm')) || [])[1]; return { workspace: g('workspace'), project: g('project') }; };

// node .claude/check.cjs [--env] no projeto, com o espião pré-carregado (por omissão) e o registo das chamadas
export const corre = async (proj, env, { espiao = true, args = ['--env'] } = {}) => {
  const log = join(env.TEMP ?? tmp(), 'critico-' + Math.random().toString(36).slice(2) + '.log');
  writeFileSync(log, '');
  const e = { ...env, CRITICO_LOG: log };
  if (espiao) e.NODE_OPTIONS = '--import=' + pathToFileURL(ESPIAO).href;
  // assíncrono: o servidor falso vive neste processo e tem de responder enquanto o check corre
  const r = await new Promise((res) => {
    const c = spawn(process.execPath, ['.claude/check.cjs', ...args], { cwd: proj, env: e, timeout: 240000 });
    let o = '';
    c.stdout.on('data', (b) => { o += b; });
    c.stderr.on('data', (b) => { o += b; });
    c.on('close', (status) => res({ status, out: o }));
  });
  const out = r.out;
  const chamadas = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, out, linhas: out.split(/\r?\n/), chamadas };
};
// a linha do check que começa (depois de «ok    » ou «FAIL  ») pelo prefixo dado
export const linha = (r, prefixo) => r.linhas.filter((l) => /^(ok {4}|FAIL {2})/.test(l) && l.slice(6).startsWith(prefixo));
export const linhasAim = (r) => r.linhas.filter((l) => /^(ok {4}|FAIL {2}|info {2})ai-memory:/.test(l));
export const ehVersao = (c) => c.args.length === 1 && c.args[0] === '--version';
export const spawnsAim = (r) => r.chamadas.filter((c) => !ehVersao(c) && (c.fake || /ai-memory/i.test(c.cmd)));

// Servidor HTTP falso em 127.0.0.1, porta escolhida em runtime; regista os pedidos
export const servidor = async () => {
  for (;;) {
    const pedidos = [];
    const s = createServer((req, res) => { pedidos.push(req.method + ' ' + req.url); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const port = s.address().port;
    if (PROIBIDAS.includes(port)) { await new Promise((r) => s.close(r)); continue; }
    return { url: 'http://127.0.0.1:' + port, pedidos, fecha: () => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }) };
  }
};
export const portaFechada = async () => { const s = await servidor(); await s.fecha(); return s.url; };

// Um projeto gerado (inglês, respostas do F-01), partilhado pelos testes de um ficheiro
export const projeto = async () => generate();
export const apaga = (p) => { try { rmSync(p, { recursive: true, force: true }); } catch {} };