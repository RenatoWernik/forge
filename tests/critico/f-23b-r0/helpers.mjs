// Ronda −1 do F-23b (#78): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude` nem usa a rede: os workflows correm num runtime falso (vm), como a simulação do check.cjs,
// e o git só lê o próprio repositório.
//
// BASE: `git merge-base HEAD origin/main` (regra 8 do brief: nunca um sha fixo). A referência das guardas é o gauntlet-build.js
// dessa base, corrido no mesmo runtime falso.
//
// LEITURA DO CONTRATO: corpo da #78 e RESPOSTA do orquestrador às PERGUNTAS da Ronda −1 (2026-11-01, prevalece). Nomes LITERAIS:
//   repro: UMA chamada `repro:<id>:r<N>` por veredito com `blocking` não vazio, com models.tester; resposta [{finding, reproduced, output}];
//   bloqueante não reproduzido (materialidade ≠ 1) → sai do blocking, vai para minor com notReproduced: true, metrics.criticNotReproduced + 1;
//   materialidade 1 não reproduzida → fica, com unconfirmed: true, e não conta na métrica (resposta 5);
//   o prompt do repro cola o root dos args (o caminho da worktree, resposta 6); os ids F<r>-<n> não mudam quando um achado sai (resposta 9);
//   resposta em falta, propriedade da lista ausente ou que não é lista, ou sem um dos ids → mantém TODOS;
//   args.knownClasses [{class, entries, strongest}], class kebab-case, senão `incomplete args: knownClasses: ...` antes de qualquer agente;
//   sem knownClasses os prompts de crítico dizem `No known classes yet.`; blocking[].class obrigatório; metrics.classes {<class>: n}.
// Os papéis reconhecem-se pelo modelo e pelo esforço (modelos de sonda distintos); o repro é o papel tester.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const WORK = mkdtempSync(join(tmpdir(), 'critico-f23b-'));
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
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
export const node = (args, opts = {}) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 120000, ...opts });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
};

// ---------- A BASE (merge-base com a origin/main) ----------
let base;
export const BASE = () => {
  if (base === undefined) { const r = git('merge-base', 'HEAD', 'origin/main'); if (r.status !== 0) throw new Error('git merge-base HEAD origin/main falhou: ' + r.stderr); base = r.stdout.trim(); }
  return base;
};
export const baseFile = (rel) => { const r = git('show', `${BASE()}:${rel}`); if (r.status !== 0) throw new Error(`git show ${BASE()}:${rel} falhou: ${r.stderr}`); return r.stdout; };
const BUILD_REL = 'templates/.claude/workflows/gauntlet-build.js', ATTACKS_REL = 'templates/.claude/workflows/gauntlet-attacks.js';
export const srcNow = () => read(BUILD_REL);
export const attacksNow = () => read(ATTACKS_REL);
let baseSrc;
export const srcBase = () => (baseSrc ??= baseFile(BUILD_REL));
// Regra 9 do brief: os testes de âmbito do ticket só fazem sentido enquanto a base não tem o F-23b (depois do merge, a main já o contém)
export const baseHasF23b = () => /\bcriticNotReproduced\b/.test(srcBase()); // a medida que o C1 obriga a devolver
export const SKIP_SCOPE = 'a base (merge-base com a origin/main) já contém o F-23b: este teste de âmbito só corre na branch do ticket';

// ---------- Modelos de sonda: cada papel com um par modelo/esforço distinto ----------
export const PROBE = {
  developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0', reason: 'probe' },
  developerUi: { model: 'probe-devui', effort: 'high', label: 'Probe UI 2.0', reason: 'probe' },
  critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 3.0', reason: 'probe' },
  tester: { model: 'probe-tester', effort: 'medium', label: 'Probe Tester 4.0', reason: 'probe' },
  aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 5.0', reason: 'probe' },
};
export const roleOf = (opts) => ['developer', 'developerUi', 'critic', 'tester', 'aux'].find((r) => opts?.model === PROBE[r].model && opts?.effort === PROBE[r].effort);
export const declared = (r) => `${r.model} ${r.label || r.model}`;
const isDev = (c) => ['developer', 'developerUi'].includes(roleOf(c.opts));

// ---------- Runtime falso (a técnica do check.cjs: vm só com args, agent, parallel, phase e log; sem relógio nem acaso) ----------
export const runWf = async (src, args, impl) => {
  const run = { calls: [], logs: [], phases: [], seen: {} };
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
// Os objetos criados dentro da vm têm outros protótipos: compara-se sempre a forma JSON
export const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
export const resultOf = (run, id = 'pa') => (Array.isArray(run.out?.results) ? run.out.results : []).find((r) => r && r.id === id);
export const why = (run, id = 'pa') => JSON.stringify({ err: run.err && String(run.err.message ?? run.err).slice(0, 400), result: resultOf(run, id) && { ...resultOf(run, id), lastVerdict: undefined }, logs: run.logs.slice(-8) }).slice(0, 2500);
export const devCalls = (run) => run.calls.filter(isDev);
export const criticCalls = (run) => run.calls.filter((c) => roleOf(c.opts) === 'critic');
export const testerCalls = (run) => run.calls.filter((c) => roleOf(c.opts) === 'tester');
export const reproCalls = (run) => run.calls.filter((c) => /^repro:/.test(String(c.opts.label)));
// O desfecho de uma peça com as medidas de antes do F-23b (as chaves novas de metrics comparam-se à parte)
const OLD_METRICS = ['rounds', 'sameCriterionFailures', 'attacksRedOnDelivery', 'minutesWithoutProgress'];
export const outcome = (r) => r && JSON.parse(JSON.stringify({ won: r.won, rounds: r.rounds, stopped: r.stopped ?? null, criterion: r.criterion ?? null, condition: r.condition ?? null, blocked: r.blocked ?? null, metrics: r.metrics ? Object.fromEntries(OLD_METRICS.map((k) => [k, r.metrics[k]])) : null }));

// ---------- Contrato da peça e args ----------
const CRIT_TEXT = ['The export returns 3 rows for the sample file', 'The header row matches the reference CSV byte for byte', 'An empty file exports only the header', 'The totals row sums the amount column'];
export const contract = (id = 'pa', issue = 9101, over = {}) => ({
  id, title: 'TITLE-' + id, goal: 'OBJ-' + id, bar: 'BAR-' + id, owns: ['src/a.js'], tdd: true, issue,
  objective: 'OBJ-' + id, input: 'branch main at HEAD abc1234; files src/a.js and test/a.test.mjs',
  criteria: CRIT_TEXT.map((text, i) => ({ text, oracle: 'corpus', command: `node --test test/c${i + 1}.test.mjs` })),
  fails: 'a criterion that fails or has no evidence; a regression', outOfScope: 'pagination and the PDF export',
  env: 'Node 24, standard library only', output: 'draft PR and a Round 0 comment on the issue', ...over,
});
export const CONDITIONS = ['sameCriterionFailures', 'attacksRedOnDelivery', 'minutesWithoutProgress', 'visualBelowReference'];
// Escalada NEUTRA por omissão: nenhuma condição dispara nos cenários
export const escalation = (over = {}) => {
  const v = { sameCriterionFailures: 2, attacksRedOnDelivery: false, minutesWithoutProgress: 9999, visualBelowReference: false, ...over };
  return Object.fromEntries(CONDITIONS.map((c) => [c, { value: v[c], description: 'probe ' + c }]));
};
export const atksOf = (id) => [{ id: `${id}-a1`, file: `tests/critico/${id}-r0/a1.test.mjs`, passesOnBase: false }, { id: `${id}-g1`, file: `tests/critico/${id}-r0/g1.test.mjs`, guard: true, passesOnBase: true }];
export const baseArgs = (pieces, { mode = 'rigorous', esc = {}, ...over } = {}) => ({
  checkpoint: { n: 1, title: 'T' }, root: '/proj', dashboardUrl: 'https://claude.ai/artifact/x', context: 'CTX-SPEC',
  models: structuredClone(PROBE), language: 'English', memory: { workspace: 'ws', project: 'pj' },
  mode, escalation: escalation(esc), attacks: pieces.map((p) => ({ id: p.id, attacks: atksOf(p.id), failingOnBase: true, gaps: [] })), pieces, ...over,
});
// As classes conhecidas, na forma da saída do `learn.mjs classes` ({class, entries, strongest})
export const KNOWN = [
  { class: 'port-race-probe', entries: ['E-001', 'E-007'], strongest: 'test' },
  { class: 'stale-graph-probe', entries: ['E-003'], strongest: 'hook' },
];

// ---------- Agentes falsos ----------
// Um bloqueante do crítico, com marcas por ronda e critério; `cls` só entra quando é dado (o crítico «antigo» não manda class)
export const item = (round, crit, mat = 2, cat = 'criterion', cls) => ({ criterion: 'C' + crit, materiality: mat, category: cat, description: `DESC-r${round}-C${crit}`, repro: `REPRO-r${round}-C${crit}`, ...(cls ? { class: cls } : {}) });
const flip = (l) => (l === 'A' ? 'B' : 'A');
// A forma da resposta do repro (resposta 2 do orquestrador na #78): o schema tem raiz object com UMA só propriedade array, e a lista
// [{finding, reproduced, output}] vai nessa propriedade; «não seja um array» = essa propriedade ausente ou que não é uma lista. Os fakes
// respondem só nesta forma, com o nome da propriedade lido do schema do workflow; um schema noutra forma recebe {} (sem a lista).
export const SLOT = Symbol('lista do repro');
export const inSlot = (x) => ({ [SLOT]: x }); // põe x (mesmo que não seja uma lista) no lugar da lista
export const reproShape = (schema) => {
  const ks = schema?.type === 'object' ? Object.entries(schema.properties || {}).filter(([, v]) => v?.type === 'array').map(([k]) => k) : [];
  if (ks.length === 1) return { key: ks[0], items: schema.properties[ks[0]].items, wrap: (l) => ({ [ks[0]]: l, model: declared(PROBE.tester) }) };
  return { key: null, items: undefined, wrap: () => ({}) };
};
// A resposta do repro de uma ronda: oks[i] é o reproduced do achado F<round>-<i+1>
export const answer = (round, oks) => oks.map((ok, i) => ({ finding: `F${round}-${i + 1}`, reproduced: ok, output: `OUT-r${round}-${i + 1}` }));
export const allReproduced = (round, run) => answer(round, (run.seen[round] || []).map(() => true));
// critic(round, prompt) → { lost?, testsPass?, blocking?: [[crit, mat?, cat?, cls?]], followUp? }; sem falhas e sem lost, o crítico escolhe o nosso.
// repro(round, prompt, run) → a resposta do tester (qualquer coisa: lista, null, objeto, texto). Por omissão 'ok', como nos runtimes antigos.
// dev(round, prompt) → campos a juntar ao BUILD. old: true tira os campos do F-23a (head, diffHash, responses, sha, preExisting).
// Uma só peça por cenário; a ronda é o número de devs já chamados.
export const scenario = (piece, { critic = () => ({}), dev = () => ({}), repro = () => 'ok', old = false } = {}) => (prompt, opts, run) => {
  const role = roleOf(opts);
  const round = devCalls(run).length;
  if (role === 'tester') {
    const v = repro(round, prompt, run), { wrap } = reproShape(opts.schema);
    return Array.isArray(v) ? wrap(v) : v && typeof v === 'object' && SLOT in v ? wrap(v[SLOT]) : v;
  }
  if (role !== 'critic' && role !== 'developer' && role !== 'developerUi') return 'ok';
  if (role === 'critic') {
    const v = critic(round, prompt) || {};
    const ours = /^A: .*src\/a\.js/m.test(prompt) ? 'A' : 'B';
    const blocking = (v.blocking || []).map(([c, m, cat, cls]) => item(round, c, m, cat, cls));
    run.seen[round] = blocking;
    const out = {
      winner: v.lost ? flip(ours) : ours, testsPass: v.testsPass !== false, blocking, minor: [], barQuestions: [], followUp: v.followUp || [],
      visualBelowReference: false, attacks: atksOf(piece.id).map((a) => ({ id: a.id, passesOnDelivery: true })),
      biggestGap: `GAP-r${round}`, reasoning: `CRITIC-REASONING-${round}`, model: declared(PROBE.critic),
    };
    if (!old) Object.assign(out, { sha: H(round), preExisting: [] });
    return out;
  }
  const responses = (run.seen[round - 1] || []).map((_, i) => ({ finding: `F${round - 1}-${i + 1}`, answer: 'fixed' }));
  return { filesChanged: ['src/a.js'], testCommand: 'TEST-DEV', redEvidence: 'RED-EV', greenEvidence: 'GREEN-EV', model: declared(PROBE[role]), summary: `DEV-NARRATIVE-r${round}`, ...(old ? {} : { head: H(round), diffHash: D(round), responses }), ...(dev(round, prompt) || {}) };
};
// Commits e hashes válidos e distintos por ronda (só minúsculas, como os padrões pedem)
export const H = (r) => ('c' + r.toString(16)).repeat(20);
export const D = (r) => ('d' + r.toString(16)).repeat(32);
// O crítico falso do gauntlet-attacks (Ronda −1): devolve um ataque vermelho e uma guarda
export const attacksImpl = (prompt, opts) => roleOf(opts) === 'critic' ? { attacks: atksOf('pa'), gaps: [], model: declared(PROBE.critic) } : 'ok';

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
// Um plano de 3 rondas ao acaso: ganha, perde a comparação, testes a falhar, ou 1 a 3 bloqueantes (critério 1 a 4, materialidade 1, 2 ou 3)
export const randomPlan = (r) => Array.from({ length: 3 }, () => {
  const k = pick(r, ['win', 'lost', 'tests', 'block', 'block', 'block']);
  if (k === 'win') return {};
  if (k === 'lost') return { lost: true };
  if (k === 'tests') return { testsPass: false };
  return { blocking: Array.from({ length: 1 + Math.floor(r() * 3) }, () => (r() < 0.25 ? [1 + Math.floor(r() * 4), 1, 'regression'] : [1 + Math.floor(r() * 4), pick(r, [2, 3])])), ...(r() < 0.3 ? { lost: true } : {}) };
});
// Uma resposta do repro ao acaso para n achados: válida (reproduced ao acaso) ou inválida (em falta, não-array, sem um dos ids)
export const randomRepro = (r, n) => {
  const k = pick(r, ['valid', 'valid', 'valid', 'valid', 'valid', 'valid', 'null', 'text', 'object', 'missing']);
  if (k === 'valid') return { valid: true, oks: Array.from({ length: n }, () => r() < 0.5) };
  return { valid: false, kind: k };
};
export const reproOf = (round, spec, n) => {
  if (spec.valid) return answer(round, spec.oks);
  if (spec.kind === 'null') return null;
  if (spec.kind === 'text') return 'ok';
  if (spec.kind === 'object') return inSlot({ results: answer(round, Array(n).fill(false)) });
  return answer(round, Array(n).fill(false)).slice(1); // sem o primeiro id
};

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
export const linesOf = (out) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}(.*)$/)).filter(Boolean).map((m) => ({ state: m[1], text: m[2] }));
export const state = (out, name) => linesOf(out).find((l) => l.text === name || l.text.startsWith(name + ' ('))?.state;
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).join('\n') || out.slice(-1500);
export const replaceIn = (file, find, replace) => { const t = readFileSync(file, 'utf8'); if (!t.includes(find)) return false; writeFileSync(file, t.replaceAll(find, replace)); return true; };

// ---------- FRAMEWORK ----------
// De «<cabeçalho>» até ao cabeçalho seguinte do mesmo nível ou superior
export const section = (re, level, text = read('templates/FRAMEWORK.md')) => {
  const i = text.search(re);
  if (i < 0) return '';
  const nl = text.indexOf('\n', i), j = nl < 0 ? -1 : text.slice(nl + 1).search(new RegExp(`^#{1,${level}} `, 'm'));
  return text.slice(i, j < 0 ? undefined : nl + 1 + j);
};
export const step2 = () => section(/^### Step 2\./m, 3);
export const s101 = () => section(/^### 10\.1\b/m, 3);

// ---------- O corpus do crítico (C3) ----------
export const CRITICO = join(CORPUS, 'critico');
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const cases = () => existsSync(CRITICO) ? readdirSync(CRITICO).filter((x) => statSync(join(CRITICO, x)).isDirectory()).sort() : [];
export const expectOf = (c) => readJson(join(CRITICO, c, 'expect.json'));
export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((x) => walk(join(abs, x))));
// Corre a prova de um caso numa CÓPIA da pasta do caso (cwd = a cópia): o corpus do repositório nunca é escrito
export const runProof = (c) => {
  const d = tmp('caso');
  cpSync(join(CRITICO, c), d, { recursive: true });
  return node(['--test', '--test-reporter=tap', 'proof.test.mjs'], { cwd: d });
};
// O bloco contract:begin … contract:end do gauntlet-build.js (a implementação de referência da validação de um contrato)
export const contractProblems = (p) => {
  const src = srcNow(), i = src.indexOf('// contract:begin'), j = src.indexOf('// contract:end');
  if (i < 0 || j < 0) throw new Error('o gauntlet-build.js não tem o bloco contract:begin/contract:end');
  const ctx = vm.createContext({ PIECES: [p] });
  const block = src.slice(i, j).replace(/^if \(contractErrors\.length\).*$/m, ''); // sem o throw: queremos a lista
  return vm.runInContext(block + '\ncontractErrors', ctx);
};