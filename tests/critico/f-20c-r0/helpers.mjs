// Ronda −1 do F-20c (#72): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem corre um ai-memory, systemctl, launchctl ou wscript reais:
// - o `memoria.mjs` corre pelo `sys` falso do F-20b (f-20b-r0/helpers.mjs), aqui com `systemctl`, `launchctl` e `id` falsos que registam o argv, pela ordem,
//   e o estado da entrada de arranque deste projeto no momento de cada comando; `reg`, `schtasks`, `powershell`, `runas`, `wscript`, `sudo` e afins
//   ficam registados e falham;
// - o `check.cjs --env` corre com o espião deste pacote (espiao.mjs), que força a plataforma e deixa só o git correr de verdade;
// - HOME, APPDATA, LOCALAPPDATA, XDG_CONFIG_HOME e XDG_DATA_HOME são pastas temporárias, com espaços nos caminhos, um `%` no linux e um `&` no macOS.
//
// LEITURA DO CONTRATO (#72 com as respostas do orquestrador de 2026-10-31T21:09Z, vinculativas, mais as respostas do orquestrador na #71: a `[forge]` vive no `.ai-memory.local.toml`):
// - `memoria.mjs --apply --dest <projeto> --autostart yes|no`, pelo seam do F-20b: `main(argv, sys, write)`, com `sys.platform`, `sys.env` e `sys.home`;
// - o `<uid>` do macOS vem de `sys.run('id', ['-u'])`; os comandos de arranque passam pelo `sys.run`;
// - os textos entre aspas abaixo são LITERAIS, copiados do corpo da issue.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as A from '../f-20a-r0/helpers.mjs';
import * as B from '../f-20b-r0/helpers.mjs';

export const { ROOT, W, P, NOME, CANARIO_1, CANARIO_2, TOML_LOCAL, PROIBIDAS, fwd, apaga, mesmoCaminho, instantaneo, portaLivre, le, escreve, forge, corre, plano } = B;
export const projeto = B.projeto;
export const { ambiente, binFalso, AIM_OK, linha } = A;
export const caixaCheck = A.caixa; // { dir, home, local, dataDir }; o ambiente põe APPDATA em <dir>/appdata e XDG_CONFIG_HOME em <dir>/xdgc
export const BASE = 'ce112a2'; // a branch do F-20b (só os ataques dele) de onde esta parte
export const PLATAFORMAS = ['win32', 'linux', 'darwin'];

// C1
// o bloco sem os «> » da citação da issue (resposta do orquestrador na #72)
export const BLOCO_C1 = "**Start this project's memory with the system?** ai-memory is this project's long-term memory. It hands the baton from one session to the next, so a new session starts where the last one stopped; it remembers the decisions and lessons already learned; it lets the work resume after a quota or context cut; and Claude and Codex share it. It captures and answers only while its server is running.\n- **Yes**: forge adds a startup entry for this project's server only (Windows: a `.vbs` file in your Startup folder, without administrator rights; Linux: a systemd user unit; macOS: a LaunchAgent). The server then starts hidden at every logon and stays in the background, using a little memory.\n- **No**: nothing starts with the system. You start the server when you need it with `node .claude/start-ai-memory.mjs`, and every session start says whether it is on and how to start it. While it is off, nothing is captured and the baton does not arrive.\nEither way the memory of this project is set up correctly, and you can change the answer later by running this step again.";
export const FRASE_C1 = "Ask it in the user's language, and wait for the answer: a missing answer is not a yes.";
export const COMANDO_C1 = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/memoria.mjs" --apply --dest "<project folder>" --autostart yes|no'; // resposta do orquestrador na #72
// C2, C3: o nome exato da entrada deste projeto (W = acme, P = billing)
export const ENTRADA = { win32: `forge-ai-memory-${W}--${P}.vbs`, linux: `forge-ai-memory-${W}--${P}.service`, darwin: `com.forge.ai-memory.${W}.${P}.plist` };
export const UNIT = ENTRADA.linux, LABEL = `com.forge.ai-memory.${W}.${P}`, UID = '501';
const STARTUP = ['Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'];
export const pastaEntradas = (plat, { home, appdata, xdgc }) => (plat === 'win32' ? join(appdata, ...STARTUP) : plat === 'linux' ? join(xdgc || join(home, '.config'), 'systemd', 'user') : join(home, 'Library', 'LaunchAgents'));
export const caminhoEntrada = (plat, dirs) => join(pastaEntradas(plat, dirs), ENTRADA[plat]);
// C4
export const L_AUTO = 'ai-memory: autostart';
export const D_AUTO = {
  semEntrada: '(yes, but the startup entry is missing: run the memory step again)',
  diferente: '(yes, but the startup entry does not match .ai-memory.toml: run the memory step again)',
  sobra: '(no, but a startup entry exists: run the memory step again)',
  semChave: '(not chosen: run the memory step of /forge:new-project)',
};
// C5
export const L_CP = 'ai-memory: one page checkpoints/cp-N.md per cp-N tag';
export const D_SEM_TAGS = '(no cp-* tags)';
export const D_FALTA = (tags) => `(missing: ${tags.join(', ')})`;
export const SPAN_9 = '`ai-memory: one page checkpoints/cp-N.md per cp-N tag`';
export const VERIFIES_9 = 'Verifies: `git tag --list "cp-*"` shows `cp-N`, and `node .claude/check.cjs --env` has the line `ai-memory: one page checkpoints/cp-N.md per cp-N tag` in ok.';
export const VERIFIES_9_ANTIGO = 'Verifies: `git tag --list "cp-*"` shows `cp-N`.';
export const L_INV = 'invariants: CLAUDE.md and AGENTS.md have the 12 numbered invariants, each with its Verifies: line';
export const MUTACAO_9 = 'scripts/corpus/mutations/invariante-9-so-pela-tag.json';

// Goldens: golden/<plataforma> com {{BIN}}, {{DATADIR}}, {{PORT}}, {{W}} e {{P}}; os valores vão escapados como o contrato pede
// (linux: cada % como %%; macOS: XML; Windows: tal como estão, dentro de "" da string VBS)
const GOLDEN = fileURLToPath(new URL('./golden/', import.meta.url));
const FICH = { win32: 'win32.vbs', linux: 'linux.service', darwin: 'darwin.plist' };
export const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ESC = { win32: (s) => String(s), linux: (s) => String(s).replace(/%/g, '%%'), darwin: escXml };
export const golden = (plat, { bin, dataDir, port, w = W, p = P }) => {
  const v = { BIN: bin, DATADIR: dataDir, PORT: String(port), W: w, P: p };
  return readFileSync(join(GOLDEN, FICH[plat]), 'utf8').replace(/\r\n/g, '\n').replace(/\{\{(\w+)\}\}/g, (m, k) => ESC[plat](v[k]));
};
export const semCr = (t) => String(t).replace(/\r\n/g, '\n');

// Oráculo do win32: a linha Run, desfeita a string VBS ("" -> "), dividida pelas regras de linha de comando do Windows
// (CommandLineToArgvW: argv[0] até à aspa seguinte ou ao espaço; depois 2n barras + aspa = n barras e troca de aspas, 2n+1 = n barras e aspa literal,
// "" dentro de aspas = aspa literal)
export const comandoVbs = (texto) => {
  const l = semCr(texto).split('\n').find((x) => /^CreateObject\("WScript\.Shell"\)\.Run /.test(x));
  const m = l && l.match(/^CreateObject\("WScript\.Shell"\)\.Run "((?:[^"]|"")*)", 0, False$/);
  return m ? m[1].replace(/""/g, '"') : null;
};
export const argvWindows = (s) => {
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n && /[ \t]/.test(s[i])) i++;
  let a0 = '';
  if (s[i] === '"') { i++; while (i < n && s[i] !== '"') a0 += s[i++]; i++; } else while (i < n && !/[ \t]/.test(s[i])) a0 += s[i++];
  out.push(a0);
  for (;;) {
    while (i < n && /[ \t]/.test(s[i])) i++;
    if (i >= n) break;
    let a = '', q = false;
    while (i < n && (q || !/[ \t]/.test(s[i]))) {
      if (s[i] === '\\') {
        let k = 0;
        while (s[i] === '\\') { k++; i++; }
        if (s[i] === '"') { a += '\\'.repeat(k >> 1); if (k % 2) { a += '"'; i++; } } else a += '\\'.repeat(k);
        continue;
      }
      if (s[i] === '"') { if (q && s[i + 1] === '"') { a += '"'; i += 2; continue; } q = !q; i++; continue; }
      a += s[i++];
    }
    out.push(a);
  }
  return out;
};
// Oráculo do linux: a unit como lista de { sec, key, value } (comentários # e ; e linhas vazias fora)
export const unit = (texto) => {
  const o = [];
  let sec = null;
  for (const l of semCr(texto).split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#') || t.startsWith(';')) continue;
    const s = t.match(/^\[(.+)\]$/);
    if (s) { sec = s[1]; continue; }
    const i = t.indexOf('=');
    o.push({ sec, key: i < 0 ? t : t.slice(0, i).trim(), value: i < 0 ? null : t.slice(i + 1).trim() });
  }
  return o;
};
// Oráculo do macOS: o plist como valor JS (dict, array, string, integer, true, false), com as entidades XML desfeitas;
// um & que não abre uma entidade é XML inválido e lança
export const plist = (texto) => {
  const t = semCr(texto).replace(/<\?xml[\s\S]*?\?>/, '').replace(/<!DOCTYPE[\s\S]*?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(t)) throw new Error('plist: & sem entidade (XML inválido)');
  const ent = (s) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e] ?? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))));
  const toks = [...t.matchAll(/<(\/?)(\w+)(\s[^>]*?)?(\/?)>|([^<]+)/g)].map((m) => (m[5] !== undefined ? { txt: m[5] } : { fecha: m[1] === '/', tag: m[2], vazio: m[4] === '/' })).filter((x) => x.tag || x.txt.trim());
  let i = 0;
  const texto_ = (tag) => { let s = ''; while (toks[i] && !(toks[i].fecha && toks[i].tag === tag)) { if (toks[i].txt === undefined) throw new Error('plist: <' + tag + '> com elementos'); s += toks[i++].txt; } i++; return ent(s); };
  const valor = () => {
    const k = toks[i++];
    if (!k || !k.tag || k.fecha) throw new Error('plist: valor esperado');
    if (k.tag === 'true' || k.tag === 'false') { if (!k.vazio) i++; return k.tag === 'true'; }
    if (k.tag === 'string') return k.vazio ? '' : texto_('string');
    if (k.tag === 'integer') return Number(texto_('integer'));
    if (k.tag === 'array') { const a = []; if (k.vazio) return a; while (!(toks[i].fecha && toks[i].tag === 'array')) a.push(valor()); i++; return a; }
    if (k.tag === 'dict') {
      const d = {};
      if (k.vazio) return d;
      while (!(toks[i].fecha && toks[i].tag === 'dict')) {
        const kk = toks[i++];
        if (kk.tag !== 'key') throw new Error('plist: <key> esperado');
        const nome = texto_('key');
        if (nome in d) throw new Error('plist: chave repetida ' + nome);
        d[nome] = valor();
      }
      i++;
      return d;
    }
    if (k.tag === 'plist') { const v = valor(); i++; return v; }
    throw new Error('plist: elemento desconhecido ' + k.tag);
  };
  return valor();
};
// o argv do servidor, como o contrato o fixa
export const ARGV = (bin, dataDir, port) => [bin, '--data-dir', dataDir, 'serve', '--transport', 'http', '--bind', '127.0.0.1:' + port, '--workspace', W, '--project', P];

// Caixa de areia do memoria.mjs por plataforma, com espaços nos caminhos do binário e do data-dir (um % no linux, um & no macOS)
export const caixa = (plat) => {
  const d = mkdtempSync(join(tmpdir(), 'critico f20c '));
  const sb = {
    dir: d, home: join(d, plat === 'darwin' ? 'home R&D' : 'home dir'), local: join(d, 'local app data'), xdg: join(d, plat === 'linux' ? 'xdg 100% data' : 'xdg data'),
    appdata: join(d, 'app data'), xdgc: join(d, 'xdg config'), cfg: join(d, 'cfg'),
  };
  sb.bin = fwd(join(d, plat === 'linux' ? 'opt 100% tools' : plat === 'darwin' ? "R&D 'tools'" : 'Program Files', 'ai-memory', plat === 'win32' ? 'ai-memory.exe' : 'ai-memory'));
  for (const p of [sb.home, sb.local, sb.xdg, sb.appdata, sb.xdgc, sb.cfg, dirname(sb.bin)]) mkdirSync(p, { recursive: true });
  writeFileSync(sb.bin, 'fake ai-memory\n');
  mkdirSync(join(sb.home, '.claude'), { recursive: true });
  writeFileSync(join(sb.home, '.claude.json'), '{"projects":{}}\n');
  writeFileSync(join(sb.home, '.claude', 'settings.json'), '{"hooks":{}}\n');
  writeFileSync(join(sb.cfg, 'settings.json'), '{"hooks":{}}\n');
  return sb;
};
const res = (code, out = '', err = '') => Object.assign(new String(out), { code, status: code, exitCode: code, ok: code === 0, stdout: out, stderr: err, output: [null, out, err], signal: null, error: undefined });
const SISTEMA = ['systemctl', 'launchctl', 'id'];
export const PROIBIDOS = ['reg', 'regedit', 'schtasks', 'powershell', 'pwsh', 'runas', 'wscript', 'cscript', 'cmd', 'sudo', 'doas', 'su', 'loginctl', 'crontab', 'at', 'sc'];
const nomeCmd = (c) => basename(fwd(c)).replace(/\.(exe|com|cmd|bat)$/i, '').toLowerCase();
// O sys falso do F-20b na plataforma dada, com APPDATA e XDG_CONFIG_HOME da caixa (o.env pode tirar ou mudar), e os comandos do sistema falsos.
// regs.cmds: { cmd, args, existe, bytes } de cada systemctl, launchctl, id e proibido, pela ordem; existe/bytes = a entrada deste projeto nesse momento
export const sysF20c = (sb, plat, o = {}) => {
  const env = { APPDATA: sb.appdata, XDG_CONFIG_HOME: sb.xdgc, ...(o.env ?? {}) };
  const f = B.sysFalso(sb, { ...o, platform: plat, env });
  f.entrada = caminhoEntrada(plat, { home: sb.home, appdata: sb.appdata, xdgc: env.XDG_CONFIG_HOME });
  f.regs.cmds = [];
  const run = f.sys.run, sp = f.sys.spawn;
  f.sys.run = (cmd, args = [], opts = {}) => {
    const n = nomeCmd(cmd), a = [...args].map(String);
    if (!SISTEMA.includes(n) && !PROIBIDOS.includes(n)) return run(cmd, args, opts);
    const existe = existsSync(f.entrada);
    f.regs.run.push({ cmd: String(cmd), args: a });
    f.regs.cmds.push({ cmd: n, args: a, existe, bytes: existe ? readFileSync(f.entrada, 'utf8') : null });
    if (n === 'id') return res(0, UID + '\n');
    if (n === 'systemctl' || n === 'launchctl') return res(0, '');
    return res(1, '', 'critico: comando proibido');
  };
  f.sys.spawn = (cmd, args = [], opts = {}) => {
    const n = nomeCmd(cmd);
    if (SISTEMA.includes(n) || PROIBIDOS.includes(n)) f.regs.cmds.push({ cmd: n, args: [...args].map(String), existe: existsSync(f.entrada), bytes: null, spawn: true });
    return sp(cmd, args, opts);
  };
  return f;
};
export const autostart = (proj, sys, v) => B.corre(['--apply', '--dest', proj, '--autostart', v], sys);
// todos os comandos do sistema e proibidos, por run e por spawn
export const proibidos = (f) => [...f.regs.cmds.filter((c) => PROIBIDOS.includes(c.cmd)), ...f.regs.spawn.filter((s) => PROIBIDOS.includes(nomeCmd(s.cmd)))];
// a linha autostart da [forge] do .ai-memory.local.toml
export const linhasAutostart = (proj) => (B.forge(proj)?.corpo ?? []).filter((l) => /^\s*autostart\s*=/.test(l));

// .ai-memory.local.toml com a [forge] (autostart omitido = sem a chave)
export const tomlLocal = (proj, { serverUrl, dataDir, autostart: a }) => writeFileSync(join(proj, TOML_LOCAL), `[forge]\nserver_url = "${serverUrl}"\ndata_dir = "${dataDir}"\n` + (a === undefined ? '' : `autostart = "${a}"\n`));
export const workspaceProjeto = (proj) => A.memoria(proj);

// git num projeto temporário: init, commit e as tags dadas (leves; anotadas com o prefixo «a:»); nada lê a config global do utilizador
const GIT_ENV = (home) => ({ ...process.env, HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, '.gitconfig-critico'), GIT_AUTHOR_NAME: 'critico', GIT_AUTHOR_EMAIL: 'c@x', GIT_COMMITTER_NAME: 'critico', GIT_COMMITTER_EMAIL: 'c@x' });
export const git = (proj, home, ...args) => {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: proj, env: GIT_ENV(home), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout;
};
export const repo = (proj, home, tags = []) => {
  mkdirSync(home, { recursive: true });
  if (!existsSync(join(proj, '.git'))) { git(proj, home, 'init', '-q'); git(proj, home, 'add', '-A'); git(proj, home, 'commit', '-q', '-m', 'cp-0: base'); }
  for (const t of tags) { if (t.startsWith('a:')) git(proj, home, 'tag', '-a', t.slice(2), '-m', t.slice(2)); else git(proj, home, 'tag', t); }
};

// node .claude/check.cjs [--env] no projeto, com o espião deste pacote, a plataforma forçada e o registo das chamadas
const ESPIAO = fileURLToPath(new URL('./espiao.mjs', import.meta.url));
export const correCheck = async (proj, env, { args = ['--env'], plataforma = null } = {}) => {
  const log = join(env.TEMP ?? tmpdir(), 'critico-f20c-' + Math.random().toString(36).slice(2) + '.log');
  writeFileSync(log, '');
  const e = { ...env, CRITICO_LOG: log, CRITICO_REAL_PATH: process.env.PATH ?? process.env.Path ?? '', NODE_OPTIONS: '--import=' + pathToFileURL(ESPIAO).href };
  if (plataforma) e.CRITICO_PLATFORM = plataforma;
  const r = await new Promise((ok) => {
    const c = spawn(process.execPath, ['.claude/check.cjs', ...args], { cwd: proj, env: e, timeout: 240000 });
    let o = '';
    c.stdout.on('data', (b) => { o += b; });
    c.stderr.on('data', (b) => { o += b; });
    c.on('close', (status) => ok({ status, out: o }));
  });
  const chamadas = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, out: r.out, linhas: r.out.split(/\r?\n/), chamadas };
};