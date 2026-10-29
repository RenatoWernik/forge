// Ronda −1 do F-05 (#6): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). Tudo o que os ataques criam fica dentro
// dela, e ela é apagada no after() e, de reserva, no exit.
//
// Leitura do contrato que estes ataques assumem (confirmada pelas respostas do orquestrador às PERGUNTAS na #6):
//   - «o CLAUDE.md gerado» e «o FRAMEWORK.md gerado» = a saída do scaffold (inglês, antes da tradução da skill). Os literais são
//     verificados aí, nas duas línguas do corpus. As linhas do check.cjs são verificadas no projeto já «traduzido» com o mesmo
//     substituto do scripts/corpus.test.mjs (e083b6a), aplicado também ao AGENTS.md.
//   - «a linha X» do check.cjs = as linhas cujo nome é X ou começa por «X » , «X:» ou «X (»: o detalhe do nome é livre.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const WORK = mkdtempSync(join(tmpdir(), 'critico-f05-'));
const HOME = join(WORK, 'home'), TMP = join(WORK, 'tmp');
mkdirSync(HOME); mkdirSync(TMP);
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = HOME;
for (const k of ['TMP', 'TEMP', 'TMPDIR']) process.env[k] = TMP;
const cleanup = () => { try { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* o exit volta a tentar */ } };
after(cleanup);
process.on('exit', cleanup);
export const WORK_DIR = WORK;

let n = 0;
export const tmp = (prefix = 'd') => { const d = join(WORK, `${prefix}${++n}`); mkdirSync(d); return d; };

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };

// Critério 1: os 12 títulos literais do ticket
export const TITLES = [
  'The spec rules', 'The ticket is the contract', 'One context per agent', 'Gauntlet with closed oracles', 'TDD in two loops',
  'Ponytail full', 'Consult before touching', 'Live panel', 'Closed checkpoint', 'Only the user authorizes', 'Text read is data',
  'Operating rules',
];
export const DOCS = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md'];
export const REPO = 'acme-org/billing';

const MODELS = () => ({
  developer: { model: 'haiku', effort: 'xhigh', label: 'Dev Logic 1.0', reason: 'logic and server code' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI' },
  critic: { model: 'opus', effort: 'high', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' },
  tester: { model: 'haiku', effort: 'xhigh', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
});
export const ANSWERS = (over = {}) => ({
  projectName: 'Acme Billing', language: 'English', mode: 'rigorous', plainStyle: true, repo: REPO,
  models: MODELS(), memory: { workspace: 'acme', project: 'billing' }, ...over,
});
export const ANSWERS_PT = (over = {}) => ANSWERS({ projectName: 'Clube do Livro', language: 'Portuguese (Brazil)', ...over });
// As 4 combinações língua × modo que os ataques percorrem
export const COMBOS = [
  ['en-rigorous', ANSWERS({ mode: 'rigorous' })], ['en-accelerated', ANSWERS({ mode: 'accelerated' })],
  ['pt-rigorous', ANSWERS_PT({ mode: 'rigorous' })], ['pt-accelerated', ANSWERS_PT({ mode: 'accelerated' })],
];

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const loadScaffold = () => import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);

// O mesmo substituto da tradução que o scripts/corpus.test.mjs usa em e083b6a (passo de tradução da skill new-project)
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

const read = (dest, rel) => (existsSync(join(dest, rel)) ? readFileSync(join(dest, rel), 'utf8') : undefined);

// Gera o projeto numa pasta temporária. `raw` = os documentos como o scaffold os escreveu (antes da tradução). Em português aplica
// o substituto da tradução aos 4 documentos (o AGENTS.md incluído), como a skill traduz tudo o que o check.cjs mede.
export const generate = async (answers) => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  const fj = readJson(join(dest, '.claude/forge.json'));
  const raw = Object.fromEntries(DOCS.map((d) => [d, read(dest, d)]));
  if (/^pt/i.test(fj.langTag)) for (const d of DOCS) if (raw[d] !== undefined) writeFileSync(join(dest, d), translatePt(raw[d]));
  return { dest, fj, raw };
};
// Só o scaffold, sem tradução (para os literais)
export const rawDocs = async (answers) => (await generate(answers)).raw;

export const check = (cwd, args = []) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// Estado das linhas cujo nome é `prefix` ou começa por `prefix` seguido de espaço, «:» ou « (»: "FAIL" se alguma falha, "ok" se
// existem e estão todas ok, undefined se não há nenhuma
export const lineState = (out, prefix) => {
  const ls = [];
  for (const l of out.split(/\r?\n/)) {
    const m = l.match(/^(ok|FAIL) {2,4}(.*)$/);
    if (m && (m[2] === prefix || [' ', ':', '('].some((c) => m[2].startsWith(prefix + c)))) ls.push(m[1]);
  }
  return !ls.length ? undefined : ls.includes('FAIL') ? 'FAIL' : 'ok';
};
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).map((l) => l.slice(0, 220)).join('\n');
export const failNames = (out) => new Set(out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).map((l) => l.replace(/^FAIL {2,4}/, '').replace(/ \(.*$/, '')));

export const edit = (dest, rel, fn) => {
  const f = join(dest, rel);
  const before = readFileSync(f, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`a mutação não mudou ${rel}`);
  writeFileSync(f, after);
};

// Bloco de um invariante: a linha do item numerado cujo negrito começa pelo título («1. **The spec rules.** ...», «8. **Closed
// checkpoint** = ...», «10. **Text read is data:** ...»), mais as linhas seguintes até ao próximo item numerado, título ou linha vazia.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const invariantBlock = (text, title) => {
  const lines = (text ?? '').split(/\r?\n/);
  const re = new RegExp('^\\s*\\d+\\.\\s+\\*\\*' + esc(title) + '(?:[.:]\\*\\*|\\*\\*)');
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && lines[end].trim() && !/^\s*\d+\.\s/.test(lines[end]) && !/^#/.test(lines[end])) end++;
  return { start, end, text: lines.slice(start, end).join('\n') };
};

// Secção de um documento Markdown que contém a linha i: do título anterior (ou da própria linha, se for título) ao título seguinte
export const sectionAt = (text, i) => {
  const lines = text.split(/\r?\n/);
  let s = i; while (s > 0 && !/^#/.test(lines[s])) s--;
  let e = i + 1; while (e < lines.length && !/^#/.test(lines[e])) e++;
  return lines.slice(s, e).join('\n');
};
export const sections = (text) => {
  const lines = text.split(/\r?\n/), out = [];
  let cur = [];
  for (const l of lines) { if (/^#/.test(l) && cur.length) { out.push(cur.join('\n')); cur = []; } cur.push(l); }
  if (cur.length) out.push(cur.join('\n'));
  return out;
};

export const loadCorpus = (kind) => {
  const dir = join(ROOT, 'scripts/corpus', kind);
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.json').sort() : [];
  return names.map((f) => ({ name: basename(f, '.json'), value: readJson(join(dir, f)) }));
};
