// Ronda −1 do F-13 (#14): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import,
// e todas as pastas temporárias criadas aqui são apagadas no `after` do ficheiro de teste que as criou.
// Os hooks são testados chamando o script com o JSON do evento no stdin; nenhum comando do corpus é executado.
//
// PONTE (PERGUNTA 1 da Ronda −1). O contrato deixa livres os nomes dos scripts, o evento do vigia, a forma de injetar o relógio
// e as palavras da linha `hooks` do --env. Para os ataques não fixarem nada disso, o dev escreve na Ronda 0 a ponte
// `tests/ponte/f-13.mjs`, que só importa do pacote e adapta a forma, sem lógica (o c0-ponte.test.mjs verifica). Exporta:
//   scripts     -> { matar, fundo, vigia }  caminho RELATIVO de cada script no projeto gerado; corre com `node <projeto>/<caminho>`,
//                                           com o JSON do evento no stdin, cwd na raiz do projeto e CLAUDE_PROJECT_DIR = raiz
//   eventoVigia -> string                   o evento de hook (hook_event_name) em que o settings.json instala o vigia
//   relogio(ms) -> { [VAR]: string }        as variáveis de ambiente que injetam o «agora» (ms desde a época) no vigia
//   nomesNoEnv  -> { matar, fundo, vigia }  a palavra que a linha `hooks` do `check.cjs --env` usa para cada hook instalado
//
// Leitura do resultado de um hook, pela documentação oficial (code.claude.com/docs/en/hooks, lida em 2026-10-29):
//   PreToolUse bloqueia  = sai com 2 (a razão é o stderr), ou sai com 0 e o stdout é JSON com
//                          hookSpecificOutput.permissionDecision "deny" (a razão é permissionDecisionReason);
//   PreToolUse deixa passar = sai com 0, sem decisão "deny" nem "ask" (um hook que rebenta, com outro código, não conta como passar);
//   aviso do vigia       = o texto simples do stdout com saída 0, ou hookSpecificOutput.additionalContext se o stdout for JSON.
import { after } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, basename } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PONTE = join(ROOT, 'tests/ponte/f-13.mjs');
export const BASE = 'e083b6a';

const temps = [];
export const tmp = (prefix = 'critico-f13-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f13-home-');
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
  if (!existsSync(PONTE)) throw new Error('ponte em falta: tests/ponte/f-13.mjs (o dev escreve-a na Ronda 0; ver o topo de helpers.mjs)');
  ponte ??= await import(pathToFileURL(PONTE).href);
  return ponte;
};

export const QUAIS = ['matar', 'fundo', 'vigia'];
export const CHAVE = { matar: 'killByName', fundo: 'backgroundTests', vigia: 'idleWatch' }; // as respostas de setup do contrato
export const hooksDe = (m, f, v) => ({ killByName: m, backgroundTests: f, idleWatch: v });
export const COMBOS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => hooksDe(!!(i & 4), !!(i & 2), !!(i & 1)));

export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
export const corpusAnswers = () => {
  const dir = join(ROOT, 'scripts/corpus/answers');
  return readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => ({ name: n, value: readJson(join(dir, n)) }));
};
// Respostas de base: um conjunto em inglês do corpus, sem a chave hooks (cada teste põe a sua)
export const baseAnswers = () => {
  const s = corpusAnswers().find((x) => /^en-/.test(x.name)) ?? corpusAnswers()[0];
  const { hooks, ...rest } = s.value;
  return rest;
};

export const scaffoldFn = async () => (await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href)).scaffold;
// Gera um projeto numa pasta nova (ou em `dest`) e devolve a raiz
export const gerar = async (hooks, { dest, answers, force } = {}) => {
  const scaffold = await scaffoldFn();
  const d = dest ?? join(tmp(), 'proj');
  const a = { ...(answers ?? baseAnswers()) };
  if (hooks !== undefined) a.hooks = hooks;
  await scaffold(a, { dest: d, ...(force && { force }) });
  return d;
};
export const settingsDe = (proj) => join(proj, '.claude/settings.json');

// ---- Evento PreToolUse, como o Claude Code o manda (exemplo da documentação oficial) ----
export const entradaPre = (proj, tool, command, bg) => ({
  session_id: 'critico-f13', transcript_path: join(proj, 'transcript.jsonl'), cwd: proj, permission_mode: 'default',
  hook_event_name: 'PreToolUse', tool_name: tool,
  tool_input: { command, description: 'ataque F-13', timeout: 120000, ...(bg !== undefined && { run_in_background: bg }) },
  tool_use_id: 'toolu_critico_f13',
});

const ler = (r) => ({ status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
export const correrScript = (proj, rel, entrada, env = {}) =>
  ler(spawnSync(process.execPath, [join(proj, rel)], { input: JSON.stringify(entrada), cwd: proj, encoding: 'utf8', env: sandboxEnv({ CLAUDE_PROJECT_DIR: proj, ...env }), timeout: 30000 }));

// Corre muitos casos em paralelo (8 de cada vez): [{ rel, entrada, env }] -> resultados pela mesma ordem
export const correrMuitos = (proj, casos, paralelo = 8) => new Promise((res) => {
  const out = new Array(casos.length);
  let i = 0, vivos = 0, feitos = 0;
  if (!casos.length) return res(out);
  const proximo = () => {
    while (vivos < paralelo && i < casos.length) {
      const k = i++, c = casos[k];
      vivos++;
      const p = spawn(process.execPath, [join(proj, c.rel)], { cwd: proj, env: sandboxEnv({ CLAUDE_PROJECT_DIR: proj, ...(c.env ?? {}) }) });
      let so = '', se = '';
      const t = setTimeout(() => p.kill(), 30000); // só o PID que este teste lançou
      p.stdout.on('data', (b) => { so += b; });
      p.stderr.on('data', (b) => { se += b; });
      p.on('close', (status) => {
        clearTimeout(t);
        out[k] = { status, stdout: so, stderr: se };
        vivos--; feitos++;
        if (feitos === casos.length) res(out); else proximo();
      });
      p.stdin.on('error', () => {});
      p.stdin.end(JSON.stringify(c.entrada));
    }
  };
  proximo();
});

const jsonDe = (s) => { try { const o = JSON.parse(s.trim()); return o && typeof o === 'object' ? o : null; } catch { return null; } };
// Veredito de um PreToolUse: { bloqueia, passa, mensagem }
export const veredito = (r) => {
  if (r.status === 2) return { bloqueia: true, passa: false, mensagem: r.stderr };
  const o = r.status === 0 ? jsonDe(r.stdout) : null;
  const d = o?.hookSpecificOutput?.permissionDecision ?? { block: 'deny', approve: 'allow' }[o?.decision];
  if (r.status === 0 && d === 'deny') return { bloqueia: true, passa: false, mensagem: o.hookSpecificOutput?.permissionDecisionReason ?? o.reason ?? '' };
  return { bloqueia: false, passa: r.status === 0 && d !== 'ask', mensagem: '' };
};
// Texto que o vigia acrescenta ao contexto ('' = calado)
export const aviso = (r) => {
  if (r.status !== 0) return null;
  const o = jsonDe(r.stdout);
  if (o) return o.hookSpecificOutput?.additionalContext ?? '';
  return r.stdout.trim();
};
export const mostra = (r) => `saída ${r.status}; stdout=${JSON.stringify(r.stdout.slice(0, 300))}; stderr=${JSON.stringify(r.stderr.slice(0, 300))}`;

// ---- settings.json: o matcher pelas regras da documentação oficial ----
export const casa = (matcher, nome) => {
  if (matcher === undefined || matcher === '' || matcher === '*') return true;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(matcher)) return matcher.split(/[|,]/).map((s) => s.trim()).includes(nome);
  return new RegExp(matcher).test(nome);
};
const textoDoHook = (h) => [h.command ?? '', ...(Array.isArray(h.args) ? h.args : [])].join(' ').replace(/\\/g, '/');
// Todas as entradas de hook do settings.json que chamam o script `rel` (pelo nome do ficheiro): [{ evento, matcher, hook }]
export const refsAo = (settings, rel) => {
  const nome = basename(rel);
  const out = [];
  for (const [evento, grupos] of Object.entries(settings?.hooks ?? {})) {
    for (const g of Array.isArray(grupos) ? grupos : []) for (const h of g.hooks ?? []) if (textoDoHook(h).includes(nome)) out.push({ evento, matcher: g.matcher, hook: h });
  }
  return out;
};
// O hook `rel` corre no PreToolUse da ferramenta `tool` (matcher que a apanha e sem `if` que a estreite)
export const cobre = (settings, rel, tool) =>
  refsAo(settings, rel).some((x) => x.evento === 'PreToolUse' && casa(x.matcher, tool) && (x.hook.if === undefined || x.hook.if === `${tool}(*)`));

// ---- Executar a entrada do settings.json como o Claude Code a executa (exec form com args; shell form em bash ou powershell) ----
export const gitBash = () => {
  if (process.platform !== 'win32') return 'bash';
  for (const p of [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']) if (p && existsSync(p)) return p;
  return null;
};
export const correrComoClaudeCode = (proj, hook, entrada, env = {}) => {
  const ambiente = sandboxEnv({ CLAUDE_PROJECT_DIR: proj, ...env });
  const sub = (s) => s.replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR/g, proj);
  const o = { input: JSON.stringify(entrada), cwd: proj, encoding: 'utf8', env: ambiente, timeout: 60000 };
  if (Array.isArray(hook.args)) return ler(spawnSync(sub(hook.command), hook.args.map(sub), o));
  if (hook.shell === 'powershell') return ler(spawnSync('powershell.exe', ['-NoProfile', '-Command', hook.command.replace(/\$\{CLAUDE_PROJECT_DIR\}/g, '${env:CLAUDE_PROJECT_DIR}')], o));
  const bash = gitBash();
  if (!bash) return null;
  return ler(spawnSync(bash, ['-c', hook.command], o));
};

// ---- check.cjs ----
export const ENV_ISOLATED = { PATH: '', Path: '', AI_MEMORY_URL: 'http://127.0.0.1:9' };
export const check = (cwd, args = [], env = {}) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(env), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// O mesmo substituto da tradução que o scripts/corpus.test.mjs usa (passo de tradução da skill new-project)
const LINE_PT = 'Esta parte descreve o que o agente faz para cada peça, com o teste e a evidência que não podem faltar.';
const NATURAL = { '## Step 8': '## Etapa 8', '## 5. Checkpoint script': '## 5. Script do checkpoint', '## 1. Roles and models': '## 1. Funções e modelos' };
export const translatePt = (text) => {
  let fence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*```/.test(l)) { fence = !fence; return l; }
    if (fence || !l.trim() || /^[|\s:-]+$/.test(l)) return l;
    if (l.startsWith('#')) return NATURAL[l] ?? l.replace(/^(#{2,} )(\d+\. )?.*$/, '$1$2Seção');
    return l.match(/^\s*(?:[-*] |\d+\. |> |\| )?/)[0] + LINE_PT + ' ' + (l.match(/`[^`]*`/g) ?? []).join(' ');
  }).join('\n');
};
export const traduzSePt = (proj) => {
  if (!/^pt/i.test(readJson(join(proj, '.claude/forge.json')).langTag)) return;
  for (const rel of ['CLAUDE.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) writeFileSync(join(proj, rel), translatePt(readFileSync(join(proj, rel), 'utf8')));
};

// ---- Fotografia de uma pasta: { caminho relativo: sha256 } ----
export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((n) => walk(join(abs, n))));
export const foto = (dir) => Object.fromEntries(walk(dir).map((f) => [relative(dir, f), createHash('sha256').update(readFileSync(f)).digest('hex')]));

export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export { mkdirSync, writeFileSync, readFileSync, existsSync };
