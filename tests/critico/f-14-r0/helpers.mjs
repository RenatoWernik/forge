// Ronda −1 do F-14 (#15): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real: no import, HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária (também nos
// processos filhos, com DISABLE_AUTOUPDATER=1); todas as pastas temporárias apagam-se no after() do ficheiro de teste.
// Nenhum ataque abre uma sessão `claude` nem usa a rede: os workflows correm num runtime falso (vm), como a simulação do check.cjs,
// e o update.mjs corre com a fixture de versões e com o pré-carregamento que bloqueia e regista a rede (f-15a-r0/sem-rede.mjs).
//
// LEITURA DO CONTRATO: o corpo da #15 mais a emenda do orquestrador (comentário 6503240709) e os seguimentos que o orquestrador
// decidiu fechar no F-14 (#52 ponto 2, #53 pontos 1, 3 e 4, FRAMEWORK.md, READMEs, corpus < 55 s). As leituras que o contrato deixa
// abertas estão no topo de cada ataque e nas PERGUNTAS da Ronda −1 na #15.
import { after } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = '248ed1c';
export const FIXTURE = join(ROOT, 'scripts/fixtures/versions-2026-10-29.json');
export const SEM_REDE = join(ROOT, 'tests/critico/f-15a-r0/sem-rede.mjs');

const temps = [];
export const tmp = (prefix = 'critico-f14-') => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
const fake = tmp('critico-f14-home-');
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = fake;
export const FAKE_HOME = fake;
after(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = (extra = {}) => {
  const env = { ...process.env, HOME: fake, USERPROFILE: fake, CLAUDE_CONFIG_DIR: fake, DISABLE_AUTOUPDATER: '1', ...extra };
  delete env.NODE_TEST_CONTEXT;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  return env;
};

export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

// ---- Projetos gerados (o scaffold do pacote, com as respostas do corpus) ----
export const corpusAnswers = (name) => readJson(join(ROOT, 'scripts/corpus/answers', name + '.json'));
export const gerar = async (answers) => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dest = join(tmp(), 'proj');
  await scaffold(answers, { dest });
  return dest;
};
// O mesmo substituto da tradução que o scripts/corpus.test.mjs usa (passo de tradução da skill new-project)
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
const PROSE = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md'];
export const traduzSePt = (proj) => {
  if (!/^pt/i.test(readJson(join(proj, '.claude/forge.json')).langTag)) return;
  const briefs = existsSync(join(proj, '.claude/briefs')) ? readdirSync(join(proj, '.claude/briefs')).map((f) => '.claude/briefs/' + f) : [];
  for (const rel of [...PROSE, ...briefs]) if (existsSync(join(proj, rel))) writeFileSync(join(proj, rel), translatePt(readFileSync(join(proj, rel), 'utf8')));
};

// ---- check.cjs ----
export const check = (cwd, args = []) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// [{ state: 'ok'|'FAIL', name }] das linhas da saída do check.cjs
export const linhas = (out) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}(.*)$/)).filter(Boolean).map((m) => ({ state: m[1], name: m[2] }));
export const allOk = (r) => r.status === 0 && /^All ok\.$/m.test(r.out) && !linhas(r.out).some((l) => l.state === 'FAIL');
export const falhas = (out) => linhas(out).filter((l) => l.state === 'FAIL').map((l) => 'FAIL  ' + l.name).join('\n') + '\n' + out.slice(-1500);

// ---- gauntlet-build num runtime falso (vm), como o check.cjs o simula ----
const BUILD = () => readFileSync(join(ROOT, 'templates/.claude/workflows/gauntlet-build.js'), 'utf8').replace(/^export const meta\s*=/m, 'const meta =');
const M = (model, effort) => ({ model, effort, label: model });
const MODELS = { developer: M('m-dev', 'high'), developerUi: M('m-ui', 'high'), critic: M('m-crit', 'xhigh'), tester: M('m-test', 'xhigh'), aux: M('m-aux', 'low') };
export const ESC = (o = {}) => Object.fromEntries(Object.entries({ sameCriterionFailures: 2, attacksRedOnDelivery: true, minutesWithoutProgress: 30, visualBelowReference: true, ...o }).map(([k, value]) => [k, { value, description: k }]));
const crit = (n) => Array.from({ length: n }, (_, i) => ({ text: 'crit ' + (i + 1), oracle: 'corpus', command: 'node --test t' + i }));
export const piece = (o = {}) => ({ id: 'p', title: 'P', goal: 'GOAL', bar: 'BAR', owns: ['src/a.js'], tdd: true, issue: 7, objective: 'O', input: 'I', criteria: crit(4), fails: 'F', outOfScope: 'X', env: 'E', output: 'U', ...o });
const r0 = (id) => ({ id, attacks: [{ id: id + '-a1', file: 'a1', passesOnBase: false }, { id: id + '-g1', file: 'g1', guard: true, passesOnBase: true }], failingOnBase: true, gaps: [] });
export const args = (o = {}) => ({ checkpoint: { n: 1, title: 'T' }, root: '/r', dashboardUrl: 'https://x', context: 'CTX', models: MODELS, mode: 'rigorous', escalation: ESC(), attacks: [r0('p')], pieces: [piece()], ...o });
export const B = (criterion, materiality = 2, category = 'criterion') => ({ criterion, materiality, category, description: 'D-' + criterion, repro: 'R-' + criterion });
// plans[round-1] = o que muda num veredito que aprova; o desenvolvedor entrega sempre o mesmo
export const runBuild = async (a, plans = []) => {
  const calls = [], logs = [];
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts });
    if (!opts.schema) return 'ok';
    const round = +opts.label.match(/:r(\d+)$/)[1];
    if (opts.label.startsWith('build:')) return { filesChanged: ['src/a.js'], testCommand: 'T', redEvidence: 'RED', greenEvidence: 'GREEN', model: opts.model, summary: 'DEV-SUMMARY' };
    const ours = /^A: .*src\/a\.js/m.test(prompt) ? 'A' : 'B';
    const { lost, ...o } = plans[round - 1] || {};
    return { winner: lost ? (ours === 'A' ? 'B' : 'A') : ours, testsPass: true, blocking: [], minor: [], barQuestions: [], followUp: [], visualBelowReference: false, attacks: [{ id: 'p-a1', passesOnDelivery: true }, { id: 'p-g1', passesOnDelivery: true }], biggestGap: 'GAP-' + round, reasoning: 'R', model: opts.model, ...o };
  };
  const ctx = vm.createContext({ args: structuredClone(a), agent, parallel: (ts) => Promise.all(ts.map((t) => t())), phase: () => {}, log: (m) => logs.push(String(m)) });
  let out, err;
  try { out = await vm.runInContext('(async () => {' + BUILD() + '\n})()', ctx); } catch (e) { err = e; }
  return { out, err, calls, logs, r: out && out.results[0], crit: calls.filter((c) => /^critic:/.test(c.opts.label)), devs: calls.filter((c) => /^build:/.test(c.opts.label)) };
};
// `stopped` é texto ('redesign') ou objeto ({ reason }) desde o F-08 (#52 ponto 1 fica fora do F-14): os dois contam
export const reasonOf = (s) => (typeof s === 'string' ? s : s && typeof s === 'object' ? s.reason : undefined);
export const show = (x) => JSON.stringify({ err: x.err && String(x.err), won: x.r?.won, rounds: x.r?.rounds, stopped: x.r?.stopped, criterion: x.r?.criterion, condition: x.r?.condition, devs: x.devs.length, logs: x.logs.slice(-4) });

export const walk = (abs) => (!existsSync(abs) ? [] : statSync(abs).isFile() ? [abs] : readdirSync(abs).flatMap((n) => walk(join(abs, n))));
export { mkdirSync, writeFileSync, readFileSync, existsSync };
