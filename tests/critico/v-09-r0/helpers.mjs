// Ronda −1 do V-09 (#133): utilitários dos ataques aos textos do processo instalado (briefs, FRAMEWORK e workflows). Só biblioteca padrão.
// Reutiliza o sandbox, o corpus e a tradução substituta do f-02-r0 (HOME, USERPROFILE e CLAUDE_CONFIG_DIR temporários; sem NODE_TEST_CONTEXT).
// Sem rede, sem gh real e sem sessões claude: os agentes são falsos, no molde dos do templates/.claude/check.cjs.
//
// LEITURA DO CONTRATO (corpo da #133 e RESPOSTA do orquestrador às PERGUNTAS 1 a 5 do comentário 6618884237, que prevalece):
// - As regras novas: `node .claude/check-ticket.mjs` no dev.md, `node .claude/executor.mjs` no critic.md, no batch.md e no round-minus-1.md
//   (RESPOSTA 1) e o AVANCAR abaixo no FRAMEWORK.md, secção 10.5 (RESPOSTAS 4 e 5a). Cada literal dá uma regra do check. O comando do FRAMEWORK
//   corre contra os argumentos reais do avancar do projeto (RESPOSTA 4).
// - «Dá ok em EN e em PT»: o projeto dos conjuntos en-plain-published e pt-plain-published, tal como sai do scaffold, com o translatePt do f-02
//   no PT. Só os `code spans` sobrevivem a essa tradução, por isso o literal tem de estar num.
// - «FAIL com a mutação»: trocar o literal por outro texto no ficheiro do projeto põe a FAIL uma linha que estava ok; e há no corpus uma mutação
//   (file, find com o literal) que, aplicada como no f-02-r0 C2, põe a sua linha a FAIL.
// - C2, «os literais push, PR e merge só aparecem na linha que o proíbe»: uma linha com `push`, `PR` ou `merge` só conta como proibição se
//   casar com o NO_MERGE do check. push e merge sem distinguir maiúsculas e com as flexões; PR só em maiúsculas, porque o `--pr <n>` do
//   avancar é um nome de opção. Ficam fora da contagem os 4 módulos e o check.cjs, que são código e não texto para os agentes.
// - C3: uma simulação própria do projeto gerado, com args e agentes falsos iguais aos do check. Crítico: `--todas` na R1 e `--afetadas` na R2,
//   antes do passo `Get the real reference` (RESPOSTA 3). Dev: `node .claude/check-ticket.mjs` na mesma linha que `greenEvidence`.
//   Tester: `--todas --passe 1`, `--passe 2` e `--continuar`, com qualquer testCommand (RESPOSTA 2). Os prompts ficam provados por este C3, sem linha no check (RESPOSTA 5b).
// - «Enfraquecer uma regra atual»: nos ficheiros do mecanismo nenhuma linha da base muda ou sai (só se acrescenta); em todo o templates/, as
//   linhas de regra (NO_MERGE, 540 s, 9 min, primeiro plano) ficam byte a byte; nenhuma linha do check da base desaparece.
// - C4 tem duas metades. A estática está aqui (nenhum ataque antigo alterado; os scripts/*.test.mjs sem linhas apagadas). A corrida é do dev na
//   Ronda 0 e do crítico na R1, por executor, base e entrega: `node scripts/executor.mjs --todas` e
//   `node scripts/inventario.mjs --antes <resultado da base> --depois <resultado da entrega>`, com saída 0.
// Regras 8 e 9 dos briefs: base() e soNoTicket() são os de tests/critico/_comum/ (F-26), reexportados daqui.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { applySeed } from '../../../scripts/corpus-seed.mjs';
import { ROOT, loadCorpus, sandboxEnv, translatePt, lineState, walk } from '../f-02-r0/helpers.mjs';
import { base } from '../_comum/base.mjs';

export { ROOT, loadCorpus, base, lineState };
export { soNoTicket } from '../_comum/ambito.mjs';

export const EN = 'en-plain-published';
export const PT = 'pt-plain-published';
export const CHECK_TICKET = 'node .claude/check-ticket.mjs';
export const EXECUTOR = 'node .claude/executor.mjs';
export const AVANCAR = 'node .claude/avancar.mjs --pr <n> --repo <owner/repo> --modo projeto --integracao <branch>';
export const REGRAS = [
  { file: '.claude/briefs/dev.md', lit: CHECK_TICKET },
  { file: '.claude/briefs/critic.md', lit: EXECUTOR },
  { file: '.claude/briefs/batch.md', lit: EXECUTOR },
  { file: '.claude/briefs/round-minus-1.md', lit: EXECUTOR },
  { file: 'FRAMEWORK.md', lit: AVANCAR },
];

// O NO_MERGE do check.cjs, tal como está na base
export const NO_MERGE = /^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without|nunca|sem|nenhum)\b).*$/im;
export const LITERAIS = { push: /\bpush\w*\b/gi, PR: /\bPRs?\b/g, merge: /\bmerg\w*\b/gi };
export const temLiteral = (l) => Object.values(LITERAIS).some((re) => l.match(re));

const lixo = [];
process.on('exit', () => { for (const d of lixo) try { rmSync(d, { recursive: true, force: true }); } catch { /* um motor ainda a sair */ } });
export const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); lixo.push(d); return d; };
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
export const fim = (r) => '\n--- saída (fim) ---\n' + (r.out ?? '').slice(-2000);

const TEMP = tmp('critico-v09-temp-');
export const ambiente = () => ({ ...sandboxEnv(), TEMP, TMP: TEMP, TMPDIR: TEMP, DISABLE_AUTOUPDATER: '1', GIT_CONFIG_NOSYSTEM: '1' });

export const conjunto = async (nome) => {
  const s = (await loadCorpus('answers')).find((x) => x.name === nome);
  assert.ok(s, `scripts/corpus/answers/${nome} não existe`);
  return s.value;
};

// Gera o projeto de um conjunto de respostas com o scaffold do pacote dado (por omissão o do HEAD), como o buildProject do f-02-r0
const PT_DOCS = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md', ...['dev', 'critic', 'round-minus-1', 'batch'].map((b) => `.claude/briefs/${b}.md`)];
export const gerar = async (answers, pacote = ROOT) => {
  const { scaffold } = await import(pathToFileURL(join(pacote, 'scripts/scaffold.mjs')).href);
  const dest = tmp('critico-v09-proj-');
  await scaffold(answers, { dest });
  if (/^pt/i.test(lerJson(join(dest, '.claude/forge.json')).langTag)) {
    for (const rel of PT_DOCS) if (existsSync(join(dest, rel))) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  }
  return dest;
};

// O pacote do merge-base (git archive numa pasta temporária), para gerar o projeto «antes» com as mesmas respostas; null sem origin/main
let pacote;
export const pacoteDaBase = () => {
  if (pacote !== undefined) return pacote;
  const b = base();
  if (!b) return (pacote = null);
  const d = tmp('critico-v09-base-'), tar = join(d, 'pacote.tar');
  const a = spawnSync('git', ['archive', '--format=tar', '-o', tar, b], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(a.status, 0, 'git archive do merge-base: ' + a.stderr);
  const x = spawnSync('tar', ['-xf', tar, '-C', d], { encoding: 'utf8' });
  assert.equal(x.status, 0, 'tar: ' + x.stderr);
  return (pacote = d);
};

// ---------- O check do projeto ----------
const troca = (s, cwd) => [cwd, cwd.replaceAll('\\', '/'), cwd.replaceAll('\\', '\\\\')].reduce((t, p) => t.split(p).join('<P>'), s);
export const linhasDo = (out, cwd) => out.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2})/.test(l)).map((l) => ({ estado: l.slice(0, 4).trim(), nome: troca(l.slice(6), cwd) }));
export const check = (cwd) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs'], { cwd, encoding: 'utf8', env: ambiente(), timeout: 240000, windowsHide: true });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, linhas: linhasDo(out, cwd) };
};
export const mesma = (a, b) => a === b || a.startsWith(b + ' (') || b.startsWith(a + ' (');
// As linhas que estavam ok em `antes` e estão a FAIL em `depois`, pelo nome sem o detalhe « (...)». Fica de fora a render:, que corre um check
// aninhado e cai com qualquer brief em falta, com ou sem a regra nova.
const cabeca = (s) => s.split(' (')[0];
export const viradas = (antes, depois) => {
  const ok = new Set(antes.linhas.filter((l) => l.estado === 'ok').map((l) => cabeca(l.nome)));
  return depois.linhas.filter((l) => l.estado === 'FAIL' && ok.has(cabeca(l.nome)) && !l.nome.startsWith('render:')).map((l) => l.nome);
};

// Uma mutação do corpus, aplicada como no f-02-r0 C2: a linha dela está ok no projeto sem mutação e FAIL com ela, e o check dá 1
export const aplicaMutacao = async ({ name, value: m }) => {
  const P = await gerar(await conjunto(m.base));
  applySeed(P, m.seed);
  const antes = check(P);
  assert.equal(lineState(antes.out, m.line), 'ok', `${name}: a linha «${m.line}» não está ok no projeto sem mutação` + fim(antes));
  const f = join(P, m.file);
  assert.ok(existsSync(f), `${name}: ${m.file} não existe no projeto gerado`);
  const t = readFileSync(f, 'utf8');
  assert.ok(t.includes(m.find), `${name}: o texto a procurar não existe em ${m.file}`);
  writeFileSync(f, t.split(m.find).join(m.replace));
  const depois = check(P);
  assert.equal(depois.status, 1, `${name}: o check passou depois da mutação` + fim(depois));
  assert.equal(lineState(depois.out, m.line), 'FAIL', `${name}: a linha «${m.line}» não falhou` + fim(depois));
};

// ---------- Os textos do projeto ----------
const CODIGO = new Set(['.claude/executor.mjs', '.claude/afetadas.mjs', '.claude/check-ticket.mjs', '.claude/avancar.mjs', '.claude/check.cjs']);
// { caminho relativo: texto } de todo o ficheiro de texto do projeto, sem os 4 módulos nem o check.cjs
export const textos = (P) => Object.fromEntries(walk(P)
  .map((f) => [relative(P, f).replaceAll('\\', '/'), f])
  .filter(([rel]) => !CODIGO.has(rel) && !/\.(png|jpe?g|gif|ico|woff2?)$/i.test(rel))
  .map(([rel, f]) => [rel, readFileSync(f, 'utf8')]));
export const ehWorkflow = (rel) => rel.startsWith('.claude/workflows/');

// ---------- Os workflows do projeto, com agentes falsos no molde dos do check.cjs ----------
export const fluxo = async (P, file, args, impl) => {
  const run = { calls: [], logs: [] };
  const src = readFileSync(join(P, '.claude/workflows', file), 'utf8').replace(/^export const meta\s*=/m, 'const meta =');
  const agent = async (prompt, opts) => { run.calls.push({ prompt, opts }); const a = await impl(prompt, opts); return opts.label === 'graph:update' && a === 'ok' ? 'graph: updated' : a; };
  const ctx = vm.createContext({ args, agent, parallel: (ts) => Promise.all(ts.map((t) => t().catch(() => null))), phase: () => {}, log: (m) => run.logs.push(m) });
  vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx);
  try { run.out = await new vm.Script('(async () => {' + src + '\n})()').runInContext(ctx); } catch (e) { run.err = e; }
  return run;
};
export const prompts = (run, label) => run.calls.filter((c) => c.opts?.label === label).map((c) => c.prompt);

// Os args do check (base, contract, piece e r0), com os models, o language e o escalation do forge.json do projeto
const r0 = (id) => ({ id, attacks: [{ id: id + '-a1', file: 'tests/critico/' + id + '-r0/a1.test.mjs', passesOnBase: false }, { id: id + '-g1', file: 'tests/critico/' + id + '-r0/g1.test.mjs', guard: true, passesOnBase: true }], failingOnBase: true, gaps: [] });
const PECA = { id: 'p', title: 'P', goal: 'META-P', bar: 'BAR-X', owns: ['src/a.js', 'src/only-owns.js'], tdd: true, issue: 7, objective: 'OBJ-P', input: 'branch main, files src/a.js', criteria: [{ text: 'The export returns 3 rows', oracle: 'corpus', command: 'node --test src/a.test.js' }], fails: 'a criterion that fails', outOfScope: 'the PDF export', env: 'Node 20', output: 'a draft PR' };
export const argsBase = (P, over = {}) => {
  const fj = lerJson(join(P, '.claude/forge.json'));
  return { checkpoint: { n: 1, title: 'T' }, root: 'C:\\p', dashboardUrl: 'https://x', context: 'CTX-SPEC-PLAN-TASKS', models: fj.models, language: fj.language, attacks: [r0('p')], mode: 'rigorous', escalation: { ...fj.escalation, sameCriterionFailures: { ...fj.escalation.sameCriterionFailures, value: 2 } }, pieces: [{ ...PECA }], ...over };
};
// O dev entrega e o crítico reprova a R1 e aprova a R2
export const agentesBuild = (P) => {
  const fj = lerJson(join(P, '.claude/forge.json')), declarado = (r) => { const m = fj.models[r]; return m.model + ' ' + (m.label || m.model); };
  const dev = { summary: 'R', filesChanged: ['src/a.js'], testCommand: 'TEST-DEV', redEvidence: 'RED-EV', greenEvidence: 'GREEN-EV', model: declarado('developer') };
  return (p, o) => {
    if (o.label.startsWith('build:')) return dev;
    if (!o.label.startsWith('critic:')) return 'ok';
    const ours = /^A: .*src\/a\.js/m.test(p) ? 'A' : 'B', ganha = +o.label.match(/:r(\d+)$/)[1] >= 2;
    return { winner: ganha ? ours : ours === 'A' ? 'B' : 'A', testsPass: true, blocking: ganha ? [] : [{ criterion: 'C1', materiality: 2, category: 'criterion', description: 'DESC', repro: 'BLOCK' }], minor: [], barQuestions: [], followUp: [], visualBelowReference: false, attacks: JSON.parse(p.match(/as you measured it: (\[.*\])/)[1]).map((a) => ({ id: a.id, passesOnDelivery: true })), biggestGap: 'GAP', reasoning: 'R', model: declarado('critic') };
  };
};
// O tester declara os passes dados do testCommand
export const agentesLote = (P, command, passes) => {
  const T = lerJson(join(P, '.claude/forge.json')).models.tester;
  return (p, o) => (o.label === 'batch:tester' ? { runs: passes.map((n) => ({ kind: 'suite', command, pass: n, failures: [] })), isolated: [], main: [], model: T.model + ' ' + (T.label || T.model) } : 'ok');
};
export const argsLote = (P, testCommand) => argsBase(P, { pieces: [{ id: 'pa', title: 'PA', owns: ['src/pa.js'] }], testCommand });