// Ronda −1 do F-15a (#38): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE, CLAUDE_CONFIG_DIR, TEMP e LOCALAPPDATA apontam para uma pasta temporária logo
// no import; as pastas temporárias são apagadas no `after` do ficheiro que as criou. Nenhum ataque vai à rede: o doctor recebe
// sempre um `sys` falso (fonte das versões injetável), e os comandos impressos só correm depois de o URL do GitHub ser trocado
// por um repositório git local criado no próprio teste (e só se não sobrar nenhum `http` no comando).
//
// FORMA DO compat.json (resposta P1 do orquestrador na #38, comentário 6503925940): UMA só forma,
//   { "components": { "<id>": { "verifiedWith": "<versão>", "surface": { "skills": [...], "commands": [...] }, "notes": {...} } } }
// Os nomes são as strings (não URL) de surface.skills (skills: mattpocock-skills:<x>, speckit-<x>, ponytail*) e de
// surface.commands (subcomandos e flags: graphify <sub>, ai-memory <sub>, specify init --<flag>). Os URLs de origem são as
// campo próprio `components.<id>.source` (resposta P7): um só URL do repositório, na tag ou no sha do verifiedWith; nunca na
// surface nem nas notes, e nenhum outro URL na entrada.
// Um nome N está numa lista quando uma string é N ou termina em N depois de um separador (`:`, `-`, `.`, `/` ou espaço), de modo
// que `converge`, `speckit-converge` e `/speckit.converge` contam todos como `converge`.
// SECÇÕES PROIBIDAS (resposta P3): o que os templates citam só nas secções «Do not run» e «Do not use» fica FORA da surface.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep, resolve, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = '0a35bee'; // main quando a Ronda −1 foi escrita (antes do F-05)
export const COMPAT = join(ROOT, 'compat.json');
export const FIXTURE = join(ROOT, 'scripts/fixtures/compat/surface-2026-10-29.json');
export const COMPAT_TEST = 'scripts/compat.test.mjs';

const temps = [];
export const tmp = (prefix = 'critico-f15a-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

const fake = mkdtempSync(join(tmpdir(), 'critico-f15a-home-'));
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
after(() => rmSync(fake, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
export const FAKE_HOME = fake;

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, DISABLE_AUTOUPDATER: '1', ...extra };
  delete env.NODE_TEST_CONTEXT;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return env;
};

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const registry = (root = ROOT) => readJson(join(root, 'components.json'));
export const loadDoctor = () => import(pathToFileURL(join(ROOT, 'scripts/doctor.mjs')).href);

export const walk = (abs) => {
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((n) => walk(join(abs, n)));
};
export const posix = (p) => p.split(sep).join('/');

// Cópia do pacote (sem .git, tests e node_modules) numa pasta temporária
export const copyPackage = () => {
  const dest = tmp('critico-f15a-pkg-');
  cpSync(ROOT, dest, { recursive: true, filter: (s) => !/^(\.git|tests|node_modules)([\\/]|$)/.test(relative(ROOT, s)) });
  return dest;
};
export const runNodeTest = (cwd, rel, extraEnv = {}) => {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', rel], { cwd, encoding: 'utf8', env: sandboxEnv(extraEnv), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
export const edit = (dir, rel, f) => writeFileSync(join(dir, rel), f(existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : ''));

// ---------- compat.json ----------
export const IDS = ['uv', 'gauntlet-loop', 'ai-memory', 'ai-memory-mcp', 'ponytail', 'spec-kit', 'sdd', 'mattpocock-skills', 'graphify', 'graphify-skill'];
// verifiedWith do contrato. ai-memory-mcp e graphify-skill herdam do dono (sameAs ai-memory; latest pypi graphifyy): PERGUNTA 2.
export const VERIFIED = {
  uv: '0.13.6', 'gauntlet-loop': 'fc6b2fc', 'ai-memory': '3.2.10', 'ai-memory-mcp': '3.2.10', ponytail: '5.3.3',
  'spec-kit': '1.2.5', sdd: '2.1.0', 'mattpocock-skills': '1.3.2', graphify: '0.9.97', 'graphify-skill': '0.9.97',
};
export const stripV = (v) => String(v ?? '').replace(/^v/i, '');

// Mapa id → entrada, só na forma fixada (P1): compat.components é um objeto indexado pelo id
export const entries = (compat) => {
  const c = compat?.components;
  assert.ok(c && typeof c === 'object' && !Array.isArray(c), 'forma do compat.json: falta o objeto "components" indexado pelo id (P1)');
  return c;
};
export const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
export const isUrl = (s) => /^https?:\/\//i.test(s);
const listOf = (e, k) => (Array.isArray(e?.surface?.[k]) ? e.surface[k].filter((s) => typeof s === 'string' && !isUrl(s)) : []);
export const surfaceNames = (e, bucket) => (bucket ? listOf(e, bucket) : [...listOf(e, 'skills'), ...listOf(e, 'commands')]);
// URLs fora do campo `source` (e fora de `notes` e de `pristine`, resposta P4 da #39): na forma fixada (P7) não pode haver nenhum
export const strayUrls = (e) => strings(Object.fromEntries(Object.entries(e ?? {}).filter(([k]) => k !== 'notes' && k !== 'source' && k !== 'pristine'))).filter(isUrl);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const hasName = (e, n, bucket) => surfaceNames(e, bucket).some((s) => s === n || new RegExp(`[:\\-./ ]${esc(n)}$`).test(s));

// Percorre a surface e aplica f a cada array de strings (para as mutações). Devolve quantos arrays mudaram.
export const mapSurfaceArrays = (node, f) => {
  let n = 0;
  const visit = (v) => {
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'string')) { const before = JSON.stringify(v); const out = f(v); v.splice(0, v.length, ...out); if (JSON.stringify(v) !== before) n++; return; }
      v.forEach(visit);
    } else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(node);
  return n;
};

// ---------- nomes que os templates citam (regexes do crítico, só as formas inequívocas; respostas P3 e P4) ----------
export const templateFiles = (root = ROOT) => walk(join(root, 'templates')).map((abs) => [posix(relative(root, abs)), readFileSync(abs, 'utf8')]);
const codeSpans = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const uniq = (a) => [...new Set(a)].sort();
// Secção proibida: começa numa linha «Do not run» ou «Do not use» (depois de marcadores de lista, citação ou negrito) e continua
// pelas linhas em branco e pelos itens de lista seguintes; acaba na primeira linha que não é nenhuma das duas (título, `---`, texto).
const FORBIDDEN = /^\s*(?:[-*>]\s+|\d+\.\s+)?(?:\*\*|__)?do not (?:run|use)\b/i;
export const splitForbidden = (text) => {
  const keep = [], drop = [];
  let inside = false;
  for (const l of text.split(/\r?\n/)) {
    if (FORBIDDEN.test(l)) inside = true;
    else if (inside && !(l.trim() === '' || /^\s*[-*]\s+/.test(l))) inside = false;
    (inside ? drop : keep).push(l);
  }
  return { keep: keep.join('\n'), drop: drop.join('\n') };
};
const extract = (texts) => {
  const all = texts.join('\n');
  const spans = texts.flatMap(codeSpans);
  return {
    'mattpocock-skills': uniq([...all.matchAll(/mattpocock-skills:([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1])),
    'spec-kit': uniq([...all.matchAll(/speckit-([a-z][a-z-]*)/g)].map((m) => m[1]).filter((x) => x !== 'x')),
    'spec-kit-flags': uniq(spans.filter((s) => /^specify init\b/.test(s)).flatMap((s) => [...s.matchAll(/(?:^|\s)(--[a-z][a-z-]*)/g)].map((m) => m[1]))),
    ponytail: uniq([...all.matchAll(/\bponytail-([a-z]+)\b/g)].map((m) => 'ponytail-' + m[1])),
    // em código: `graphify <sub>` num code span e, no check.cjs, out('graphify', ['<sub>', ...])
    graphify: uniq([...spans.flatMap((s) => [...s.matchAll(/^graphify ([a-z][a-z-]*)/g)].map((m) => m[1])), ...[...all.matchAll(/\(\s*'graphify'\s*,\s*\[\s*'([a-z][a-z-]*)'/g)].map((m) => m[1])]),
    // `ai-memory <sub>` num code span e, no check.cjs, out(AIM, ['<sub>', ...]) / sh(AIM, ['<sub>', ...])
    'ai-memory': uniq([...spans.flatMap((s) => [...s.matchAll(/^ai-memory ([a-z][a-z-]*)/g)].map((m) => m[1])), ...[...all.matchAll(/\(\s*AIM\s*,\s*\[\s*'([a-z][a-z-]*)'/g)].map((m) => m[1])]),
  };
};
// Nomes citados fora das secções proibidas
export const cited = (root = ROOT) => extract(templateFiles(root).map(([, t]) => splitForbidden(t).keep));
// Nomes citados SÓ dentro das secções proibidas (ficam fora da surface, P3)
export const forbiddenOnly = (root = ROOT) => {
  const ok = cited(root);
  const bad = extract(templateFiles(root).map(([, t]) => splitForbidden(t).drop));
  return Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, v.filter((n) => !ok[k].includes(n))]));
};
// Família de nomes → [componente, lista da surface]
export const ALVO = { 'mattpocock-skills': ['mattpocock-skills', 'skills'], 'spec-kit': ['spec-kit', 'skills'], 'spec-kit-flags': ['spec-kit', 'commands'], ponytail: ['ponytail', 'skills'], graphify: ['graphify', 'commands'], 'ai-memory': ['ai-memory', 'commands'] };

// ---------- doctor com sys falso ----------
export function fakeSys({ platform = 'win32', home = '/h', exec = {}, files = {}, urls = {}, env = {}, reads, calls, fetched } = {}) {
  return {
    platform, home, env,
    async exec(cmd, args) {
      calls?.push([cmd, ...args]);
      const key = [cmd, ...args].join(' ');
      if (key in exec) return exec[key];
      throw Object.assign(new Error('spawn ' + cmd + ' ENOENT'), { code: 'ENOENT' });
    },
    async readFile(path) { reads?.push(path); return path in files ? files[path] : null; },
    async fetchText(url) {
      fetched?.push(url);
      if (url in urls) return urls[url];
      throw new Error('HTTP 404 ' + url);
    },
  };
}
export const REL = (repo, tag) => ['https://api.github.com/repos/' + repo + '/releases/latest', JSON.stringify({ tag_name: tag })];
export const RAW = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
export const PYPI = (pkg, v) => ['https://pypi.org/pypi/' + pkg + '/json', JSON.stringify({ info: { version: v } })];
// Emenda do F-15a (#38, 2026-10-29): o gauntlet-loop vem do fork do responsável, no commit fc6b2fc; o robonuggets é só o original
export const GAUNTLET_FORK = 'RenatoWernik/gauntlet-loop';
export const GAUNTLET_UPSTREAM = 'robonuggets/gauntlet-loop';
export const HEADSHA = 'fc6b2fc604ff37fdf4da67ed76980e6af1722629';
// Todas as fontes de versão do registo real, nas versões verificadas (sem rede)
export const LATEST_URLS = (extra = {}) => ({
  ...Object.fromEntries([
    REL('astral-sh/uv', 'v0.13.6'), REL('akitaonrails/ai-memory', 'v3.2.10'), REL('DietrichGebert/ponytail', 'v5.3.3'), REL('mattpocock/skills', 'v1.3.2'),
    PYPI('specify-cli', '1.2.5'), PYPI('graphifyy', '0.9.97'),
  ]),
  ['https://api.github.com/repos/' + GAUNTLET_FORK + '/commits/HEAD']: JSON.stringify({ sha: HEADSHA }),
  [RAW(GAUNTLET_FORK, HEADSHA, '.claude/skills/gauntlet-loop/SKILL.md')]: 'gauntlet do fork',
  [RAW('SpillwaveSolutions/sdd-skill', 'HEAD', 'skill.md')]: '---\nname: sdd\nversion: 2.1.0\n---\n# SDD',
  [RAW('DietrichGebert/ponytail', 'v5.3.3', 'skills/ponytail/SKILL.md')]: 'ponytail upstream',
  ...extra,
});
export const PLATFORMS = [['win32', 'windows'], ['darwin', 'macos'], ['linux', 'linux']];
export const byGroup = (report, g) => report.components.filter((c) => c.group === g);
export const commandsOf = (report) => report.components.flatMap((c) => c.command ?? []);

// ---------- injeção: em que contexto de aspas está cada ocorrência de um texto perigoso ----------
// dialeto 'ps' (PowerShell: '' dentro de aspas simples, ` escapa) ou 'sh' (POSIX: \ escapa fora das aspas simples).
// Seguro: o texto perigoso dentro de aspas simples; ou dentro de aspas duplas sem `$(` (nem crase, em sh) imediatamente antes.
export const unsafeAt = (cmd, token, dialect) => {
  const states = [];
  let s = 'none';
  for (let i = 0; i < cmd.length; i++) {
    states[i] = s;
    const ch = cmd[i];
    if (s === 'none') {
      if (ch === "'") s = 'single';
      else if (ch === '"') s = 'double';
      else if ((dialect === 'ps' && ch === '`') || (dialect === 'sh' && ch === '\\')) { states[i + 1] = s; i++; }
    } else if (s === 'single') {
      if (ch === "'") { if (dialect === 'ps' && cmd[i + 1] === "'") { states[i + 1] = s; i++; } else s = 'none'; }
    } else {
      if ((dialect === 'ps' && ch === '`') || (dialect === 'sh' && ch === '\\')) { states[i + 1] = s; i++; }
      else if (ch === '"') { if (dialect === 'ps' && cmd[i + 1] === '"') { states[i + 1] = s; i++; } else s = 'none'; }
    }
  }
  const bad = [];
  for (let i = cmd.indexOf(token); i >= 0; i = cmd.indexOf(token, i + 1)) {
    const st = states[i];
    const before = cmd.slice(Math.max(0, i - 2), i);
    if (st === 'none' || (st === 'double' && (before === '$(' || (dialect === 'sh' && before.endsWith('`'))))) bad.push(i);
  }
  return bad;
};

// ---------- higiene: dados pessoais, caminhos da máquina e tokens ----------
const W = (...p) => new RegExp(p.join(''), 'i'); // palavras montadas aos bocados para este ficheiro não as conter
export const PERSONAL = [
  /\b[A-Z]:\\\\?(Users|AIData|Tools|Guilda|forge)/i, /\b[A-Z]:\/(Users|AIData|Tools|Guilda|forge)/i, /\/Users\/[a-z]/i, /\/home\/[a-z]/i,
  W('agent', 'homes'), W('gui', 'lda'), W('ren', 'at'), W('wer', 'nik'), W('key', 'rus'), W('one', 'drive'),
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /\bbearer\s+[A-Za-z0-9._-]{10,}/i, /"authorization"\s*:/i, /\btoken_pepper\b/i,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /[\w.+-]+@(?!example\.)[\w-]+\.(com|pt|br|org|net|io)\b/i,
];
// Única exceção (emenda): o slug público do fork do gauntlet-loop, decidido pelo responsável. Qualquer outra ocorrência continua a reprovar.
export const personalHits = (text) => { const t = text.replace(/(?:github(?:usercontent)?\.com\/(?:repos\/)?|(?<![\w\/.-]))RenatoWernik\/(?:gauntlet-loop|forge)(?![\w.-])/gi, ''); return PERSONAL.filter((re) => re.test(t)).map(String); };

// ---------- ensaio real de um comando de skill (só git local, sem rede) ----------
export const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8', env: sandboxEnv() });
export const gitRepo = (files) => {
  const d = tmp('critico-f15a-repo-');
  for (const [rel, content] of Object.entries(files)) { mkdirSync(join(d, rel, '..'), { recursive: true }); writeFileSync(join(d, rel), content); }
  for (const a of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) { const r = git(d, ...a); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); }
  return d;
};
export const PONYTAIL_SKILLS = ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'];
export const ponytailRepo = () => gitRepo({
  'skills/plugin.json': JSON.stringify({ name: 'ponytail', skills: './' }),
  ...Object.fromEntries(PONYTAIL_SKILLS.map((n) => [`skills/${n}/SKILL.md`, `---\nname: ${n}\n---\n# ${n}\n`])),
  'README.md': '# ponytail fixture\n',
});
export const gauntletRepo = () => gitRepo({ '.claude/skills/gauntlet-loop/SKILL.md': '---\nname: gauntlet-loop\n---\n# fixture\n', 'README.md': '# fixture\n' });
export const sddRepo = () => gitRepo({ 'skill.md': '---\nname: sdd\nversion: 2.1.0\n---\n# fixture\n', 'skill.json': '{"name":"sdd"}', 'README.md': '# fixture\n', 'references/a.md': 'a', 'scripts/b.sh': 'echo b' });

// Troca o URL do GitHub pelo repositório local e corre o comando na shell da plataforma atual, com tudo em tmp.
// Recusa correr (devolve { refused }) se sobrar algum http no comando.
export const runSkillCommand = (cmd, githubUrl, localRepo, { home, configDir, temp }) => {
  const swapped = cmd.split(githubUrl).join(posix(localRepo));
  if (/https?:\/\//i.test(swapped)) return { refused: 'sobra um URL de rede no comando: ' + swapped };
  const env = sandboxEnv({ HOME: home, USERPROFILE: home, HOMEDRIVE: home.slice(0, 2), HOMEPATH: home.slice(2), TEMP: temp, TMP: temp, TMPDIR: temp, LOCALAPPDATA: temp, CLAUDE_CONFIG_DIR: configDir, GIT_TERMINAL_PROMPT: '0' });
  const shell = process.platform === 'win32' ? ['powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', swapped]] : ['sh', ['-c', swapped]];
  const r = spawnSync(shell[0], shell[1], { cwd: temp, encoding: 'utf8', env, timeout: 120000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), swapped };
};
// Corre a lista de comandos impressos pelo doctor (pelo menos um tem de clonar `githubUrl`); cada um tem de sair com 0
export const runCommands = (commands, githubUrl, localRepo, ctx) => {
  assert.ok(commands.some((c) => c.includes(githubUrl)), 'nenhum comando clona ' + githubUrl);
  for (const c of commands) {
    const r = runSkillCommand(c, githubUrl, localRepo, ctx);
    assert.ok(!r.refused, r.refused);
    assert.equal(r.status, 0, 'o comando falhou:\n' + r.swapped + '\n' + r.out.slice(-1500));
  }
};
// Ambiente sem rede para processos lançados: o preload sem-rede.mjs regista cada tentativa em `log`
export const SEM_REDE = pathToFileURL(fileURLToPath(new URL('./sem-rede.mjs', import.meta.url))).href;
export const semRedeEnv = (log, extra = {}) => ({ NODE_OPTIONS: `--import=${SEM_REDE}`, CRITICO_REDE_LOG: log, ...extra });
export const dirsIn = (d) => (existsSync(d) ? readdirSync(d).sort() : []);
export { join, resolve, normalize, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync };
