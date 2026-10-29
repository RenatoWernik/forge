// Ronda −1 do F-02 (#3): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária logo no import.
//
// Esquema do corpus que estes ataques leem (proposto na PERGUNTA 1 da Ronda −1; o contrato deixa o formato livre entre JSON e .mjs):
//   scripts/corpus/answers/<nome>.json | .mjs (export default): um conjunto de respostas, o mesmo objeto que `scaffold.mjs --answers` aceita.
//   scripts/corpus/mutations/<nome>.json | .mjs (export default): { base, file, find, replace, line }
//     base    = <nome> de um conjunto de respostas; file = caminho no projeto gerado; find/replace = texto literal (todas as ocorrências);
//     line    = o nome exato da linha do check.cjs que tem de falhar (o que vem depois de "FAIL  ", sem o detalhe entre parênteses que algumas linhas acrescentam).
//   O nome de um conjunto ou de uma mutação é o nome do ficheiro sem extensão.
//   Os projetos em português passam pelo substituto da tradução do scripts/scaffold.test.mjs (o mesmo que está abaixo) antes do check e das mutações.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = 'beb6338';
export const HARNESS = 'scripts/corpus.test.mjs';
export const CORPUS = 'scripts/corpus';

const fake = mkdtempSync(join(tmpdir(), 'critico-f02-home-'));
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
export const FAKE_HOME = fake;
// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((n) => walk(join(abs, n))));

const loadOne = async (file) => (extname(file) === '.json' ? JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) : (await import(pathToFileURL(file).href)).default);
export const loadCorpus = async (kind, root = ROOT) => {
  const dir = join(root, CORPUS, kind);
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => ['.json', '.mjs'].includes(extname(n))).sort() : [];
  return Promise.all(files.map(async (n) => ({ name: basename(n, extname(n)), file: join(dir, n), value: await loadOne(join(dir, n)) })));
};

export const copyPackage = () => {
  const dest = mkdtempSync(join(tmpdir(), 'critico-f02-pkg-'));
  cpSync(ROOT, dest, { recursive: true, filter: (s) => !/^(\.git|tests|node_modules)([\\/]|$)/.test(relative(ROOT, s)) });
  return dest;
};

export const runHarness = (cwd, timeout = 330000) => {
  const t = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', HARNESS], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), ms: Date.now() - t };
};

// Pré-condição comum dos ataques ao harness: ele existe e passa numa cópia limpa do pacote (calculada uma vez por ficheiro de teste)
let clean;
export const harnessPrecondition = (assert) => {
  assert.ok(existsSync(join(ROOT, HARNESS)), 'pré-condição: ' + HARNESS + ' não existe');
  clean ??= runHarness(copyPackage());
  assert.equal(clean.status, 0, 'pré-condição: o corpus tem de passar numa cópia limpa\n' + clean.out.slice(-2000));
};

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

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
// Gera o projeto de um conjunto de respostas numa pasta temporária; em português aplica o substituto da tradução
export const buildProject = async (answers, { translate = true } = {}) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dest = mkdtempSync(join(tmpdir(), 'critico-f02-proj-'));
  await scaffold(answers, { dest });
  const fj = readJson(join(dest, '.claude/forge.json'));
  if (translate && /^pt/i.test(fj.langTag)) {
    for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  }
  return { dest, fj };
};

export const check = (cwd) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs'], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// Estado ("ok" | "FAIL" | undefined) da linha `name` na saída do check: nome exato, com ou sem o detalhe " (...)" no fim
export const lineState = (out, name) => {
  for (const l of out.split(/\r?\n/)) {
    const m = l.match(/^(ok|FAIL) {2,4}(.*)$/);
    if (m && (m[2] === name || m[2].startsWith(name + ' ('))) return m[1];
  }
};

export const CHECK_TEMPLATE = 'templates/.claude/check.cjs';
export const CHK_HEAD = 'async function chk(name, f) {';
