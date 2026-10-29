// Ronda −1 do F-08 (#9, com o seguimento #18): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). A pasta é apagada no after() e no exit.
// Nenhum ataque abre uma sessão `claude`: os workflows correm num runtime falso (vm), como a simulação do check.cjs.
//
// DEPENDE DO F-07 (#8), ainda fora da main. Os args do gauntlet-build seguem a forma fixada nas respostas do orquestrador à #8
// (E:\Guilda\.checkpoints\orquestrador-resp-f07.md): cada peça leva os campos do contrato (issue, objective, input, criteria
// [{ text, oracle, command }], fails, outOfScope, env, output) além dos antigos (id, title, goal, bar, owns, tdd), e o resultado
// da Ronda −1 entra em `args.attacks` = [{ id, attacks: [{ id, file, guard?, passesOnBase }], failingOnBase, gaps }]. Aqui todas
// as peças chegam limpas da Ronda −1 (ataques sem guarda a falhar na base, sem lacunas), para o build as aceitar.
//
// Leitura do contrato da #9 que estes ataques assumem (cada ponto ajusta-se aqui, num só sítio; as PERGUNTAS estão na #9):
//   - `args.mode` é 'rigorous' ou 'accelerated' e `args.escalation` é a `escalation` do forge.json tal como está
//     ({ <condição>: { value, description } }, as 4 condições do F-03); o orquestrador copia-as do forge.json, como os modelos;
//   - os critérios da peça identificam-se por «C<n>», a posição 1-based na lista `criteria` (critério 1 da #9: «o critério C1»);
//     um critério central leva `central: true` no próprio critério do contrato;
//   - a peça com `ui: true` corre com `models.developerUi`; sem `ui` ou com `ui: false`, com `models.developer`;
//   - o veredito do crítico segue o formato do brief (VERDICT, BLOCKING com o critério de materialidade 1, 2 ou 3 e o repro, MINOR,
//     BAR QUESTIONS, FOLLOW-UP). Os NOMES dos campos do schema não estão fixados: o crítico falso lê o schema que o workflow lhe
//     passa e preenche cada campo pelo nome (veredito, lista de bloqueantes e, em cada bloqueante, critério, materialidade,
//     categoria e repro). O «reprova sempre» é a materialidade 1 (spec #1, solução 3), com a categoria do corpus;
//   - o retorno de cada peça é { id, stopped, ... }: stopped 'redesign' com `criterion`, 'contract' ou 'escalate' com `condition`,
//     sempre com `metrics` = { rounds, sameCriterionFailures, attacksRedOnDelivery, minutesWithoutProgress }; uma peça aprovada
//     tem `won: true`, e as falhas que o modo acelerado passa a seguimento ficam em `followUps`;
//   - medidas que o workflow não pode medir sozinho (sem relógio nem ficheiros): os agentes declaram-nas. Os ataques vermelhos na
//     entrega e os minutos chegam em campos do schema do dev ou do crítico, que o runtime falso preenche pelo nome (ver `fill`);
//     o visual abaixo da referência chega num campo do veredito do crítico.
// Os papéis reconhecem-se pelo modelo e pelo esforço (modelos de sonda distintos), nunca pelas etiquetas, que são internas.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = '0a35bee'; // a main com o F-01, F-02, F-03, F-04, F-10, F-11 e F-12

const WORK = mkdtempSync(join(tmpdir(), 'critico-f08-'));
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
// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

export const WF_DIR = join(ROOT, 'templates/.claude/workflows');
export const BUILD = 'gauntlet-build.js', PONY = 'gauntlet-ponytail.js';
export const MODES = ['rigorous', 'accelerated'];
export const CONDITIONS = ['sameCriterionFailures', 'attacksRedOnDelivery', 'minutesWithoutProgress', 'visualBelowReference'];
export const METRICS = ['rounds', 'sameCriterionFailures', 'attacksRedOnDelivery', 'minutesWithoutProgress'];
// As 6 categorias do «reprova sempre» (critério 4 da #9), com o nome que o crítico falso usa e o padrão para um enum do schema
export const ALWAYS = [
  ['secret', /secret|segredo|leak/i], ['security', /secur|segur|inject/i], ['data-loss', /data|dados|loss|perda/i],
  ['false-alarm', /alarm|alarme/i], ['regression', /regress/i], ['no-evidence', /evidence|evid[eê]ncia/i],
];

// ---------- Modelos de sonda: cada papel com um par modelo/esforço distinto ----------
export const PROBE = {
  developer: { model: 'probe-dev', effort: 'xhigh', label: 'Probe Dev 1.0', reason: 'probe' },
  developerUi: { model: 'probe-devui', effort: 'high', label: 'Probe UI 2.0', reason: 'probe' },
  critic: { model: 'probe-critic', effort: 'low', label: 'Probe Critic 3.0', reason: 'probe' },
  tester: { model: 'probe-tester', effort: 'medium', label: 'Probe Tester 4.0', reason: 'probe' },
  aux: { model: 'probe-aux', effort: 'max', label: 'Probe Aux 5.0', reason: 'probe' },
};
export const roleOf = (opts, models = PROBE) => ['developer', 'developerUi', 'critic', 'tester', 'aux'].find((r) => opts?.model === models[r].model && opts?.effort === models[r].effort);
export const declared = (r) => `${r.model} ${r.label || r.model}`;

// ---------- Runtime falso (a técnica do check.cjs: vm só com args, agent, parallel, phase e log; sem relógio nem acaso) ----------
export const workflowSrc = (file, dir = WF_DIR) => readFileSync(join(dir, file), 'utf8');
export const runWf = async (file, args, impl, { dir = WF_DIR, src: given } = {}) => {
  const run = { file, calls: [], logs: [], phases: [] };
  let src = given;
  if (src === undefined) { try { src = workflowSrc(file, dir); } catch (e) { run.err = new Error(`${file} não existe em ${dir}`); return run; } }
  try {
    src = src.replace(/^export const meta\s*=/m, 'const meta =');
    const agent = async (prompt, opts) => {
      const c = { prompt: String(prompt), opts: opts || {} };
      if (run.calls.push(c) > 1000) throw new Error('limit of 1000 agents');
      return impl(c.prompt, c.opts, run);
    };
    const parallel = (ts) => Promise.all(ts.map((t) => t().catch(() => null)));
    const ctx = vm.createContext({ args: structuredClone(args), agent, parallel, phase: (t) => run.phases.push(t), log: (m) => run.logs.push(String(m)) });
    vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx);
    run.out = await vm.runInContext('(async () => {' + src + '\n})()', ctx);
  } catch (e) { run.err = e; }
  return run;
};
export const resultsOf = (out) => (Array.isArray(out) ? out : Array.isArray(out?.results) ? out.results : []);
export const resultOf = (run, id) => resultsOf(run.out).find((r) => r && r.id === id);
export const refusalText = (run) => (run.err ? String(run.err.message ?? run.err) : '') + ' ' + (run.out === undefined ? '' : JSON.stringify(run.out));
export const why = (run, id) => JSON.stringify({ err: run.err && String(run.err.message ?? run.err).slice(0, 300), result: resultOf(run, id), logs: run.logs.slice(-6) }).slice(0, 1500);

// ---------- Contrato da peça (forma do F-07) e args ----------
const CRIT_TEXT = ['The export returns 3 rows for the sample file', 'The header row matches the reference CSV byte for byte', 'An empty file exports only the header', 'The totals row sums the amount column'];
// central: lista de posições (1-based) dos critérios centrais
export const contract = (id = 'pa', issue = 9101, { central = [], ui, criteria = 4, ...over } = {}) => ({
  id, title: 'TITLE-' + id, goal: 'OBJ-' + id, bar: 'BAR-' + id, owns: ['src/a.js'], tdd: true,
  ...(ui === undefined ? {} : { ui }),
  issue,
  objective: 'OBJ-' + id,
  input: 'branch main at HEAD abc1234; files src/a.js and test/a.test.mjs',
  criteria: CRIT_TEXT.slice(0, criteria).map((text, i) => ({ text, oracle: 'corpus', command: `node --test test/c${i + 1}.test.mjs`, ...(central.includes(i + 1) ? { central: true } : {}) })),
  fails: 'a criterion that fails or has no evidence; a regression',
  outOfScope: 'pagination and the PDF export',
  env: 'Node 24, standard library only',
  output: 'draft PR and a Round 0 comment on the issue',
  ...over,
});
// A escalada do forge.json com as 4 condições; por defeito, NEUTRA (nenhuma condição dispara nos cenários dos critérios 1 a 4)
export const escalation = (over = {}) => {
  const v = { sameCriterionFailures: 9, attacksRedOnDelivery: false, minutesWithoutProgress: 9999, visualBelowReference: false, ...over };
  return Object.fromEntries(CONDITIONS.map((c) => [c, { value: v[c], description: 'probe ' + c }]));
};
// A Ronda −1 limpa de uma peça (respostas 7 e 8 da #8): um ataque normal a falhar na base e uma guarda que já passa
export const atksOf = (id) => [{ id: `${id}-a1`, file: `tests/critico/${id}-r0/a1.test.mjs`, passesOnBase: false }, { id: `${id}-g1`, file: `tests/critico/${id}-r0/g1.test.mjs`, guard: true, passesOnBase: true }];
export const r0 = (id) => ({ id, attacks: atksOf(id), failingOnBase: true, gaps: [] });
export const baseArgs = (pieces, { mode = 'rigorous', esc = {}, ...over } = {}) => ({
  checkpoint: { n: 1, title: 'T' }, root: '/proj', dashboardUrl: 'https://claude.ai/artifact/x', context: 'CTX-SPEC',
  models: structuredClone(PROBE), language: 'English', memory: { workspace: 'ws', project: 'pj' },
  mode, escalation: escalation(esc), attacks: pieces.map((p) => r0(p.id)), pieces, ...over,
});

// Uma chamada pertence a uma peça quando o prompt traz o objetivo, o título ou o número da issue dela
export const belongs = (c, p) => c.prompt.includes(p.objective) || c.prompt.includes(p.title) || new RegExp(`(?<!\\d)${p.issue}(?!\\d)`).test(c.prompt);
export const callsOf = (run, p, role) => run.calls.filter((c) => belongs(c, p) && (role === 'dev' ? ['developer', 'developerUi'].includes(roleOf(c.opts)) : roleOf(c.opts) === role));
export const devCount = (run, p) => callsOf(run, p, 'dev').length;
export const criticCount = (run, p) => callsOf(run, p, 'critic').length;
// O critério devolvido é o C<n> pedido: aceita 'C1', 'c1' ou 1
export const sameCrit = (x, k) => x === k || String(x).trim().toUpperCase() === 'C' + k;

// ---------- Preenchimento de um valor pelo schema e pelo nome do campo ----------
const typeOf = (s) => (Array.isArray(s?.type) ? s.type.find((t) => t !== 'null') : s?.type);
const byType = (s) => (s?.enum ? s.enum[0] : typeOf(s) === 'array' ? [] : typeOf(s) === 'boolean' ? false : ['number', 'integer'].includes(typeOf(s)) ? 0 : typeOf(s) === 'object' ? fillObj(s, () => undefined) : 'x');
const fillObj = (s, hint, path = []) => {
  const o = {};
  for (const k of new Set([...Object.keys(s?.properties || {}), ...(s?.required || [])])) {
    const ps = s?.properties?.[k] || {};
    const h = hint([...path, k], ps);
    o[k] = h !== undefined ? h : typeOf(ps) === 'object' ? fillObj(ps, hint, [...path, k]) : byType(ps);
  }
  return o;
};
export const fillSchema = (schema, hint = () => undefined) => fillObj(schema || {}, (p, s) => hint(p[p.length - 1], s, p.length));
// Escolhe num enum o valor cujo texto casa com re; senão, o valor dado
const fromEnum = (s, re, fallback) => (s?.enum ? (s.enum.find((v) => re.test(String(v))) ?? fallback) : fallback);
const asType = (s, { num, str, bool }) => (['number', 'integer'].includes(typeOf(s)) ? num : typeOf(s) === 'boolean' ? bool : typeOf(s) === 'array' ? (Array.isArray(str) ? str : [str]) : Array.isArray(str) ? str.join(', ') : str);

// Os tempos e os ataques que os agentes declaram (critério 5). minutes: minutos desde o início da peça, no fim desta resposta.
const T0 = Date.parse('2026-10-29T10:00:00Z');
const timeHint = (key, s, minutes) => {
  if (/minute/i.test(key)) return asType(s, { num: minutes, str: String(minutes), bool: minutes > 0 });
  if (/(started|start|begin|ended|end|finished|finish|done|at|time|timestamp|date)$/i.test(key) && !/evidence/i.test(key) && typeOf(s) === 'string') {
    const m = /start|begin/i.test(key) ? Math.max(0, minutes - 15) : minutes;
    return new Date(T0 + m * 60000).toISOString();
  }
  return undefined;
};
const attackHint = (key, s, ids, red) => {
  if (/evidence/i.test(key) || !/attack|ataque|^red|Red|^green|Green/.test(key)) return undefined;
  const reds = red ? ids.slice(0, 1) : [], greens = red ? ids.slice(1) : ids;
  if (/red|fail/i.test(key)) return asType(s, { num: reds.length, str: reds, bool: red });
  if (/green|pass/i.test(key)) return asType(s, { num: greens.length, str: greens, bool: !red });
  if (typeOf(s) === 'array' && typeOf(s.items) === 'object') return ids.map((id) => fillObj(s.items, (p, ps) => {
    const k = p[p.length - 1], isRed = red && id === reds[0];
    if (/^id$|name|file/i.test(k)) return id;
    if (/red|fail/i.test(k)) return asType(ps, { num: +isRed, str: isRed ? 'red' : 'green', bool: isRed });
    if (/green|pass|ok/i.test(k)) return asType(ps, { num: +!isRed, str: isRed ? 'red' : 'green', bool: !isRed });
    if (/status|state|result/i.test(k)) return fromEnum(ps, isRed ? /red|fail/i : /green|pass|ok/i, isRed ? 'red' : 'green');
    return undefined;
  }));
  if (/^attacks?$/i.test(key) || /attacksGreen|allGreen/i.test(key)) return asType(s, { num: greens.length, str: red ? 'red' : 'green', bool: !red });
  return undefined;
};

// Resposta do dev: os campos de sempre, a narrativa marcada (para o #18) e o que o schema pedir de ataques e de tempo
export const NARRATIVE = 'DEV-NARRATIVE-';
const devAnswer = (opts, ctx) => {
  const { round, red, minutes, piece, models = PROBE } = ctx;
  const role = roleOf(opts, models);
  const ids = (ctx.attackIds || atksOf(piece.id).map((a) => a.id));
  const hint = (p, s) => {
    const k = p[p.length - 1];
    if (p.length === 1 && /^model$/i.test(k)) return declared(models[role]);
    if (p.length === 1 && /summary|reason|narrativ|explan|thought|note|rationale/i.test(k) && typeOf(s) === 'string') return `${NARRATIVE}${k}-r${round}`;
    if (p.length === 1 && /filesChanged/.test(k)) return ['src/a.js'];
    if (p.length === 1 && /testCommand/.test(k)) return 'TEST-DEV';
    if (p.length === 1 && /redEvidence/.test(k)) return 'RED-EV';
    if (p.length === 1 && /greenEvidence/.test(k)) return 'GREEN-EV';
    return attackHint(k, s, ids, red) ?? timeHint(k, s, minutes);
  };
  return { ...fillObj(opts.schema || {}, hint), summary: `${NARRATIVE}summary-r${round}`, reasoning: `${NARRATIVE}reasoning-r${round}`, narrative: `${NARRATIVE}narrative-r${round}` };
};

// Um bloqueante: { crit: n (C<n>), mat: 1 | 2 | 3, cat?: categoria do «reprova sempre» } → o repro leva a marca REPRO-r<ronda>-C<n>
export const repro = (round, crit) => `REPRO-r${round}-C${crit}`;
const blockingItem = (s, b, round) => {
  const tag = repro(round, b.crit), cat = b.cat || (b.mat === 1 ? 'no-evidence' : 'criterion');
  if (typeOf(s) !== 'object') return `[materiality ${b.mat}] C${b.crit} ${cat}: ${tag}`;
  return fillObj(s, (p, ps) => {
    const k = p[p.length - 1];
    if (/material/i.test(k)) return ps.enum ? (ps.enum.find((v) => String(v).includes(String(b.mat))) ?? ps.enum[b.mat - 1]) : asType(ps, { num: b.mat, str: String(b.mat), bool: true });
    if (/crit[eé]rio|criterion|criteria|^crit/i.test(k)) return asType(ps, { num: b.crit, str: 'C' + b.crit, bool: true });
    if (/repro|evidence|command|steps/i.test(k)) return tag;
    if (/always|sempre/i.test(k)) return asType(ps, { num: +(b.mat === 1), str: b.mat === 1 ? 'always' : '', bool: b.mat === 1 });
    if (/categor|kind|class|type|reason/i.test(k)) return ps.enum ? (ps.enum.find((v) => (ALWAYS.find(([c]) => c === cat)?.[1] ?? /criterion|crit/i).test(String(v))) ?? ps.enum[0]) : cat;
    if (/text|desc|detail|what|title|summary|message/i.test(k)) return `C${b.crit} materiality ${b.mat} ${cat} ${tag}`;
    return undefined;
  });
};
// O veredito do crítico. v = { blocking: [..], testsPass?, lost?, visual?, minor? }; aprova quando não há falhas.
export const CRITIC_REASONING = 'CRITIC-REASONING-';
const criticAnswer = (prompt, opts, ctx) => {
  const { round, v = {}, red, minutes, models = PROBE } = ctx;
  const blocking = v.blocking || [];
  const approve = !blocking.length && v.testsPass !== false && !v.lost;
  const lineA = prompt.match(/^\s*A\s*[:=-][^\n]*$/m)?.[0] || '', lineB = prompt.match(/^\s*B\s*[:=-][^\n]*$/m)?.[0] || '';
  const ours = lineA.includes('src/a.js') ? 'A' : lineB.includes('src/a.js') ? 'B' : 'A';
  const flip = (l) => (l === 'A' ? 'B' : 'A');
  const ids = (ctx.attackIds || atksOf(ctx.piece.id).map((a) => a.id));
  const hint = (p, s) => {
    if (p.length !== 1) return undefined;
    const k = p[0];
    if (/^model$/i.test(k)) return declared(models.critic);
    if (/winner/i.test(k) || (s.enum && s.enum.join() === 'A,B')) return v.lost ? flip(ours) : ours;
    if (/tests?pass/i.test(k)) return v.testsPass !== false;
    if (/block|bloq/i.test(k) && typeOf(s) === 'array') return blocking.map((b) => blockingItem(s.items, b, round));
    if (/minor|menor/i.test(k) && typeOf(s) === 'array') return (v.minor || []).map((t) => (typeOf(s.items) === 'object' ? fillObj(s.items, (q) => (/text|desc|what|title|summary|message|repro/i.test(q[q.length - 1]) ? t : undefined)) : t));
    if (/follow|seguim|question|pergunt/i.test(k) && typeOf(s) === 'array') return [];
    if (/visual/i.test(k)) return asType(s, { num: +!!v.visual, str: v.visual ? 'below' : 'ok', bool: !!v.visual });
    if (/verdict|veredito|decision|outcome|result|status/i.test(k) && s.enum) return fromEnum(s, approve ? /approv|aprov|pass|accept|win|won|ok/i : /reject|reprov|fail|lost|lose|block/i, s.enum[approve ? 0 : s.enum.length - 1]);
    if (/approved|aprovad|pass(ed)?$/i.test(k) && typeOf(s) === 'boolean') return approve;
    if (/gap/i.test(k) && typeOf(s) === 'string') return 'GAP-r' + round;
    if (/reason|summary|narrativ|explan/i.test(k) && typeOf(s) === 'string') return CRITIC_REASONING + round;
    return attackHint(k, s, ids, red) ?? timeHint(k, s, minutes);
  };
  return fillObj(opts.schema || {}, hint);
};

// Cenário: plan[pieceId] = [veredito da ronda 1, da ronda 2, ...]; depois do fim do plano, o crítico aprova.
// opts: red(id, round) → a entrega desta ronda tem ataques a vermelho; minutesPerRound (por defeito 5); models.
export const scenario = (pieces, plan = {}, { red = () => false, minutesPerRound = 5, models = PROBE } = {}) => (prompt, opts, run) => {
  const role = roleOf(opts, models);
  if (!role || role === 'aux' || role === 'tester') return 'ok';
  const c = { prompt, opts };
  const piece = pieces.find((p) => belongs(c, p));
  if (!piece) return null;
  const devs = run.calls.filter((x) => belongs(x, piece) && ['developer', 'developerUi'].includes(roleOf(x.opts, models))).length;
  const round = Math.max(1, devs);
  if (role === 'critic') return criticAnswer(prompt, opts, { round, v: (plan[piece.id] || [])[round - 1], red: red(piece.id, round), minutes: round * minutesPerRound, piece, models });
  return devAnswer(opts, { round, red: red(piece.id, round), minutes: (round - 1) * minutesPerRound + Math.ceil(minutesPerRound / 2), piece, models });
};
// Bloqueantes curtos para os planos
export const fail = (crit, mat = 2, cat) => ({ blocking: [{ crit, mat, ...(cat ? { cat } : {}) }] });
export const failMany = (...bs) => ({ blocking: bs.map(([crit, mat = 2, cat]) => ({ crit, mat, ...(cat ? { cat } : {}) })) });

// ---------- Projetos gerados (scaffold do pacote) ----------
export const MODELS = () => ({
  developer: { model: 'sonnet', effort: 'high', label: 'Dev Logic 1.0', reason: 'logic and server code run well on this model' },
  developerUi: { model: 'opus', effort: 'high', label: 'Dev UI 2.0', reason: 'rich UI needs a stronger model' },
  critic: { model: 'opus', effort: 'xhigh', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on the strongest model' },
  tester: { model: 'haiku', effort: 'xhigh', label: 'Tester 4.0', reason: 'the batch suite is mechanical work' },
  aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
});
export const ANSWERS = (over = {}) => ({ projectName: 'Acme Billing', language: 'English', mode: 'rigorous', models: MODELS(), memory: { workspace: 'acme', project: 'billing' }, ...over });
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
export const check = (cwd, args = []) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// As linhas do check.cjs: [{ state: 'ok' | 'FAIL', text }]
export const linesOf = (out) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL)\s+(.*)$/)).filter(Boolean).map((m) => ({ state: m[1], text: m[2] }));
export const fails = (out) => out.split(/\r?\n/).filter((l) => l.startsWith('FAIL')).join('\n') || out.slice(-1500);
export const replaceIn = (file, find, replace) => { const t = readFileSync(file, 'utf8'); if (!t.includes(find)) return false; writeFileSync(file, t.replaceAll(find, replace)); return true; };

// Os briefs (F-06, resposta 2 da #7: `.claude/briefs/<papel>.md`, com o papel lido do nome do ficheiro)
const ROLE_BY_NAME = [
  ['roundMinus1', /round[-_ ]?(minus|m)[-_ ]?1|round[-_ ]?[−-]1|ronda[-_ ]?(menos|m)?[-_ ]?[−-]?1|minus[-_ ]?1|attacks?|ataques?/i],
  ['critic', /critic|cr[ií]tico|judge/i],
  ['dev', /\bdev|developer|desenvolvedor|builder/i],
  ['batch', /batch|lote|tester|integration/i],
];
export const briefRole = (file) => (ROLE_BY_NAME.find(([, re]) => re.test(basename(file, '.md'))) ?? [])[0];
export const briefsIn = (prompt) => [...prompt.matchAll(/\.claude[\\/]briefs[\\/]([\w.-]+?\.md)/g)].map((m) => briefRole(m[1]));

// ---------- Gerador com semente fixa ----------
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
export const shuffle = (r, xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
