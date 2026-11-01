// Ronda −1 do F-21b (#74): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude`, corre o graphify real ou usa a rede: os workflows correm num runtime falso (vm), como a
// simulação do check.cjs, e o git só lê o próprio repositório (git show da BASE).
//
// A BASE é SEMPRE `git merge-base HEAD origin/main` (regra 8 do brief), nunca um sha fixo.
// Testes de âmbito do ticket (só fazem sentido antes do merge) fazem skip, com motivo, quando o F-21b já está na BASE (regra 9).
//
// LEITURA DO CONTRATO (corpo da #74 e resposta do orquestrador de 2026-10-31: UMA chamada `graph:update` por execução de workflow).
// Os textos abaixo são LITERAIS do corpo da issue:
//   label `graph:update`; prompt com `node "<root>/.claude/graph.mjs" update`; log `WARNING graph:update: <resposta truncada a 100>`;
//   recusa `incomplete args: ... piece <id>, affected: ...`; prompts com `--graph "<args.graph>"` ou `No graph for this run.`;
//   schema BUILD com `graphNodes`; log `WARNING <id> r<N>: the developer consulted no graph node`.
// Os papéis reconhecem-se pelo prefixo do label (os da BASE: build:, critic:, attacks:, pony:, pony-critic:, batch:, panel:).
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const WORK = mkdtempSync(join(tmpdir(), 'critico-f21b-'));
const HOME = join(WORK, 'home'), TMP = join(WORK, 'tmp');
mkdirSync(HOME); mkdirSync(TMP);
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = HOME;
for (const k of ['TMP', 'TEMP', 'TMPDIR']) process.env[k] = TMP;
process.env.DISABLE_AUTOUPDATER = '1';
const cleanup = () => { try { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* o exit volta a tentar */ } };
after(cleanup);
process.on('exit', cleanup);
let n = 0;
export const tmp = (prefix = 'd') => { const d = join(WORK, `${prefix}${++n}`); mkdirSync(d); return d; };
// Sem NODE_TEST_CONTEXT: herdado, um processo node filho falaria o protocolo interno do runner
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
export const git = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
export const lines = (s) => s.replace(/\r\n/g, '\n').split('\n');

// ---------- A BASE: o merge-base com origin/main ----------
export const MB = git('merge-base', 'HEAD', 'origin/main').trim();
export const baseFile = (rel) => git('show', `${MB}:${rel}`);
const WF = (name) => `templates/.claude/workflows/gauntlet-${name}.js`;
export const srcNow = (name) => read(WF(name));
const baseSrcs = {};
export const srcBase = (name) => (baseSrcs[name] ??= baseFile(WF(name)));
// O F-21b já está na BASE (a branch foi fundida): os testes de âmbito do ticket deixam de fazer sentido
export const F21B_NA_BASE = srcBase('build').includes('graph:update');
export const SCOPE_SKIP = F21B_NA_BASE && `o F-21b já está na base ${MB.slice(0, 7)}: teste de âmbito do ticket`;

// ---------- Textos literais do corpo da #74 ----------
export const LABEL = 'graph:update';
export const UPDATE_CMD = (root) => `node "${root}/.claude/graph.mjs" update`;
export const LOG_UPDATE = (resp) => `WARNING graph:update: ${String(resp).slice(0, 100)}`;
export const NO_GRAPH = 'No graph for this run.';
export const GRAPH_FLAG = (g) => `--graph "${g}"`;
export const LOG_NO_NODE = (id, r) => `WARNING ${id} r${r}: the developer consulted no graph node`;
// Os três formatos de caminho absoluto que a #74 aceita: Windows X:\ e X:/, e POSIX /
export const GRAPHS = ['/srv/proj/graphify-out/graph.json', 'E:\\proj\\graphify-out\\graph.json', 'E:/proj/graphify-out/graph.json'];
export const RELATIVE = ['graphify-out/graph.json', './graphify-out/graph.json', 'graph.json', '..\\proj\\graphify-out\\graph.json', 'C:graphify-out\\graph.json'];

// ---------- Modelos de sonda: cada papel com um par modelo/esforço distinto ----------
export const PROBE = {
  developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0', reason: 'probe' },
  developerUi: { model: 'probe-devui', effort: 'high', label: 'Probe UI 2.0', reason: 'probe' },
  critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 3.0', reason: 'probe' },
  tester: { model: 'probe-tester', effort: 'medium', label: 'Probe Tester 4.0', reason: 'probe' },
  aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 5.0', reason: 'probe' },
};
const declared = (r) => `${r.model} ${r.label}`;

// ---------- Runtime falso (a técnica do check.cjs: vm só com args, agent, parallel, phase e log; sem relógio nem acaso) ----------
export const runWf = async (src, args, impl) => {
  const run = { calls: [], logs: [], phases: [] };
  try {
    const code = src.replace(/^export const meta\s*=/m, 'const meta =');
    const agent = async (prompt, opts) => {
      const c = { prompt: String(prompt), opts: opts || {} };
      if (run.calls.push(c) > 1000) throw new Error('limit of 1000 agents');
      return impl(c.prompt, c.opts, run);
    };
    const parallel = (ts) => Promise.all(ts.map((t) => t().catch(() => null)));
    const ctx = vm.createContext({ args: structuredClone(args), agent, parallel, phase: (t) => run.phases.push(t), log: (m) => run.logs.push(String(m)) });
    vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx);
    run.out = await vm.runInContext('(async () => {' + code + '\n})()', ctx);
  } catch (e) { run.err = e; }
  return run;
};
export const why = (run) => JSON.stringify({ err: run.err && String(run.err.message ?? run.err).slice(0, 600), labels: run.calls.map((c) => c.opts.label).slice(0, 20), logs: run.logs.slice(-8) }).slice(0, 2500);
export const labeled = (run, re) => run.calls.filter((c) => re.test(String(c.opts.label)));
export const updates = (run) => run.calls.filter((c) => c.opts.label === LABEL);
export const refused = (run) => run.calls.length === 0 && !!run.err;
export const errText = (run) => String(run.err?.message ?? run.err ?? '');
// Os 5 prompts da #74 (C2): dev e crítico do build, crítico da Ronda −1, dev e crítico do ponytail
export const ROLE_RE = { dev: /^build:/, critic: /^critic:/, attacks: /^attacks:/, pony: /^pony:/, ponyCritic: /^pony-critic:/ };

// ---------- Args ----------
export const H = (r) => ('c' + r.toString(16)).repeat(20);
export const D = (r) => ('d' + r.toString(16)).repeat(32);
export const aff = (id) => ({ nodes: [`NODE-${id}-1`, `fn ${id}Parse`], files: [`lib/aff-${id}.mjs`, `docs/aff-${id}.md`] });
export const piece = (id, over = {}) => ({
  id, title: 'TITLE-' + id, goal: 'GOAL-' + id, bar: 'BAR-' + id, owns: [`src/${id}.js`], tdd: true, issue: 9300,
  objective: 'OBJ-' + id, input: 'branch main at HEAD abc1234; file src/' + id + '.js',
  criteria: [{ text: 'The export returns 3 rows for the sample file', oracle: 'corpus', command: 'node --test test/c1.test.mjs' }],
  fails: 'a criterion that fails', outOfScope: 'the PDF export', env: 'Node 24', output: 'draft PR', ...over,
});
export const unit = (id, over = {}) => ({ id, title: 'UNIT-' + id, paths: [`src/${id}.js`], ...over });
const escalation = () => ({ sameCriterionFailures: { value: 2, description: 'p' }, attacksRedOnDelivery: { value: false, description: 'p' }, minutesWithoutProgress: { value: 9999, description: 'p' }, visualBelowReference: { value: false, description: 'p' } });
const common = (over) => ({ checkpoint: { n: 1, title: 'T' }, root: '/proj', dashboardUrl: 'https://claude.ai/artifact/x', context: 'CTX-SPEC', models: structuredClone(PROBE), language: 'English', memory: { workspace: 'ws', project: 'pj' }, ...over });
export const r0 = (id) => ({ id, attacks: [{ id: `${id}-a1`, file: `tests/critico/${id}-r0/a1.test.mjs`, passesOnBase: false }, { id: `${id}-g1`, file: `tests/critico/${id}-r0/g1.test.mjs`, guard: true, passesOnBase: true }], failingOnBase: true, gaps: [] });
export const buildArgs = (pieces, over = {}) => common({ mode: 'rigorous', escalation: escalation(), attacks: pieces.map((p) => r0(p.id)), pieces, ...over });
export const attacksArgs = (pieces, over = {}) => common({ pieces, ...over });
export const ponyArgs = (units, over = {}) => common({ testCommand: 'SUITE-CMD', units, ...over });
export const batchArgs = (over = {}) => common({ mode: 'rigorous', testCommand: 'SUITE-CMD', pieces: [{ id: 'pa', title: 'PA', owns: ['src/pa.js'] }, { id: 'pb', title: 'PB', owns: ['src/pb.js'] }], ...over });

// ---------- Agentes falsos ----------
// graph: a resposta à chamada graph:update (valor, ou função do prompt); winAt: a ronda em que o crítico do build aprova (antes, um
// bloqueante no critério crit(ronda), por omissão C<ronda>, para não repetir critério); ponyWinAt: idem no ponytail; nodes(id, r): o graphNodes do dev
// (undefined = campo ausente, como nos runtimes falsos antigos); seen: guarda cada ronda de cada peça.
export const fake = ({ graph = 'graph: updated 42 nodes at ' + H(9), winAt = 1, ponyWinAt = 1, nodes = () => undefined, crit = (r) => 'C' + r } = {}) => (prompt, opts) => {
  const label = String(opts.label || '');
  const m = label.match(/^([a-z-]+):(.+?)(?::r(\d+))?$/), kind = m && m[1], id = m && m[2], r = m && m[3] ? +m[3] : 0;
  if (label === LABEL) return typeof graph === 'function' ? graph(prompt) : graph;
  if (kind === 'build') {
    const g = nodes(id, r);
    return { filesChanged: [`src/${id}.js`], testCommand: 'TEST-DEV', redEvidence: 'RED-EV', greenEvidence: 'GREEN-EV', head: H(r), diffHash: D(r), responses: r > 1 && r - 1 < winAt ? [{ finding: `F${r - 1}-1`, answer: 'fixed' }] : [], model: declared(PROBE.developer), summary: `DEV-NARRATIVE-${id}-r${r}`, ...(g === undefined ? {} : { graphNodes: g }) };
  }
  if (kind === 'critic') {
    const ours = new RegExp(`^A: .*src/${id}\\.js`, 'm').test(prompt) ? 'A' : 'B', win = r >= winAt;
    return { winner: ours, testsPass: true, blocking: win ? [] : [{ criterion: crit(r), materiality: 2, category: 'criterion', description: `DESC-${r}`, repro: `REPRO-${r}` }], minor: [], barQuestions: [], preExisting: [], followUp: [], sha: H(r), visualBelowReference: false, attacks: [{ id: `${id}-a1`, passesOnDelivery: true }, { id: `${id}-g1`, passesOnDelivery: true }], biggestGap: `GAP-${r}`, reasoning: `CRITIC-REASONING-${r}`, model: declared(PROBE.critic) };
  }
  if (kind === 'attacks') return { attacks: [{ id: `${id}-a1`, file: `tests/critico/${id}-r0/a1.test.mjs`, passesOnBase: false }], gaps: [], model: declared(PROBE.critic) };
  if (kind === 'pony') return { cuts: [`CUT-${id}-r${r}`], kept: [], linesBefore: 20, linesAfter: 18, testOutput: 'SUITE-CMD: ok', model: declared(PROBE.developer) };
  if (kind === 'pony-critic') {
    const cur = /^A: version at \[/m.test(prompt) ? 'A' : 'B', win = r >= ponyWinAt;
    return { winner: cur, testsPass: true, behaviourPreserved: true, wronglyCut: [], remainingCuts: win ? [] : [`LEFT-${r}`], biggestGap: `PGAP-${r}`, model: declared(PROBE.critic) };
  }
  if (label === 'batch:tester') return { runs: [1, 2].map((pass) => ({ kind: 'suite', command: 'SUITE-CMD', pass, failures: [] })), isolated: [], main: [], model: declared(PROBE.tester) };
  return 'ok';
};
// Os objetos do vm têm outros protótipos: compara-se sempre a cópia JSON (deepStrictEqual olharia para o protótipo)
export const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
export const resultOf = (run, id) => plain((Array.isArray(run.out?.results) ? run.out.results : []).find((x) => x && x.id === id));
export const omit = (o, ...ks) => o && Object.fromEntries(Object.entries(o).filter(([k]) => !ks.includes(k)));

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

// ---------- Projetos gerados (scaffold do pacote) e o check.cjs ----------
export const CORPUS = join(ROOT, 'scripts/corpus');
export const corpusAnswers = (name) => readJson(join(CORPUS, 'answers', name + '.json'));
export const mutations = () => {
  const dir = join(CORPUS, 'mutations');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ name: basename(f, '.json'), ...readJson(join(dir, f)) })) : [];
};
export const generate = async (answers) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  return dest;
};
export const check = (cwd, script = '.claude/check.cjs') => {
  const r = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// As linhas do check.cjs: [{ state: 'ok' | 'FAIL', text }]
export const linesOf = (out) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}(.*)$/)).filter(Boolean).map((m) => ({ state: m[1], text: m[2] }));
// O estado da linha `name`, como o corpus.test.mjs o lê: o nome exato, com ou sem o detalhe « (...)»
export const state = (out, name) => linesOf(out).find((l) => l.text === name || l.text.startsWith(name + ' ('))?.state;
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).join('\n') || out.slice(-1500);
export const replaceIn = (file, find, replace) => { const t = readFileSync(file, 'utf8'); if (!t.includes(find)) return false; writeFileSync(file, t.replaceAll(find, replace)); return true; };
// As linhas que o check.cjs da BASE, corrido no MESMO projeto gerado, não imprime (as linhas novas)
export const freshLines = (dest, now) => {
  writeFileSync(join(dest, '.claude/check-base.cjs'), baseFile('templates/.claude/check.cjs'));
  const before = new Set(linesOf(check(dest, '.claude/check-base.cjs').out).map((l) => l.text));
  if (before.size <= 50) throw new Error('o check.cjs da BASE não correu: ' + before.size + ' linhas');
  return linesOf(now).map((l) => l.text).filter((t) => !before.has(t));
};

// ---------- Ficheiros do pacote ----------
// O §5 Step 2 do FRAMEWORK: de «### Step 2.» até ao cabeçalho seguinte do mesmo nível ou superior
export const step2 = (text = read('templates/FRAMEWORK.md')) => {
  const i = text.search(/^### Step 2\./m);
  if (i < 0) return '';
  const nl = text.indexOf('\n', i), j = nl < 0 ? -1 : text.slice(nl + 1).search(/^#{1,3} /m);
  return text.slice(i, j < 0 ? undefined : nl + 1 + j);
};
export const count = (s, sub) => s.split(sub).length - 1;