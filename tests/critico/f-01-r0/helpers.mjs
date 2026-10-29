// Ronda −1 do F-01 (#2): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para pastas temporárias logo no import.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = 'beb6338'; // a referência da barra

const fake = mkdtempSync(join(tmpdir(), 'critico-f01-home-'));
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
export const FAKE_HOME = fake;
// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

// Termos do critério 2, sem distinguir maiúsculas
export const TERMS = ['claude-mem', 'claude_mem', 'mcp-search', 'smart_outline', 'smart_unfold', 'smart_search', 'get_observations', 'get_tool_uses', 'timeline-report'];
export const TERM_RE = new RegExp(TERMS.map((t) => t.replace(/[-_]/g, (c) => '\\' + c)).join('|'), 'i');
export const SCAN_ROOTS = ['templates', 'skills', 'scripts', 'components.json', 'README.md', 'README.pt-BR.md'];
export const ABSENCE_TEST = 'scripts/sem-claude-mem.test.mjs';

export const walk = (abs) => {
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((n) => walk(join(abs, n)));
};
const posix = (p) => p.split(sep).join('/');

// Ocorrências dos termos na árvore do pacote em `root` (todos os ficheiros, incluindo os de nome com ponto)
export const scanHits = (root = ROOT) => {
  const hits = [];
  for (const r of SCAN_ROOTS) {
    for (const abs of walk(join(root, r))) {
      const rel = posix(relative(root, abs));
      if (rel === ABSENCE_TEST) continue;
      readFileSync(abs, 'utf8').split(/\r?\n/).forEach((l, i) => { if (TERM_RE.test(l)) hits.push(`${rel}:${i + 1}: ${l.trim().slice(0, 100)}`); });
    }
  }
  return hits;
};

// Cópia do pacote (sem .git, tests e node_modules) numa pasta temporária
export const copyPackage = () => {
  const dest = mkdtempSync(join(tmpdir(), 'critico-f01-pkg-'));
  cpSync(ROOT, dest, { recursive: true, filter: (s) => !/^(\.git|tests|node_modules)([\\/]|$)/.test(relative(ROOT, s)) });
  return dest;
};

export const runNodeTest = (cwd, rel) => {
  const r = spawnSync(process.execPath, ['--test', rel], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

export const edit = (dir, rel, f) => writeFileSync(join(dir, rel), f(existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : ''));
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

export const loadScaffold = () => import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);

export const ANSWERS = (over = {}) => ({
  projectName: 'Acme Billing',
  language: 'English',
  mode: 'rigorous',
  repo: 'acme/billing',
  models: {
    developer: { model: 'sonnet', effort: 'high', reason: 'logic and server code' },
    developerUi: { model: 'opus', effort: 'high', reason: 'rich UI needs a stronger model' },
    critic: { model: 'opus', effort: 'high', reason: 'the critic stays on the strongest model' },
    tester: { model: 'haiku', effort: 'xhigh', reason: 'the batch suite is mechanical work' },
    aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
  },
  memory: { workspace: 'acme', project: 'billing' },
  ...over,
});

// O mesmo substituto da tradução que o scripts/scaffold.test.mjs usa (passo de tradução da skill new-project)
const LINE_PT = 'Esta parte descreve o que o agente faz para cada peça, com o teste e a evidência que não podem faltar.';
const NATURAL = { '## Step 8': '## Etapa 8', '## 5. Checkpoint script': '## 5. Script do checkpoint', '## 1. Roles and models': '## 1. Funções e modelos' };
export const translatePt = (text) => {
  let fence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*```/.test(l)) { fence = !fence; return l; }
    if (fence || !l.trim() || /^[|\s:-]+$/.test(l)) return l;
    if (l.startsWith('#')) return NATURAL[l] ?? l.replace(/^(#{2,} )(\d+\. )?.*$/, '$1$2Seção');
    return l.match(/^\s*(?:[-*] |\d+\. |> |\| )?/)[0] + LINE_PT + (l.includes('Verifies:') ? ' Verifica: ' : ' ') + (l.match(/`[^`]*`/g) ?? []).join(' ');
  }).join('\n');
};

// Gera um projeto numa pasta temporária; em português aplica o substituto da tradução aos 3 documentos
export const generate = async (over = {}) => {
  const { scaffold } = await loadScaffold();
  const dest = mkdtempSync(join(tmpdir(), 'critico-f01-proj-'));
  await scaffold(ANSWERS(over), { dest });
  if (/^pt/.test(readJson(join(dest, '.claude/forge.json')).langTag)) {
    for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  }
  return dest;
};

export const check = (cwd, args = [], env = {}) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(env), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
export const lineNames = (out) => out.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2})/.test(l)).map((l) => l.slice(6));

// --env sem rede útil nem ferramentas no PATH: nenhuma ferramenta real é chamada, só se leem os nomes das linhas
export const ENV_ISOLATED = { PATH: '', Path: '', AI_MEMORY_URL: 'http://127.0.0.1:9' };
