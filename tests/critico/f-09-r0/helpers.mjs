// Ronda −1 do F-09 (#10), ADIANTADA: o F-08 (#9) ainda não existe. Utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude`: os workflows correm num runtime falso (vm), como a simulação do check.cjs.
//
// LEITURA DO CONTRATO: o corpo da #10 mais as respostas do orquestrador às P1–P10 (comentário de 2026-10-29 na #10; cópia em
// orquestrador-resp-f08-f09-f15b.md). Cada ponto ajusta-se AQUI, num só sítio:
//   - args do gauntlet-batch: os de base dos outros workflows (checkpoint, root, dashboardUrl, context, models com os 5 papéis,
//     language, memory) mais `mode` (rigorous | accelerated), `pieces` (as peças do lote, cada uma com id, title e owns; levam
//     também os campos do build e do contrato do F-07, que o lote pode ignorar), `testCommand` e, opcional, `e2eCommand`;
//   - R1: UM agente tester por lote, com `models.tester` (modelo e esforço). Declara DADOS, nos campos de T abaixo, e o workflow
//     calcula a partir deles; nunca usa um rótulo do tester:
//       runs: [{ kind: 'suite' | 'e2e', command, failures: [{ test, files: [ficheiros que o teste toca, o dele incluído], output }] }]
//       isolated: [{ test, passed: boolean, output }]   (uma repetição isolada de cada teste que falhou)
//       main: [{ test, results: [boolean: passou?, um por execução na main], output }]   (R3, R6 e emenda P7: a prova na main)
//     A forma de `main` é a leitura do crítico (a R3/R6 dizem «falha igual na main», «intermitente na main», «nunca na main»):
//     falha igual = todas as execuções na main falham; intermitente = umas passam e outras falham; nunca = todas passam;
//   - R2: retorno `{ batch: { verdict: 'pass' | 'fail', failures: [{ test, class: 'a' | 'b' | 'c', evidence }] }, regressions:
//     [{ piece, test, output }] }` (as regressões do critério 3 são as falhas de classe a, uma por peça; R5: um teste que toca em 2
//     peças dá uma regressão a cada uma);
//   - R4: menos execuções do que as do contrato → `verdict: 'fail'` com `reason: 'runs'` (no batch ou no topo);
//   - classificação (critério 4 + R3 + R6), por teste que falhou:
//       toca nos owns de uma peça → a (dessa peça);
//       fora do diff, passa isolado, falha só em algumas execuções → c;
//       fora do diff, passa isolado, falha em TODAS as execuções → c se a main é intermitente, b se a main falha sempre, a se a main
//       nunca falha ou não há prova na main;
//       fora do diff, falha isolado → b se a main falha sempre; c se a main é intermitente (lacuna 1, fechada pelo orquestrador:
//       obriga à issue flaky e não bloqueia); a se a main nunca falha ou não há prova.
//     O veredito é `fail` quando há uma falha a (ou faltam execuções); sem nenhuma a → `pass`, também com b provadas na main
//     (lacuna 2, fechada pelo orquestrador);
//   - recusa (critério 1) = zero agent() e nenhum retorno com `batch` (erro lançado ou retorno de recusa).
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
export const BASE = '9f176c1'; // a main com o F-01 a F-05 e o F-10 a F-12

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
export const T = { runs: 'runs', kind: 'kind', suite: 'suite', e2e: 'e2e', command: 'command', failures: 'failures', test: 'test', files: 'files', output: 'output', isolated: 'isolated', passed: 'passed', main: 'main', results: 'results' };

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

// Uma falha do cenário: { test, files, suite: [execuções da suíte onde falha, 1..2], e2e: [execuções do E2E, 1..3], isolated: passa
// sozinho?, main: undefined (sem prova) | 'all' (falha sempre na main) | 'some' (intermitente na main) | 'none' (nunca falha na
// main), cls: a classe que o contrato manda, owners: as peças cujos owns o teste toca }.
// declared(): o que o tester falso declara. counts muda o número de execuções declaradas; lie põe os rótulos ao contrário.
const LIE = { a: 'c', b: 'a', c: 'a' };
export const declared = (failures, { suite = SUITE_RUNS, e2e = E2E_RUNS, lie = false } = {}) => {
  const runs = [];
  for (const [kind, total, cmd] of [[T.suite, suite, CMD.test], [T.e2e, e2e, CMD.e2e]]) {
    for (let k = 1; k <= total; k++) {
      runs.push({
        [T.kind]: kind, [T.command]: cmd,
        [T.failures]: failures.filter((f) => (f[kind] || []).includes(k)).map((f) => ({
          [T.test]: f.test, [T.files]: [...f.files], [T.output]: `MARK<${f.test}> ${kind} ${k}: AssertionError`,
          ...(lie ? { flaky: f.cls !== 'c', class: LIE[f.cls], piece: 'zz-lie' } : {}),
        })),
      });
    }
  }
  const isolated = failures.map((f) => ({ [T.test]: f.test, [T.passed]: !!f.isolated, [T.output]: `MARK<${f.test}> isolated: ${f.isolated ? 'pass' : 'AssertionError'}` }));
  const main = failures.filter((f) => f.main).map((f) => {
    const n = f.e2e ? E2E_RUNS : SUITE_RUNS;
    const results = Array.from({ length: n }, (_, i) => (f.main === 'none' ? true : f.main === 'all' ? false : i % 2 === 0));
    return { [T.test]: f.test, [T.results]: results, [T.output]: `MARK<${f.test}> main: ${results.map((x) => (x ? 'pass' : 'fail')).join(',')}` };
  });
  const out = { [T.runs]: runs, [T.isolated]: isolated, [T.main]: main };
  if (lie) Object.assign(out, {
    batch: { verdict: failures.some((f) => f.cls === 'a') ? 'pass' : 'fail', failures: failures.map((f) => ({ test: f.test, class: LIE[f.cls], evidence: 'lie' })) },
    flaky: failures.filter((f) => f.cls !== 'c').map((f) => f.test), regressions: failures.filter((f) => f.cls !== 'a').map((f) => ({ piece: 'zz-lie', test: f.test, output: 'lie' })), verdict: 'pass', passed: true,
  });
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

// ---------- Leitura do retorno (R2, R4) ----------
export const batchOf = (out) => (out && typeof out.batch === 'object' && out.batch ? out.batch : null);
export const regsOf = (out) => (Array.isArray(out?.regressions) ? out.regressions : null);
// teste → classe, a partir de batch.failures (um teste com duas classes diferentes fica com as duas, separadas por «/»)
export const classesOf = (out) => {
  const m = {};
  for (const x of batchOf(out)?.failures || []) m[x?.test] = m[x?.test] && m[x?.test] !== x?.class ? m[x?.test] + '/' + x?.class : x?.class;
  return m;
};
export const verdictOf = (run) => (run.err ? 'erro' : batchOf(run.out)?.verdict);
export const approved = (run) => verdictOf(run) === 'pass';
export const reasonOf = (run) => batchOf(run.out)?.reason ?? run.out?.reason;
export const refused = (run) => run.calls.length === 0 && (!!run.err || !batchOf(run.out));
export const pairs = (out) => [...new Set((regsOf(out) || []).map((r) => `${r?.piece}|${r?.test}`))].sort();
export const show = (run) => (run.err ? 'ERRO ' + String(run.err.message ?? run.err) : JSON.stringify(run.out)).slice(0, 1500);

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const subset = (r, total, proper) => { // subconjunto não vazio de 1..total; proper: nunca todos (falha intermitente)
  for (;;) { const s = []; for (let k = 1; k <= total; k++) if (r() < 0.5) s.push(k); if (s.length && (!proper || s.length < total)) return s; }
};
// A classe que o contrato manda (critério 4 + R3 + R6; ver a LEITURA DO CONTRATO no topo). null = o contrato não fixa.
export const classFor = ({ owners, isolated, all, main }) => {
  if (owners.length) return 'a';
  if (isolated && !all) return 'c';
  if (isolated) return main === 'some' ? 'c' : main === 'all' ? 'b' : 'a';
  return main === 'all' ? 'b' : main === 'some' ? 'c' : 'a';
};
// Um lote aleatório: testes dentro (de 1 ou 2 peças), a tocar num ficheiro de uma peça, ou fora do diff; com ou sem prova na main.
export const genBatch = (r, mode) => {
  const ps = pieces(1 + Math.floor(r() * LIMIT[mode]));
  const nf = Math.floor(r() * 5), failures = [];
  for (let i = 0; i < nf; i++) {
    const kind = r() < 0.6 ? T.suite : T.e2e, total = kind === T.suite ? SUITE_RUNS : E2E_RUNS;
    const where = pick(r, ['own', 'touches', 'two', 'outside', 'outside']), p = pick(r, ps), q = pick(r, ps);
    const testFile = kind === T.e2e ? `tests/e2e/x${i}.spec.ts` : where === 'own' ? p.owns[1] : `tests/core${i}.test.mjs`;
    const files = where === 'outside' ? [testFile, `src/core${i}.js`] : where === 'own' ? [testFile, p.owns[0]] : where === 'two' ? [testFile, p.owns[0], q.owns[0]] : [testFile, p.owns[0], `src/core${i}.js`];
    const owners = where === 'outside' ? [] : [...new Set(where === 'two' ? [p.id, q.id] : [p.id])];
    const isolated = r() < 0.5, all = r() < 0.4;
    const main = where === 'outside' ? pick(r, [undefined, 'all', 'some', 'none']) : undefined;
    const cls = classFor({ owners, isolated, all, main });
    if (cls === null) continue;
    const runsIn = all ? Array.from({ length: total }, (_, k) => k + 1) : subset(r, total, true);
    failures.push({ test: `${testFile} > caso ${i}`, files, [kind]: runsIn, isolated, main, cls, owners });
  }
  return { ps, failures };
};
// O que o contrato manda: classes por teste, pares peça|teste das regressões atribuíveis e veredito
export const expected = (failures) => {
  const classes = Object.fromEntries(failures.map((f) => [f.test, f.cls]));
  const regs = failures.filter((f) => f.cls === 'a').flatMap((f) => f.owners.map((o) => `${o}|${f.test}`)).sort();
  const verdict = failures.some((f) => f.cls === 'a') ? 'fail' : 'pass';
  return { classes, regs, verdict };
};
// ---------- Projetos gerados (como os helpers do F-03 e do F-07) ----------
export const MODELS = () => ({
  developer: { model: 'haiku', effort: 'xhigh', label: 'Dev Logic 1.0', reason: 'logic and server code run well on Haiku xhigh' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI needs Opus high' },
  critic: { model: 'opus', effort: 'max', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' },
  tester: { model: 'haiku', effort: 'medium', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'low', reason: 'panel records only' },
});
export const ANSWERS = (over = {}) => ({ projectName: 'Acme Billing', repo: 'acme/billing', language: 'English', mode: 'rigorous', models: MODELS(), memory: { workspace: 'acme', project: 'billing' }, ...over });

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
export const generate = async (answers) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  const fj = readJson(join(dest, '.claude/forge.json'));
  // a base mudou com o F-06 (nota do dev, Ronda 0): o check também mede a língua dos briefs e do .checkpoints/README.md, que o passo de tradução cobre (como nos helpers do f-02, f-03 e f-07)
  const briefs = ['dev', 'critic', 'round-minus-1', 'batch'].map((b) => `.claude/briefs/${b}.md`);
  if (/^pt/i.test(fj.langTag)) for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md', ...briefs]) if (existsSync(join(dest, rel))) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
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
