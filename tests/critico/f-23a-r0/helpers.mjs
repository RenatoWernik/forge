// Ronda −1 do F-23a (#77): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude` nem usa a rede: o gauntlet-build corre num runtime falso (vm), como a simulação do check.cjs,
// e o git só lê o próprio repositório (git show da BASE).
//
// LEITURA DO CONTRATO (corpo da #77 e resposta do orquestrador de 2026-10-31: o rótulo único é `seguimento`). Os nomes abaixo são
// LITERAIS do corpo da issue:
//   VERDICT: preExisting [{ description, blame }], followUp (as linhas de sempre), sha (40 hex);
//   BUILD:   head (40 hex), diffHash (64 hex), responses [{ finding: "F<r>-<n>", answer: "fixed" | "contested", reason? }];
//   resultado da peça: followUps [{ round, kind: "pre-existing" | "follow-up", description, ... }] e contested [{ finding, round, reason, criterion }];
//   log(): os três textos literais do corpo (ver LOG_* abaixo).
// Os papéis reconhecem-se pelo modelo e pelo esforço (modelos de sonda distintos). As etiquetas `critic:<id>:r<N>` e `panel:verdict:<id>:r<N>`
// só se usam onde o próprio corpo da #77 as nomeia («0 chamadas critic:p:r2») e para o registo do veredito no painel.
// Referência das guardas: o gauntlet-build.js da BASE (git show), corrido no mesmo runtime falso.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = '645120f'; // a main com o F-20a, antes do F-23a

const WORK = mkdtempSync(join(tmpdir(), 'critico-f23a-'));
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

// ---------- Os textos literais do corpo da #77 ----------
export const LOG_SHA = (id, round, sha, head) => `WARNING ${id} r${round}: the verdict is for ${sha} but the delivery is ${head}`;
export const LOG_SAME = (id, round) => `${id} r${round}: diff unchanged since r${round - 1}, critic not rerun`;
export const LOG_NO_ANSWER = (id, round, finding) => `WARNING ${id} r${round}: no answer to ${finding}`;
export const PRE_LINE = 'PRE-EXISTING: (each with the git blame line) or "none"';
export const SHA_RE = '^[0-9a-f]{40}$', HASH_RE = '^[0-9a-f]{64}$';
// Commits e hashes válidos e distintos por ronda (só minúsculas, como os padrões pedem)
export const H = (r) => ('c' + r.toString(16)).repeat(20);
export const D = (r) => ('d' + r.toString(16)).repeat(32);

// ---------- Os workflows: o atual e o da BASE ----------
const WF_REL = 'templates/.claude/workflows/gauntlet-build.js';
export const srcNow = () => read(WF_REL);
let baseSrc;
export const srcBase = () => {
  if (baseSrc === undefined) { const r = git('show', `${BASE}:${WF_REL}`); if (r.status !== 0) throw new Error('git show da BASE falhou: ' + r.stderr); baseSrc = r.stdout; }
  return baseSrc;
};
export const baseFile = (rel) => { const r = git('show', `${BASE}:${rel}`); if (r.status !== 0) throw new Error(`git show ${BASE}:${rel} falhou: ${r.stderr}`); return r.stdout; };

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
export const resultOf = (run, id = 'pa') => (Array.isArray(run.out?.results) ? run.out.results : []).find((r) => r && r.id === id);
export const why = (run, id = 'pa') => JSON.stringify({ err: run.err && String(run.err.message ?? run.err).slice(0, 400), result: resultOf(run, id), logs: run.logs.slice(-8) }).slice(0, 2500);
export const devCalls = (run) => run.calls.filter(isDev);
export const criticCalls = (run) => run.calls.filter((c) => roleOf(c.opts) === 'critic');
export const labeled = (run, label) => run.calls.filter((c) => c.opts.label === label);
// O desfecho de uma peça (o que um campo ausente nunca pode mudar)
export const outcome = (r) => r && JSON.parse(JSON.stringify({ won: r.won, rounds: r.rounds, stopped: r.stopped ?? null, criterion: r.criterion ?? null, condition: r.condition ?? null, blocked: r.blocked ?? null, metrics: r.metrics ?? null }));

// ---------- Contrato da peça (forma do F-07) e args ----------
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

// ---------- Agentes falsos ----------
// Um bloqueante do crítico, com marcas por ronda e critério
export const item = (round, crit, mat = 2, cat = 'criterion') => ({ criterion: 'C' + crit, materiality: mat, category: cat, description: `DESC-r${round}-C${crit}`, repro: `REPRO-r${round}-C${crit}` });
const flip = (l) => (l === 'A' ? 'B' : 'A');
// critic(round, prompt) → { lost?, testsPass?, blocking?: [[crit, mat?, cat?]], followUp?, preExisting?, sha? }: só os campos dados entram no veredito
//   (o crítico «antigo» não manda preExisting nem sha); sem falhas e sem lost, o crítico escolhe o nosso.
// dev(round, prompt) → campos a juntar ao BUILD (head, diffHash, responses); o dev «antigo» não manda nenhum.
// Uma só peça por cenário; a ronda é o número de devs já chamados.
export const scenario = (piece, { critic = () => ({}), dev = () => ({}) } = {}) => (prompt, opts, run) => {
  const role = roleOf(opts);
  if (role !== 'critic' && role !== 'developer' && role !== 'developerUi') return 'ok';
  const round = devCalls(run).length;
  if (role === 'critic') {
    const v = critic(round, prompt) || {};
    const ours = /^A: .*src\/a\.js/m.test(prompt) ? 'A' : 'B';
    const blocking = (v.blocking || []).map(([c, m, cat]) => item(round, c, m, cat));
    const out = {
      winner: v.lost ? flip(ours) : ours, testsPass: v.testsPass !== false, blocking, minor: [], barQuestions: [], followUp: v.followUp || [],
      visualBelowReference: false, attacks: atksOf(piece.id).map((a) => ({ id: a.id, passesOnDelivery: true })),
      biggestGap: `GAP-r${round}`, reasoning: `CRITIC-REASONING-${round}`, model: declared(PROBE.critic),
    };
    for (const k of ['preExisting', 'sha']) if (v[k] !== undefined) out[k] = v[k];
    return out;
  }
  return { filesChanged: ['src/a.js'], testCommand: 'TEST-DEV', redEvidence: 'RED-EV', greenEvidence: 'GREEN-EV', model: declared(PROBE[role]), summary: `DEV-NARRATIVE-r${round}`, ...(dev(round, prompt) || {}) };
};
// Os campos novos, neutros: o crítico julga o commit entregue, o diff muda a cada ronda, sem pré-existentes e cada achado respondido «fixed»
export const fresh = (plan = []) => ({
  dev: (r) => ({ head: H(r), diffHash: D(r), responses: r < 2 ? [] : (plan[r - 2]?.blocking || []).map((_, i) => ({ finding: `F${r - 1}-${i + 1}`, answer: 'fixed' })) }),
  critic: (r) => ({ ...(plan[r - 1] || {}), sha: H(r), preExisting: plan[r - 1]?.preExisting || [] }),
});
export const planned = (plan) => ({ critic: (r) => plan[r - 1] || {} });

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
// Um plano de 3 rondas ao acaso: ganha, perde a comparação, testes a falhar, ou 1 a 2 bloqueantes (critério 1 a 4, materialidade 2 ou 3, às vezes um «reprova sempre»)
export const randomPlan = (r) => Array.from({ length: 3 }, () => {
  const k = pick(r, ['win', 'lost', 'tests', 'block', 'block', 'block']);
  if (k === 'win') return {};
  if (k === 'lost') return { lost: true };
  if (k === 'tests') return { testsPass: false };
  return { blocking: Array.from({ length: 1 + Math.floor(r() * 2) }, () => (r() < 0.15 ? [1 + Math.floor(r() * 4), 1, 'regression'] : [1 + Math.floor(r() * 4), pick(r, [2, 3])])) };
});

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

// ---------- Ficheiros do pacote ----------
export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((x) => walk(join(abs, x))));
export const posix = (p) => p.split(sep).join('/');
export const rel = (abs) => posix(relative(ROOT, abs));
// O §5 Step 2 do FRAMEWORK: de «### Step 2.» até ao cabeçalho seguinte do mesmo nível ou superior
export const step2 = (text = read('templates/FRAMEWORK.md')) => {
  const i = text.search(/^### Step 2\./m);
  if (i < 0) return '';
  const nl = text.indexOf('\n', i), j = nl < 0 ? -1 : text.slice(nl + 1).search(/^#{1,3} /m);
  return text.slice(i, j < 0 ? undefined : nl + 1 + j);
};
// O bloco de código do formato do veredito no critic.md (o primeiro ``` depois de «## Verdict»)
export const verdictBlock = (text) => {
  const i = text.search(/^## Verdict\b/m);
  if (i < 0) return '';
  const m = text.slice(i).match(/^```[^\n]*\n([\s\S]*?)^```/m);
  return m ? m[1] : '';
};