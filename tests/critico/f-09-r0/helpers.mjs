// Ronda −1 do F-09 (#10), ADIANTADA: o F-08 (#9) ainda não existe. Utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude`: os workflows correm num runtime falso (vm), como a simulação do check.cjs.
//
// LEITURA DO CONTRATO que estes ataques assumem (a #10 não fixa a interface do tester; cada ponto ajusta-se AQUI, num só sítio,
// quando o orquestrador responder às PERGUNTAS da #10):
//   - args do gauntlet-batch: os de base dos outros workflows (checkpoint, root, dashboardUrl, context, models com os 5 papéis,
//     language, memory) mais `mode` (rigorous | accelerated), `pieces` (as peças do lote, cada uma com id, title e owns; levam
//     também os campos do build e do contrato do F-07, que o lote pode ignorar), `testCommand` e, opcional, `e2eCommand`;
//   - PERGUNTA 1: UM agente tester por lote, com `models.tester` (modelo e esforço). Ele declara as execuções e as repetições
//     isoladas como DADOS, nos campos de T abaixo:
//       runs: [{ kind: 'suite' | 'e2e', command, failures: [{ test, files: [ficheiros que o teste toca, o dele incluído], output }] }]
//       isolated: [{ test, passed: boolean, output }]   (uma repetição isolada de cada teste que falhou)
//     O tester falso também mente nos rótulos (flaky, regressions, class, piece): o workflow decide a partir dos dados, nunca deles;
//   - critério 2 (PERGUNTA 4): um tester que declara menos do que 2 execuções da suíte, ou menos do que 3 do E2E quando há
//     e2eCommand, não dá um lote aprovado;
//   - retorno: `{ regressions: [{ piece, test, output }], flaky: [teste ou { test, ... }] }` no topo. O lote está REPROVADO quando
//     há regressões, quando o workflow falha, ou quando o retorno traz uma marca explícita (passed/approved/ok === false ou
//     incomplete). PERGUNTA 2: qual é o campo do veredito do lote;
//   - PERGUNTA 3: uma falha estável fora do diff (caso 3 do critério 4) reprova o lote e não é flaky; a peça dela não é verificada;
//   - recusa (critério 1) = zero agent() e nenhum retorno com `regressions` (erro lançado ou retorno de recusa).
// Os papéis reconhecem-se pelo modelo e pelo esforço (modelos de sonda distintos), nunca pelas etiquetas, que são internas.
// Dependência do F-08: só a simulação partilhada do check.cjs (risco 2 da spec): os ataques que correm o check.cjs num projeto
// gerado (c5, c6 e c7) têm de continuar verdes por cima das linhas do build que o F-08 reescreve.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = '0a35bee'; // a main com o F-01 a F-04 e o F-10 a F-12

const WORK = mkdtempSync(join(tmpdir(), 'critico-f09-'));
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
export const BATCH = 'gauntlet-batch.js';
export const MODES = ['rigorous', 'accelerated'];
export const LIMIT = { rigorous: 3, accelerated: 5 }; // literal do critério 1
export const SUITE_RUNS = 2, E2E_RUNS = 3; // literal do critério 2

// Nomes dos campos do tester (PERGUNTA 1). As mutações do c7 usam os mesmos nomes.
export const T = { runs: 'runs', kind: 'kind', suite: 'suite', e2e: 'e2e', command: 'command', failures: 'failures', test: 'test', files: 'files', output: 'output', isolated: 'isolated', passed: 'passed' };

// ---------- Runtime falso (a mesma técnica do check.cjs: vm só com args, agent, parallel, phase e log; sem relógio nem acaso) ----------
export const PROBE = {
  developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0', reason: 'probe' },
  developerUi: { model: 'probe-devui', effort: 'high', label: 'Probe UI 2.0', reason: 'probe' },
  critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 3.0', reason: 'probe' },
  tester: { model: 'probe-tester', effort: 'medium', label: 'Probe Tester 4.0', reason: 'probe' },
  aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 5.0', reason: 'probe' },
};
export const roleOf = (c, models = PROBE) => Object.keys(models).find((r) => c.opts?.model === models[r].model && c.opts?.effort === models[r].effort);
export const testerCalls = (run, models = PROBE) => run.calls.filter((c) => roleOf(c, models) === 'tester');

const byType = (s) => (s?.type === 'array' ? [] : s?.type === 'boolean' ? false : s?.type === 'number' || s?.type === 'integer' ? 0 : s?.type === 'object' ? {} : s?.enum ? s.enum[0] : 'x');
export const fromSchema = (schema, known) => {
  const o = {};
  for (const k of schema?.required || []) o[k] = byType(schema.properties?.[k]);
  return { ...o, ...known };
};

export const workflowSrc = (file, dir = WF_DIR) => readFileSync(join(dir, file), 'utf8');

export const runWf = async (file, args, impl, { dir = WF_DIR } = {}) => {
  const run = { file, calls: [], logs: [], phases: [] };
  let src;
  try { src = workflowSrc(file, dir); } catch (e) { run.err = new Error(`${file} não existe em ${dir}`); return run; }
  try {
    src = src.replace(/^export const meta\s*=/m, 'const meta =');
    const agent = async (prompt, opts) => {
      const c = { file, prompt, opts: opts || {} };
      if (run.calls.push(c) > 1000) throw new Error('limit of 1000 agents');
      return impl(prompt, opts || {});
    };
    const parallel = (ts) => Promise.all(ts.map((t) => t().catch(() => null)));
    const ctx = vm.createContext({ args, agent, parallel, phase: (t) => run.phases.push(t), log: (m) => run.logs.push(m) });
    vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx);
    run.out = await vm.runInContext('(async () => {' + src + '\n})()', ctx);
  } catch (e) { run.err = e; }
  return run;
};

// ---------- Lote ----------
export const CMD = { test: 'node --test ATK-SUITE-7f3', e2e: 'npx playwright test ATK-E2E-7f3' };
export const own = (id) => [`src/${id}.js`, `tests/${id}.test.mjs`];
export const piece = (id, over = {}) => ({
  id, title: 'TITLE-' + id, goal: 'OBJ-' + id, bar: 'BAR-' + id, owns: own(id), files: [`src/${id}.js`], tdd: true,
  issue: 9100 + id.charCodeAt(1), objective: 'OBJ-' + id, input: 'branch main', criteria: [{ text: 'returns 3 rows', oracle: 'corpus', command: 'node --test' }],
  fails: 'a regression', outOfScope: 'none', env: 'Node', output: 'draft PR', ...over,
});
export const IDS = ['pa', 'pb', 'pc', 'pd', 'pe', 'pf', 'pg'];
export const pieces = (k) => IDS.slice(0, k).map((id) => piece(id));
export const batchArgs = (ps, over = {}) => ({
  checkpoint: { n: 1, title: 'T' }, root: '/proj', dashboardUrl: 'https://claude.ai/artifact/x', context: 'CTX-SPEC',
  models: structuredClone(PROBE), language: 'English', memory: { workspace: 'ws', project: 'pj' }, mode: 'rigorous',
  pieces: ps, testCommand: CMD.test, e2eCommand: CMD.e2e, ...over,
});

// Uma falha do cenário: { test, files, suite: [execuções da suíte onde falha, 1..2], e2e: [execuções do E2E, 1..3], isolated: passa sozinho? }
// declared(): o que o tester falso declara para o cenário. counts muda o número de execuções declaradas; lie põe os rótulos ao contrário.
export const declared = (failures, { suite = SUITE_RUNS, e2e = E2E_RUNS, lie = false } = {}) => {
  const runs = [];
  for (const [kind, total, cmd] of [[T.suite, suite, CMD.test], [T.e2e, e2e, CMD.e2e]]) {
    for (let k = 1; k <= total; k++) {
      runs.push({
        [T.kind]: kind, [T.command]: cmd,
        [T.failures]: failures.filter((f) => (f[kind] || []).includes(k)).map((f) => ({
          [T.test]: f.test, [T.files]: [...f.files], [T.output]: `MARK<${f.test}> ${kind} ${k}: AssertionError`,
          ...(lie ? { flaky: !f.truthFlaky, class: f.truthFlaky ? 'a' : 'c', piece: 'zz-lie' } : {}),
        })),
      });
    }
  }
  const isolated = failures.map((f) => ({ [T.test]: f.test, [T.passed]: !!f.isolated, [T.output]: `MARK<${f.test}> isolated: ${f.isolated ? 'pass' : 'AssertionError'}` }));
  const out = { [T.runs]: runs, [T.isolated]: isolated };
  if (lie) Object.assign(out, { flaky: failures.filter((f) => !f.truthFlaky).map((f) => f.test), regressions: failures.filter((f) => f.truthFlaky).map((f) => ({ piece: 'zz-lie', test: f.test, output: 'lie' })), passed: true });
  return out;
};

// Resposta falsa dos agentes: o tester declara `answer` (objeto ou função do prompt); o painel responde "ok"; qualquer outro papel
// (o lote não precisa dele) recebe só o que o schema exige.
export const fakeImpl = ({ answer = () => declared([]), models = PROBE } = {}) => (prompt, opts) => {
  const role = roleOf({ opts }, models);
  const model = role ? `${models[role].model} ${models[role].label || models[role].model}` : String(opts.model);
  if (role === 'tester') return fromSchema(opts.schema, { ...(typeof answer === 'function' ? answer(prompt, opts) : answer), model });
  if (role && role !== 'aux') return fromSchema(opts.schema, { model });
  return 'ok';
};

// ---------- Leitura do retorno (PERGUNTA 2) ----------
export const regsOf = (out) => (Array.isArray(out?.regressions) ? out.regressions : null);
export const flakyOf = (out) => (Array.isArray(out?.flaky) ? out.flaky.map((x) => (typeof x === 'string' ? x : x?.test)) : []);
const FALSE_FLAGS = ['passed', 'approved', 'ok', 'green'];
export const approved = (run) => !run.err && Array.isArray(regsOf(run.out)) && regsOf(run.out).length === 0 && !FALSE_FLAGS.some((k) => run.out[k] === false) && !run.out.incomplete;
export const refused = (run) => run.calls.length === 0 && (!!run.err || !Array.isArray(regsOf(run.out)));
export const pairs = (out) => (regsOf(out) || []).map((r) => `${r?.piece}|${r?.test}`).sort();
export const show = (run) => (run.err ? 'ERRO ' + String(run.err.message ?? run.err) : JSON.stringify(run.out)).slice(0, 1500);

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const subset = (r, total, proper) => { // subconjunto não vazio de 1..total; proper: nunca todos (falha intermitente)
  for (;;) { const s = []; for (let k = 1; k <= total; k++) if (r() < 0.5) s.push(k); if (s.length && (!proper || s.length < total)) return s; }
};
// Um lote aleatório e o veredito que o contrato manda (critérios 3 e 4), da definição: flaky ⇔ passa isolado e não toca nos owns
// do lote; uma falha não flaky que toca nos owns de uma peça é uma regressão dessa peça. Fica de fora o que o contrato não fixa:
// um teste que toca em 2 peças (PERGUNTA 5) e um teste que falha em TODAS as execuções e passa isolado (PERGUNTA 6).
export const genBatch = (r, mode) => {
  const ps = pieces(1 + Math.floor(r() * LIMIT[mode]));
  const nf = Math.floor(r() * 5), failures = [];
  for (let i = 0; i < nf; i++) {
    const kind = r() < 0.6 ? T.suite : T.e2e, total = kind === T.suite ? SUITE_RUNS : E2E_RUNS;
    const where = pick(r, ['own', 'touches', 'outside']), p = pick(r, ps);
    const testFile = kind === T.e2e ? `tests/e2e/x${i}.spec.ts` : where === 'own' ? p.owns[1] : `tests/core${i}.test.mjs`;
    const files = where === 'outside' ? [testFile, `src/core${i}.js`] : where === 'own' ? [testFile, p.owns[0]] : [testFile, p.owns[0], `src/core${i}.js`];
    const isolated = r() < 0.5;
    const inDiff = where !== 'outside';
    failures.push({ test: `${testFile} > caso ${i}`, files, [kind]: subset(r, total, isolated), isolated, truthFlaky: isolated && !inDiff, owner: inDiff ? p.id : null });
  }
  return { ps, failures };
};
// O que o contrato manda para um conjunto de falhas: flaky, pares peça|teste das regressões atribuíveis, falhas sem peça, aprovado
export const expected = (failures) => {
  const flaky = failures.filter((f) => f.truthFlaky).map((f) => f.test).sort();
  const regs = failures.filter((f) => !f.truthFlaky && f.owner).map((f) => `${f.owner}|${f.test}`).sort();
  const loose = failures.filter((f) => !f.truthFlaky && !f.owner).map((f) => f.test).sort();
  return { flaky, regs, loose, approved: failures.every((f) => f.truthFlaky) };
};

// ---------- Projetos gerados (como os helpers do F-03 e do F-07) ----------
export const MODELS = () => ({
  developer: { model: 'haiku', effort: 'xhigh', label: 'Dev Logic 1.0', reason: 'logic and server code run well on Haiku xhigh' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI needs Opus high' },
  critic: { model: 'opus', effort: 'max', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' },
  tester: { model: 'haiku', effort: 'medium', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'low', reason: 'panel records only' },
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
// "ok" ou "FAIL" das linhas do check.cjs cujo nome começa por `prefix` (como o state() do corpus.test.mjs, mas por prefixo)
export const lines = (out, prefix) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}(.*)$/)).filter((m) => m && m[2].startsWith(prefix)).map((m) => [m[1], m[2]]);

// Prelúdio logo a seguir ao meta (técnica do c7 do F-07): muda o comportamento sem tocar no código do dev
const META = /^export const meta = \{[\s\S]*?^\}/m;
export const withPrelude = (dest, file, prelude) => {
  const f = join(dest, '.claude/workflows', file);
  if (!existsSync(f)) throw new Error(`${file} não existe no projeto gerado`);
  const src = readFileSync(f, 'utf8'), m = src.match(META);
  if (!m) throw new Error(`${file}: sem meta`);
  writeFileSync(f, src.slice(0, m.index + m[0].length) + '\n;' + prelude + ';\n' + src.slice(m.index + m[0].length));
};
export const wrap = (body) => `{ const __a = agent; agent = ${body} }`;
