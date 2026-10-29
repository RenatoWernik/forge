// Ronda −1 do F-07 (#8): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude`: os workflows correm num runtime falso (vm), como a simulação do check.cjs.
//
// Leitura do contrato que estes ataques assumem. As respostas do orquestrador às PERGUNTAS da #8
// (E:\Guilda\.checkpoints\orquestrador-resp-f07.md) fazem parte do contrato; cada ponto ajusta-se aqui, num só sítio:
//   - os campos do contrato ficam no topo de cada peça dos `args` (spec #1: «os args de cada peça ganham os campos do contrato»);
//     os campos antigos da peça (id, title, goal, bar, owns, tdd) continuam lá;
//   - `issue` é um número inteiro positivo; `objective`, `input`, `fails`, `outOfScope`, `env` e `output` são texto não vazio;
//     `criteria` é uma lista de 1 a 6 critérios { text, oracle, command } (resposta 4: mais de 6 é recusado, nomeando a peça),
//     com `oracle` em corpus | property | reference | threshold;
//   - resposta 1: o `command` é obrigatório em todos os critérios; o `oracle` só num critério com palavra absoluta, por isso um
//     critério sem palavra absoluta e sem oracle é válido;
//   - resposta 2: o resultado da Ronda −1 chega ao gauntlet-build em `args.attacks`, a lista `results` que o gauntlet-attacks
//     devolve, tal como está (helper `comR0`);
//   - resposta 3: o gauntlet-attacks recebe os mesmos args de base que o gauntlet-build (checkpoint, root, dashboardUrl, context,
//     models, language, memory, pieces) e devolve { results: [{ id, attacks, failingOnBase, gaps }] } (também aceito a lista solta);
//   - resposta 5: `failingOnBase: false` bloqueia a peça no build (sem dev), como as lacunas;
//   - resposta 7: cada ataque em `attacks` é { id, file, guard?: true }; o failingOnBase conta só os ataques sem guard; a peça
//     bloqueada leva `blocked: { reason, ... }`: { reason: "failingOnBase", attacks: [ids não-guarda que já passam na base] } e,
//     para as outras causas, a mesma forma; lacunas e falta de resultado (critério 4: ambos «gaps») dão { reason: "gaps" };
//   - PERGUNTA 8: de onde vem, por ataque, o estado na base (que ataques já passam): os ataques só exigem que blocked.attacks seja
//     uma lista de ids não-guarda da peça;
//   - o crítico da Ronda −1 responde no schema com os mesmos nomes do retorno (attacks, failingOnBase, gaps); o runtime falso
//     preenche qualquer outro campo obrigatório do schema pelo tipo;
//   - recusa = zero agent() e o texto do erro (ou do retorno) nomeia o campo como caminho: `issue`, `criteria[1].command`,
//     `criteria.1.command` ou `criteria.command`.
// Os papéis reconhecem-se pelo modelo e pelo esforço (modelos de sonda distintos), nunca pelas etiquetas, que são internas.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = 'e083b6a'; // a main com o F-01, o F-02, o F-03 e o F-10

const WORK = mkdtempSync(join(tmpdir(), 'critico-f07-'));
const HOME = join(WORK, 'home'), TMP = join(WORK, 'tmp');
mkdirSync(HOME); mkdirSync(TMP);
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = HOME;
for (const k of ['TMP', 'TEMP', 'TMPDIR']) process.env[k] = TMP;
const cleanup = () => { try { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* o exit volta a tentar */ } };
after(cleanup);
process.on('exit', cleanup);

let n = 0;
export const tmp = (prefix = 'd') => { const d = join(WORK, `${prefix}${++n}`); mkdirSync(d); return d; };
// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

export const WF_DIR = join(ROOT, 'templates/.claude/workflows');
export const ATTACKS = 'gauntlet-attacks.js', BUILD = 'gauntlet-build.js';
export const ORACLES = ['corpus', 'property', 'reference', 'threshold'];
export const MODES = ['rigorous', 'accelerated'];
export const CONTRACT_TEXT = ['objective', 'input', 'fails', 'outOfScope', 'env', 'output'];

// ---------- Runtime falso (a mesma técnica do check.cjs: vm só com args, agent, parallel, phase e log; sem relógio nem acaso) ----------
// Modelos de sonda: cada papel com um par modelo/esforço distinto, para reconhecer quem foi lançado sem ler etiquetas.
export const PROBE = {
  developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0', reason: 'probe' },
  developerUi: { model: 'probe-devui', effort: 'high', label: 'Probe UI 2.0', reason: 'probe' },
  critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 3.0', reason: 'probe' },
  tester: { model: 'probe-tester', effort: 'medium', label: 'Probe Tester 4.0', reason: 'probe' },
  aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 5.0', reason: 'probe' },
};
export const isCritic = (c) => c.opts?.model === PROBE.critic.model;
export const isDev = (c) => [PROBE.developer.model, PROBE.developerUi.model].includes(c.opts?.model);

// Um valor do tipo pedido pelo schema, para os campos obrigatórios que o ataque não conhece
const byType = (s) => (s?.type === 'array' ? ['x'] : s?.type === 'boolean' ? true : s?.type === 'number' || s?.type === 'integer' ? 1 : s?.type === 'object' ? {} : s?.enum ? s.enum[0] : 'x');
export const fromSchema = (schema, known) => {
  const o = {};
  for (const k of schema?.required || []) o[k] = byType(schema.properties?.[k]);
  return { ...o, ...known };
};

export const workflowSrc = (file, dir = WF_DIR) => readFileSync(join(dir, file), 'utf8');

// Corre um workflow no runtime falso. log: lista partilhada (opcional) onde cada agent() fica registado por ordem, entre workflows.
export const runWf = async (file, args, impl, { dir = WF_DIR, log: shared } = {}) => {
  const run = { file, calls: [], logs: [], phases: [] };
  let src;
  try { src = workflowSrc(file, dir); } catch (e) { run.err = new Error(`${file} não existe em ${dir}`); return run; }
  try {
    src = src.replace(/^export const meta\s*=/m, 'const meta =');
    const agent = async (prompt, opts) => {
      const c = { file, prompt, opts: opts || {} };
      if (run.calls.push(c) > 1000) throw new Error('limit of 1000 agents');
      if (shared) shared.push(c);
      return impl(prompt, opts || {});
    };
    const parallel = (ts) => Promise.all(ts.map((t) => t().catch(() => null)));
    const ctx = vm.createContext({ args, agent, parallel, phase: (t) => run.phases.push(t), log: (m) => run.logs.push(m) });
    vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx);
    run.out = await vm.runInContext('(async () => {' + src + '\n})()', ctx);
  } catch (e) { run.err = e; }
  return run;
};
export const resultsOf = (out) => (Array.isArray(out) ? out : Array.isArray(out?.results) ? out.results : []);
export const refusalText = (run) => (run.err ? String(run.err.message ?? run.err) : '') + ' ' + (run.out === undefined ? '' : JSON.stringify(run.out));

// ---------- Contratos ----------
export const contract = (id = 'pa', issue = 9101, over = {}) => ({
  id, title: 'TITLE-' + id, goal: 'OBJ-' + id, bar: 'BAR-' + id, owns: ['src/a.js'], tdd: true,
  issue,
  objective: 'OBJ-' + id,
  input: 'branch main at HEAD abc1234; files src/a.js and test/a.test.mjs',
  criteria: [
    { text: 'The export returns 3 rows for the sample file', oracle: 'corpus', command: 'node --test test/a.test.mjs' },
    { text: 'The header row matches the reference CSV byte for byte', oracle: 'reference', command: 'node --test test/header.test.mjs' },
  ],
  fails: 'a criterion that fails or has no evidence; a regression',
  outOfScope: 'pagination and the PDF export',
  env: 'Node 24, standard library only',
  output: 'draft PR and a Round 0 comment on the issue',
  ...over,
});

export const baseArgs = (pieces, over = {}) => ({
  checkpoint: { n: 1, title: 'T' }, root: '/proj', dashboardUrl: 'https://claude.ai/artifact/x', context: 'CTX-SPEC',
  models: structuredClone(PROBE), language: 'English', memory: { workspace: 'ws', project: 'pj' }, mode: 'rigorous',
  pieces, ...over,
});

// PERGUNTA 2: onde o resultado da Ronda −1 entra no gauntlet-build. Só aqui.
export const comR0 = (args, results) => ({ ...args, attacks: results });
// A mesma leitura em código-fonte, para a mutação que salta a Ronda −1 (c7): dá a cada peça um resultado limpo
export const R0_BYPASS = "if (args && Array.isArray(args.pieces)) args = { ...args, attacks: args.pieces.map(p => ({ id: p && p.id, attacks: [{ id: 'x', file: 'x.test.mjs' }], failingOnBase: true, gaps: [] })) }";
// Os ataques de uma peça (resposta 7): um normal e uma guarda
export const atks = (id) => [{ id: `${id}-a1`, file: `tests/critico/${id}-r0/a1.test.mjs` }, { id: `${id}-g1`, file: `tests/critico/${id}-r0/g1.test.mjs`, guard: true }];
export const r0 = (id, gaps = [], over = {}) => ({ id, attacks: atks(id), failingOnBase: true, gaps, ...over });
// Forma normalizada de uma lista de ataques (id, file, guard booleano), para comparar entre realms e sem depender da ordem das chaves
export const normAtks = (xs) => (Array.isArray(xs) ? Array.from(xs, (a) => ({ id: a?.id, file: a?.file, guard: a?.guard === true })) : xs);

// Uma chamada pertence a uma peça quando o prompt traz o objetivo, o título ou o número da issue dela
export const belongs = (c, p) => c.prompt.includes(p.objective) || c.prompt.includes(p.title) || new RegExp(`(?<!\\d)${p.issue}(?!\\d)`).test(c.prompt);

// Resposta falsa dos agentes. gapsOf: id → lacunas que o crítico da Ronda −1 devolve. O crítico do build escolhe sempre a nossa
// versão na 1.ª ronda (como o `win` do check.cjs), para o loop sem limite de hoje acabar.
// models: os papéis do forge.json (por defeito, as sondas); cada papel reconhece-se pelo par modelo/esforço.
export const fakeImpl = ({ pieces = [], gapsOf = {}, failingOnBase = true, models = PROBE } = {}) => (prompt, opts) => {
  const is = (r) => opts.model === models[r].model && opts.effort === models[r].effort;
  const role = ['critic', 'developer', 'developerUi'].find(is);
  const model = role ? `${models[role].model} ${models[role].label || models[role].model}` : String(opts.model);
  if (role === 'critic' && !/^A: /m.test(prompt)) { // crítico da Ronda −1 (o do build recebe os candidatos A e B)
    const p = pieces.find((x) => new RegExp(`(?<!\\d)${x.issue}(?!\\d)`).test(prompt)) || pieces.find((x) => prompt.includes(x.objective)) || {};
    return fromSchema(opts.schema, { attacks: atks(p.id), failingOnBase, gaps: gapsOf[p.id] ?? [], model });
  }
  if (role === 'critic') {
    const ours = /^A: .*src\/a\.js/m.test(prompt) ? 'A' : 'B';
    return fromSchema(opts.schema, { winner: ours, testsPass: true, blockingErrors: [], biggestGap: 'none', reasoning: 'r', model });
  }
  if (role) return fromSchema(opts.schema, { filesChanged: ['src/a.js'], testCommand: 'node --test', redEvidence: 'RED', greenEvidence: 'GREEN', model });
  return 'ok';
};

// ---------- Nome do campo na mensagem ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// field: 'issue' ou ['criteria', i, 'command']
export const names = (msg, field) => {
  if (typeof field === 'string') return new RegExp('(?<![\\w.-])' + esc(field) + '(?![\\w])').test(msg);
  const [arr, i, sub] = field;
  return new RegExp(`(?<![\\w.-])${arr}(?:\\[${i}\\]|\\.${i})?\\.${sub}(?![\\w])`).test(msg);
};
export const fieldLabel = (f) => (typeof f === 'string' ? f : `${f[0]}[${f[1]}].${f[2]}`);

// ---------- Projetos gerados (como os helpers do F-03) ----------
export const MODELS = () => ({
  developer: { model: 'haiku', effort: 'xhigh', label: 'Dev Logic 1.0', reason: 'logic and server code run well on Haiku xhigh' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI needs Opus high' },
  critic: { model: 'opus', effort: 'high', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' },
  tester: { model: 'haiku', effort: 'xhigh', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
});
export const ANSWERS = (over = {}) => ({ projectName: 'Acme Billing', language: 'English', mode: 'rigorous', models: MODELS(), memory: { workspace: 'acme', project: 'billing' }, ...over });

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
export const generate = async (answers) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  const fj = readJson(join(dest, '.claude/forge.json'));
  if (/^pt/i.test(fj.langTag)) for (const rel of ['CLAUDE.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) if (existsSync(join(dest, rel))) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  return { dest, fj };
};
export const check = (cwd, args = []) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).join('\n') || out.slice(-1500);

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
