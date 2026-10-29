// Ronda −1 do F-03 (#4): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos: o check.cjs e os node --test aninhados
// criam lá as suas pastas). Tudo o que os ataques criam fica dentro dela, e ela é apagada no after() e, de reserva, no exit.
//
// Leitura do contrato que estes ataques assumem (com as respostas do orquestrador às 8 PERGUNTAS na issue #4):
//   respostas e forge.json: `mode` no topo; os 5 papéis em `models.<papel>` ({ model, effort, reason, label?, match? }), como hoje;
//   a linha «forge.json» do check.cjs é a linha (ou linhas) cujo nome começa por «forge.json»; o detalhe do nome é livre.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const WORK = mkdtempSync(join(tmpdir(), 'critico-f03-'));
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

export const ROLES = ['developer', 'developerUi', 'critic', 'tester', 'aux'];
export const OLD_ROLES = ['developer', 'critic', 'aux'];
export const EFF = ['low', 'medium', 'high', 'xhigh', 'max'];
export const MODES = ['rigorous', 'accelerated'];
// Critério 4: as 4 condições com os limiares literais
export const ESCALATION = { sameCriterionFailures: 2, attacksRedOnDelivery: true, minutesWithoutProgress: 30, visualBelowReference: true };

export const MODELS = () => ({
  developer: { model: 'haiku', effort: 'xhigh', label: 'Dev Logic 1.0', reason: 'logic and server code run well on Haiku xhigh, measured in the Guild' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI needs Opus high' },
  critic: { model: 'opus', effort: 'high', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' },
  tester: { model: 'haiku', effort: 'xhigh', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
});
export const ANSWERS = (over = {}) => ({
  projectName: 'Acme Billing',
  language: 'English',
  mode: 'rigorous',
  repo: 'acme/billing',
  models: MODELS(),
  memory: { workspace: 'acme', project: 'billing' },
  ...over,
});
// As respostas de hoje (v1, como em beb6338, F-01 e F-02): sem mode, sem developerUi e tester, sem reason
export const ANSWERS_V1 = () => ({
  projectName: 'Acme Billing',
  language: 'English',
  models: { developer: { model: 'sonnet', effort: 'high' }, critic: { model: 'opus', effort: 'high' }, aux: { model: 'sonnet', effort: 'medium' } },
  memory: { workspace: 'acme', project: 'billing' },
});

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const loadScaffold = () => import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);

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

// Gera o projeto numa pasta temporária; em português aplica o substituto da tradução aos 3 documentos
export const generate = async (answers) => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  const fj = readJson(join(dest, '.claude/forge.json'));
  if (/^pt/i.test(fj.langTag)) {
    for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) if (existsSync(join(dest, rel))) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  }
  return { dest, fj };
};

export const check = (cwd, args = []) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// "FAIL" se alguma linha cujo nome começa por «forge.json» falha; "ok" se existem e estão todas ok; undefined se não há nenhuma
export const forgeState = (out) => {
  const ls = out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}forge\.json/)).filter(Boolean).map((m) => m[1]);
  return !ls.length ? undefined : ls.includes('FAIL') ? 'FAIL' : 'ok';
};
// Estado ("ok" | "FAIL" | undefined) da linha `name`: nome exato, com ou sem o detalhe " (...)" no fim (como o corpus.test.mjs)
export const lineState = (out, name) => {
  for (const l of out.split(/\r?\n/)) {
    const m = l.match(/^(ok|FAIL) {2,4}(.*)$/);
    if (m && (m[2] === name || m[2].startsWith(name + ' ('))) return m[1];
  }
};
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).join('\n');

export const loadCorpus = (kind) => {
  const dir = join(ROOT, 'scripts/corpus', kind);
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.json').sort() : [];
  return names.map((f) => ({ name: basename(f, '.json'), value: readJson(join(dir, f)) }));
};

// Um campo é nomeado na mensagem quando aparece como caminho inteiro: «mode» não conta dentro de «models», nem
// «models.developer» dentro de «models.developerUi», nem a flag «--mode» do texto de uso; um sufixo «.algo» depois do caminho conta
// (models.tester → models.tester.model).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const names = (msg, field) => new RegExp('(?<![\\w.-])' + esc(field) + '(?![\\w])').test(msg);

// Forma da escalation (resposta à PERGUNTA 2 na #4): um objeto com uma chave por condição, cada uma { value, description }.
export const isEmptyEscalation = (x) => (Array.isArray(x) ? x.length === 0 : !!x && typeof x === 'object' && Object.keys(x).length === 0);

// As 4 classes de defeito do critério 2, lidas de um forge.json já parseado
export const defects = (fj) => {
  const out = new Set();
  if (!MODES.includes(fj?.mode)) out.add('modo desconhecido');
  for (const r of ROLES) {
    const x = fj?.models?.[r];
    if (!x || typeof x !== 'object') continue;
    if (typeof x.reason !== 'string' || !x.reason.trim()) out.add('papel sem reason');
    if (!EFF.includes(x.effort)) out.add('effort inválido');
  }
  if (isEmptyEscalation(fj?.escalation)) out.add('escalation vazia');
  return out;
};
