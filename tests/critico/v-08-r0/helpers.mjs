// Ronda −1 do V-08 (#132): utilitários partilhados pelos ataques aos módulos de velocidade nos projetos gerados. Só biblioteca padrão.
// Reutiliza o sandbox, o corpus e a tradução substituta do f-02-r0 (HOME, USERPROFILE e CLAUDE_CONFIG_DIR temporários; sem NODE_TEST_CONTEXT).
// Sem rede, sem gh real e sem sessões claude. As vagas do executor e os clones do check-ticket ficam num TEMP privado, nunca nos da máquina.
//
// LEITURA DO CONTRATO (corpo da #132, sem comentários à data, 2026-11-01; contratos das peças: V-01 #125 com o REDESENHO 6561464877, V-02 #126
// com 6561964549 e 6562301008, V-05 #129, V-06 #130). Cada ponto vai em PERGUNTA na issue; a resposta do orquestrador prevalece.
// - Os 4 módulos ficam em .claude/ com o nome que têm em scripts/: executor.mjs, afetadas.mjs, check-ticket.mjs e avancar.mjs.
// - No projeto gerado, o manifesto e o mapa são .claude/suites.json e .claude/mapa-suites.json (os de templates/.claude/), e não há scripts/.
//   O executor corre como `node .claude/executor.mjs ...` e o check-ticket como `node .claude/check-ticket.mjs ...`, com o cwd na raiz do
//   projeto e sem --raiz. Os resultados ficam em <projeto>/.forge/resultados/<sha>-<arvore>-p1.json (spec §4.2). Um código 3 repete a mesma
//   chamada com --continuar.
// - «Linha nova do check.cjs»: uma linha da saída do check do projeto gerado pelo HEAD que não está na saída do check do projeto gerado pelo
//   pacote do merge-base, com as mesmas respostas. Duas linhas são a mesma quando são iguais ou quando uma é a outra mais um detalhe « (...)».
//   «Dá ok no projeto gerado» é o projeto tal como sai do scaffold (sem git), como no f-02-r0 C2.
// - As três linhas do mecanismo: num projeto gerado e commitado, (a) apagar um dos 4 módulos, (b) um .claude/suites.json que não é JSON ou que
//   não tem a lista suites e (c) um mapa sem nenhuma regra que case com os ficheiros rastreados põem cada um a FAIL uma linha que estava ok.
//   Essa linha tem uma mutação no corpus (campo line), que, aplicada como no f-02-r0 C2, a põe a FAIL.
// - C3: o projeto tal como sai do scaffold (o .gitignore dele incluído), num repo git. main = o projeto; ticket = main mais 2 suítes `comando`
//   (`formato: tap`, cada uma um `node --test --test-reporter=tap` de um ficheiro). O executor dá 1; o resultado do HEAD tem a verde
//   (pass, 2 pass, 0 fail) e a vermelha (fail, 1 pass, 1 fail). O check-ticket (`--ambito ** --base main`) dá um código fora de 0 e de 3, e a
//   linha `FAIL afetadas no ramo` nomeia a vermelha.
// - C5: o testCommand `node .claude/executor.mjs --todas`, corrido 2× no mesmo projeto, executa a suíte 2× (a 2.ª corrida não reaproveita o
//   resultado da 1.ª). O gauntlet-batch do projeto, com o bloco do lote do BOOTSTRAP.md e esse testCommand, aprova 2 passes e recusa 1 (runs).
// Regras 8 e 9 dos briefs: base() e soNoTicket() são os de tests/critico/_comum/ (F-26), reexportados daqui.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { applySeed } from '../../../scripts/corpus-seed.mjs';
import { ROOT, loadCorpus, sandboxEnv, translatePt, lineState } from '../f-02-r0/helpers.mjs';
import { base } from '../_comum/base.mjs';

export { ROOT, loadCorpus, base };
export { soNoTicket } from '../_comum/ambito.mjs';

export const MODULOS = ['executor.mjs', 'afetadas.mjs', 'check-ticket.mjs', 'avancar.mjs'];
export const NO_PROJETO = (m) => `.claude/${m}`;
export const MANIFESTO = '.claude/suites.json';
export const MAPA = '.claude/mapa-suites.json';
export const TEST_COMMAND = 'node .claude/executor.mjs --todas';

const lixo = [];
process.on('exit', () => { for (const d of lixo) try { rmSync(d, { recursive: true, force: true }); } catch { /* um motor ainda a sair */ } });
export const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); lixo.push(d); return d; };
export const escreve = (raiz, rel, texto) => { const f = join(raiz, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, texto); return f; };
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
export const fim = (r) => '\n--- saída (fim) ---\n' + (r.out ?? '').slice(-2000);

// O ambiente dos filhos: o sandbox do f-02-r0 e um TEMP privado (o os.tmpdir() do executor: as vagas globais e os clones do check-ticket)
const TEMP = tmp('critico-v08-temp-');
export const ambiente = (extra = {}) => ({ ...sandboxEnv(), TEMP, TMP: TEMP, TMPDIR: TEMP, DISABLE_AUTOUPDATER: '1', GIT_CONFIG_NOSYSTEM: '1', ...extra });

export const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8', env: ambiente() });
  if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr);
  return r.stdout;
};
export const commita = (cwd, msg) => { git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '-m', msg); return git(cwd, 'rev-parse', 'HEAD').trim(); };
// O projeto passa a ser um repo git com tudo commitado na main; devolve o sha
export const repo = (cwd) => { git(cwd, 'init', '-q', '-b', 'main'); return commita(cwd, 'projeto gerado'); };

export const conjunto = async (nome) => {
  const s = (await loadCorpus('answers')).find((x) => x.name === nome);
  assert.ok(s, `scripts/corpus/answers/${nome} não existe`);
  return s.value;
};

// Gera o projeto de um conjunto de respostas com o scaffold do pacote dado (por omissão o do HEAD), como o buildProject do f-02-r0
const PT_DOCS = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md', ...['dev', 'critic', 'round-minus-1', 'batch'].map((b) => `.claude/briefs/${b}.md`)];
export const gerar = async (answers, pacote = ROOT) => {
  const { scaffold } = await import(pathToFileURL(join(pacote, 'scripts/scaffold.mjs')).href);
  const dest = tmp('critico-v08-proj-');
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
  const d = tmp('critico-v08-base-'), tar = join(d, 'pacote.tar');
  const a = spawnSync('git', ['archive', '--format=tar', '-o', tar, b], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(a.status, 0, 'git archive do merge-base: ' + a.stderr);
  const x = spawnSync('tar', ['-xf', tar, '-C', d], { encoding: 'utf8' });
  assert.equal(x.status, 0, 'tar: ' + x.stderr);
  return (pacote = d);
};

// O que o projeto gerado tem de ter antes de qualquer ataque: os 4 módulos, o manifesto e o mapa
export const preCondicao = (P) => {
  const faltam = [...MODULOS.map(NO_PROJETO), MANIFESTO, MAPA].filter((f) => !existsSync(join(P, f)));
  assert.deepEqual(faltam, [], 'o projeto gerado não tem: ' + faltam.join(', '));
};

// ---------- O check do projeto ----------
const troca = (s, cwd) => [cwd, cwd.replaceAll('\\', '/'), cwd.replaceAll('\\', '\\\\')].reduce((t, p) => t.split(p).join('<P>'), s);
// As linhas ok/FAIL da saída do check, { estado, nome }, com o caminho do projeto trocado por <P>
export const linhasDo = (out, cwd) => out.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2})/.test(l)).map((l) => ({ estado: l.slice(0, 4).trim(), nome: troca(l.slice(6), cwd) }));
export const check = (cwd) => {
  const r = spawnSync(process.execPath, ['.claude/check.cjs'], { cwd, encoding: 'utf8', env: ambiente(), timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, linhas: linhasDo(out, cwd) };
};
export const mesma = (a, b) => a === b || a.startsWith(b + ' (') || b.startsWith(a + ' (');

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

// ---------- Os módulos no projeto ----------
// Corre `node .claude/<modulo> ...args` no projeto; um código 3 (incompleto) repete com --continuar, no máximo `max` chamadas
export const correAteFim = (P, modulo, args, { max = 12, timeout = 300000 } = {}) => {
  const chamadas = [];
  for (let i = 0; i < max; i++) {
    const r = spawnSync(process.execPath, [NO_PROJETO(modulo), ...args, ...(i ? ['--continuar'] : [])], { cwd: P, encoding: 'utf8', env: ambiente(), timeout, windowsHide: true });
    chamadas.push({ status: r.status, out: (r.stdout || '') + (r.stderr || '') + (r.error ? '\n[erro] ' + r.error.message : '') });
    if (r.status !== 3) break;
  }
  return { ...chamadas.at(-1), chamadas: chamadas.length, out: chamadas.map((c, i) => `--- chamada ${i + 1} (código ${c.status}) ---\n${c.out}`).join('\n') };
};

// O ficheiro de resultados mais recente do sha dado, no passe 1 (spec §4.2)
export const resultado = (P, sha) => {
  const dir = join(P, '.forge', 'resultados');
  const fs = existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith(sha + '-') && n.endsWith('-p1.json')) : [];
  assert.ok(fs.length, `nenhum ficheiro de resultados do ${sha} (passe 1) em .forge/resultados/`);
  return lerJson(join(dir, fs.sort((a, b) => statSync(join(dir, a)).mtimeMs - statSync(join(dir, b)).mtimeMs).at(-1)));
};

// Uma suíte `comando` que corre um ficheiro de teste com o reporter TAP
export const suiteComando = (nome, ficheiro) => ({ nome, tipo: 'comando', comando: [process.execPath, '--test', '--test-reporter=tap', ficheiro], formato: 'tap' });
// Troca as suítes do .claude/suites.json do projeto, com os outros campos do template como estão
export const comSuites = (P, suites) => { const m = lerJson(join(P, MANIFESTO)); writeFileSync(join(P, MANIFESTO), JSON.stringify({ ...m, suites }, null, 2) + '\n'); };

// ---------- O gauntlet-batch do projeto ----------
// O .claude/workflows/gauntlet-batch.js num contexto vm igual ao do check.cjs (args, agent, parallel, phase, log; sem relógio nem Math.random)
export const lote = async (P, args, impl) => {
  const run = { calls: [], logs: [] };
  const src = readFileSync(join(P, '.claude/workflows/gauntlet-batch.js'), 'utf8').replace(/^export const meta\s*=/m, 'const meta =');
  const agent = async (prompt, opts) => { run.calls.push({ prompt, opts }); const a = await impl(prompt, opts); return opts.label === 'graph:update' && a === 'ok' ? 'graph: updated' : a; };
  const ctx = vm.createContext({ args, agent, parallel: (ts) => Promise.all(ts.map((t) => t().catch(() => null))), phase: () => {}, log: (m) => run.logs.push(m) });
  vm.runInContext('Date.now = Math.random = () => { throw new Error("forbidden in Workflow") }; Date = new Proxy(Date, { construct: (T, a) => a.length ? new T(...a) : Date.now() })', ctx);
  try { run.out = await new vm.Script('(async () => {' + src + '\n})()').runInContext(ctx); } catch (e) { run.err = e; }
  return run;
};