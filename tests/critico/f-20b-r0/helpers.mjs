// Ronda −1 do F-20b (#71): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem num ai-memory real: o `sys` de scripts/memoria.mjs é falso (run, spawn, fetch e freePort registam tudo), as pastas
// pessoais (HOME, CLAUDE_CONFIG_DIR, LOCALAPPDATA, XDG_DATA_HOME) são temporárias, e a rede só vai a 127.0.0.1, a servidores HTTP falsos deste processo
// em portas escolhidas em runtime (nunca 4790, 49374 nem 49375).
//
// LEITURA DO CONTRATO (#71 com os comentários 6546794885 e 6548062958 do orquestrador, vinculativos):
// - o MCP vai para o `.mcp.json` da raiz; os hooks e `enabledMcpjsonServers: ["ai-memory"]` para o `.claude/settings.local.json`;
// - a `[forge]` (server_url, data_dir) vai para o `.ai-memory.local.toml`; o `.ai-memory.toml` versionado fica só com workspace e project;
// - os três ficam no `.gitignore`; nada vai para o `.claude/settings.json` versionado nem para os globais; o readConfig lê os dois toml e o local prevalece.
// Seam (como o de update.mjs): `main(argv, sys, write)` exportado por scripts/memoria.mjs devolve o código de saída e escreve por `write`.
//   sys.run(cmd, args, opts)   -> { code, stdout, stderr } (o falso também é a própria string do stdout, como no F-20a)
//   sys.spawn(cmd, args, opts) -> um filho com unref()
//   sys.fs                     -> o módulo node:fs
//   sys.fetch(url, opts)       -> o fetch global, só para 127.0.0.1
//   sys.freePort()             -> uma porta (o falso devolve um Number que também se pode aguardar)
import * as fsMod from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, generate, ANSWERS } from '../f-01-r0/helpers.mjs';

export { ROOT, generate, ANSWERS };
export const BASE = '645120f'; // a main com o F-20a integrado
export const MEMORIA = join(ROOT, 'scripts/memoria.mjs');
export const MODULO = join(ROOT, 'templates/.claude/ai-memory.cjs');
export const PROIBIDAS = [4790, 49374, 49375];
export const W = 'acme', P = 'billing', NOME = 'acme--billing';
export const CANARIO_1 = 'CANARIO-F20B-FICHEIRO-7f3a9c0d2e'; // em <dataDir>/auth-tokens/default
export const CANARIO_2 = 'CANARIO-F20B-AMBIENTE-1b8e44a6f1'; // em AI_MEMORY_AUTH_TOKEN
export const LOCAL = '.claude/settings.local.json';
export const MCP = '.mcp.json';
export const TOML_LOCAL = '.ai-memory.local.toml';
export const IGNORADOS = [LOCAL, MCP, TOML_LOCAL]; // o que o setup garante no .gitignore
export const ignorado = (gi, rel) => gi.split(/\r?\n/).some((l) => l.trim() === rel || l.trim() === '/' + rel);
export const VERSAO = '3.3.0';
// os 9 pares do C2 (saída de `install-hooks --agent claude-code` da 3.3.0, sem o token)
export const PARES = [['SessionStart', 'session-start'], ['UserPromptSubmit', 'user-prompt-submit'], ['PreToolUse', 'pre-tool-use'], ['PostToolUse', 'post-tool-use'],
  ['PreCompact', 'pre-compact'], ['Stop', 'stop'], ['SessionEnd', 'session-end'], ['SubagentStart', 'subagent-start'], ['SubagentStop', 'subagent-stop']];
export const HOOK_FORGE = { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/forge-ai-memory.mjs'], timeout: 10 };

export const fwd = (p) => String(p).replace(/\\/g, '/');
export const tmp = (p = 'critico-f20b-') => mkdtempSync(join(tmpdir(), p));
export const apaga = (p) => { try { rmSync(p, { recursive: true, force: true }); } catch {} };
// compara caminhos com / e, como o Windows, sem caixa
export const mesmoCaminho = (a, b) => fwd(a).replace(/\/$/, '').toLowerCase() === fwd(b).replace(/\/$/, '').toLowerCase();
// normaliza as barras de todas as strings de um valor JSON (para comparar caminhos sem impor \ ou /)
export const barras = (v) => (typeof v === 'string' ? fwd(v) : Array.isArray(v) ? v.map(barras) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, barras(x)])) : v);

// Caixa de areia de um cenário: pastas pessoais e de dados temporárias
export const caixa = () => {
  const d = tmp('critico-f20b-cx-');
  const sb = { dir: d, home: join(d, 'home'), local: join(d, 'localappdata'), xdg: join(d, 'xdgd'), cfg: join(d, 'cfg'), bin: fwd(join(d, 'bin', 'ai-memory.exe')) };
  for (const p of [sb.home, sb.local, sb.xdg, sb.cfg, dirname(sb.bin)]) mkdirSync(p, { recursive: true });
  writeFileSync(sb.bin, 'fake ai-memory\n');
  // settings globais que existem e nunca podem mudar
  mkdirSync(join(sb.home, '.claude'), { recursive: true });
  writeFileSync(join(sb.home, '.claude.json'), '{"projects":{}}\n');
  writeFileSync(join(sb.home, '.claude', 'settings.json'), '{"hooks":{}}\n');
  writeFileSync(join(sb.cfg, 'settings.json'), '{"hooks":{}}\n');
  return sb;
};
// o data-dir esperado em win32 para a caixa
export const dataDirWin = (sb) => fwd(join(sb.local, 'forge', 'ai-memory', NOME));

// Instantâneo: caminho relativo -> sha256 de cada ficheiro, por raiz
export const instantaneo = (raizes) => {
  const o = {};
  const anda = (raiz, abs) => {
    let es = [];
    try { es = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const f = join(abs, e.name);
      if (e.isDirectory()) anda(raiz, f);
      else o[raiz + '|' + fwd(relative(raiz, f))] = createHash('sha256').update(readFileSync(f)).digest('hex');
    }
  };
  for (const r of raizes) anda(r, r);
  return o;
};
export const ficheiros = (raiz) => Object.keys(instantaneo([raiz])).map((k) => k.slice(raiz.length + 1));

// Porta livre de verdade em 127.0.0.1, fora das proibidas
export const portaLivre = async () => {
  for (;;) {
    const s = createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const p = s.address().port;
    await new Promise((r) => s.close(r));
    if (!PROIBIDAS.includes(p)) return p;
  }
};
// Servidor falso do ai-memory numa porta (0 = escolhida em runtime); responde 200 a tudo e regista os pedidos
export const servidorFalso = async (port = 0, dataDir = null) => {
  for (;;) {
    const pedidos = [];
    const s = createServer((req, res) => { pedidos.push(req.method + ' ' + req.url); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
    await new Promise((r, j) => { s.once('error', j); s.listen(port, '127.0.0.1', r); });
    const p = s.address().port;
    if (port === 0 && PROIBIDAS.includes(p)) { await new Promise((r) => s.close(r)); continue; }
    return { port: p, url: 'http://127.0.0.1:' + p, dataDir, pedidos, fecha: () => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }) };
  }
};

// Resultado polimórfico de run (como o runFalso do F-20a)
const res = (code, out = '', err = '') => Object.assign(new String(out), { code, status: code, exitCode: code, ok: code === 0, stdout: out, stderr: err, output: [null, out, err], signal: null, error: undefined });
const depois = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? String(args[i + 1]) : null; };
export const CONFIG_INICIAL = (port = 49374) => `# ai-memory config (fake init)\n# env override: AI_MEMORY_BIND=0.0.0.0:${port}\nserver_url = "http://127.0.0.1:${port}"\nbind = "127.0.0.1:${port}"\n\n[auth]\nmode = "token"\n`;

// O sys falso. o.bins: caminhos aceites como ai-memory (por omissão o da caixa); o.portas: o que freePort devolve primeiro;
// o.sobe: o spawn do `serve` levanta o servidor falso (por omissão true)
export const sysFalso = (sb, o = {}) => {
  const regs = { run: [], spawn: [], fetch: [], freePort: 0, unref: 0 };
  const servidores = new Map(); // url -> servidor falso levantado pelo spawn
  const bins = (o.bins ?? [sb.bin]).map((b) => fwd(b).toLowerCase());
  const ehBin = (cmd) => bins.includes(fwd(cmd).toLowerCase());
  const filaPortas = [...(o.portas ?? [])];
  const env = { HOME: sb.home, USERPROFILE: sb.home, LOCALAPPDATA: sb.local, XDG_DATA_HOME: sb.xdg, CLAUDE_CONFIG_DIR: sb.cfg, PATH: '', AI_MEMORY_BIN: sb.bin, AI_MEMORY_AUTH_TOKEN: CANARIO_2 };
  for (const [k, v] of Object.entries(o.env ?? {})) { if (v === undefined) delete env[k]; else env[k] = v; }
  const pendentes = [];
  const sys = {
    platform: o.platform ?? 'win32',
    home: sb.home,
    env,
    fs: fsMod,
    run: (cmd, args = [], opts = {}) => {
      args = [...args].map(String);
      regs.run.push({ cmd: String(cmd), args });
      if (!ehBin(cmd)) return res(-1, '', 'ENOENT');
      if (args.length === 1 && args[0] === '--version') return res(0, 'ai-memory ' + VERSAO + '\n');
      if (args.includes('init')) {
        const d = depois(args, '--data-dir');
        if (!d) return res(2, '', 'fake: init without --data-dir');
        mkdirSync(join(d, 'auth-tokens'), { recursive: true });
        if (!existsSync(join(d, 'config.toml'))) writeFileSync(join(d, 'config.toml'), CONFIG_INICIAL());
        if (!existsSync(join(d, 'auth-tokens', 'default'))) writeFileSync(join(d, 'auth-tokens', 'default'), CANARIO_1 + '\n');
        return res(0, 'initialized ' + d + '\n');
      }
      if (args.includes('status')) {
        const url = depois(args, '--server-url') ?? opts.env?.AI_MEMORY_SERVER_URL ?? null;
        const s = url ? servidores.get(url.replace(/\/$/, '')) : null;
        if (!s) return res(1, '', 'fake: server not reachable');
        return res(0, JSON.stringify({ version: VERSAO, data_dir: s.dataDir }));
      }
      return res(0, '');
    },
    spawn: (cmd, args = [], opts = {}) => {
      args = [...args].map(String);
      const reg = { cmd: String(cmd), args, opts: { detached: opts.detached, stdio: opts.stdio, windowsHide: opts.windowsHide } };
      regs.spawn.push(reg);
      const filho = { pid: 4242, unref() { regs.unref++; return this; }, ref() { return this; }, on() { return this; }, once() { return this; }, kill() {}, stdout: null, stderr: null };
      if (ehBin(cmd) && args.includes('serve') && o.sobe !== false) {
        const bind = depois(args, '--bind') ?? '';
        const port = Number(bind.split(':').pop());
        if (port && !PROIBIDAS.includes(port)) pendentes.push(servidorFalso(port, depois(args, '--data-dir')).then((s) => { servidores.set(s.url, s); }, () => {}));
      }
      return filho;
    },
    fetch: async (u, opts) => {
      const url = String(u?.url ?? u);
      regs.fetch.push(url);
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) throw new Error('critico: rede proibida: ' + url);
      await Promise.all(pendentes);
      return globalThis.fetch(u, opts);
    },
    freePort: (...a) => {
      regs.freePort++;
      const p = filaPortas.length ? Promise.resolve(filaPortas.shift()) : portaLivre();
      const n = new Number(0);
      n.then = (ok, ko) => p.then(ok, ko);
      return n;
    },
  };
  // um servidor que já responde numa url (estado `on` de um setup anterior)
  const levanta = async (port, dataDir) => { const s = await servidorFalso(port, dataDir); servidores.set(s.url, s); return s; };
  const fecha = async () => { await Promise.all(pendentes); for (const s of servidores.values()) await s.fecha(); servidores.clear(); };
  return { sys, regs, servidores, levanta, fecha };
};

// main(argv, sys, write) de scripts/memoria.mjs, com tudo o que vá para o stdout e o stderr apanhado (write, console e process.*.write)
export const carregaMemoria = () => import(pathToFileURL(MEMORIA).href + '?t=' + Date.now() + Math.random());
export const corre = async (argv, sys) => {
  const { main } = await carregaMemoria();
  const saida = [];
  const orig = { o: process.stdout.write, e: process.stderr.write };
  process.stdout.write = function (c, ...r) { saida.push(String(c)); const cb = r.find((x) => typeof x === 'function'); if (cb) cb(); return true; };
  process.stderr.write = function (c, ...r) { saida.push(String(c)); const cb = r.find((x) => typeof x === 'function'); if (cb) cb(); return true; };
  let code, erro;
  try { code = await main(argv, sys, (s) => { saida.push(String(s) + '\n'); }); } catch (e) { erro = e; } finally { process.stdout.write = orig.o; process.stderr.write = orig.e; }
  const out = saida.join('');
  if (erro) throw Object.assign(new Error('main lançou: ' + (erro?.stack ?? erro) + '\nsaída: ' + out), { saida: out });
  return { code, out };
};
export const plano = async (proj, sys) => {
  const r = await corre(['--plan', '--dest', proj], sys);
  let json = null;
  const t = r.out.trim();
  try { json = JSON.parse(t); } catch { try { json = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch {} }
  return { ...r, json };
};
export const aplica = (proj, sys) => corre(['--apply', '--dest', proj], sys);

// O módulo do F-20a, carregado de novo
export const carregaModulo = () => { const req = createRequire(MODULO); delete req.cache[req.resolve(MODULO)]; return req(MODULO); };

// Projeto gerado (inglês, respostas do F-01; workspace acme, project billing); com os três hooks de proteção do F-13 no settings.json
export const projeto = (over = {}) => generate({ hooks: { killByName: true, backgroundTests: true, idleWatch: true }, ...over });
export const le = (proj, rel) => readFileSync(join(proj, rel), 'utf8');
export const leJson = (proj, rel) => JSON.parse(le(proj, rel).replace(/^\uFEFF/, ''));
export const escreve = (proj, rel, t) => { mkdirSync(dirname(join(proj, rel)), { recursive: true }); writeFileSync(join(proj, rel), t); };
// a tabela [forge] do .ai-memory.local.toml (ou do ficheiro dado): { corpo, serverUrl, dataDir, port, tabelas }
export const forge = (proj, rel = TOML_LOCAL) => {
  if (!existsSync(join(proj, rel))) return null;
  const t = le(proj, rel);
  const linhas = t.split(/\r?\n/);
  const i = linhas.findIndex((l) => /^\s*\[forge\]\s*$/.test(l));
  if (i < 0) return null;
  const corpo = [];
  for (const l of linhas.slice(i + 1)) { if (/^\s*\[/.test(l)) break; corpo.push(l); }
  const g = (k) => (corpo.join('\n').match(new RegExp('^\\s*' + k + '\\s*=\\s*"([^"]*)"', 'm')) || [])[1] ?? null;
  const serverUrl = g('server_url');
  return { corpo, serverUrl, dataDir: g('data_dir'), port: serverUrl ? Number(serverUrl.split(':').pop()) : null, tabelas: linhas.filter((l) => /^\s*\[forge\]\s*$/.test(l)).length };
};