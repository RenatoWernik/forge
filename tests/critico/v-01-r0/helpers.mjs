// Ronda −1 do V-01 (#125, spec #123 §4.1 e §4.2): utilitários dos ataques ao executor paralelo. Só biblioteca padrão, sem rede e sem
// servidores. Os casos vivem em scripts/fixtures/executor/<caso>/ e cada teste copia-os para um repo git temporário (ver sonda.mjs).
//
// LEITURA DO CONTRATO (registada como PERGUNTA na #125; a resposta do orquestrador prevalece):
// - `--raiz <dir>` é a raiz do repo sobre o qual o executor corre: lê <dir>/scripts/suites.json, expande os `ficheiros` a partir de <dir>
//   e grava em <dir>/.forge/resultados/. Os ataques correm sempre o scripts/executor.mjs deste repo com `--raiz <repo temporário>`.
// - cada unidade do ficheiro de resultados traz `inicio` (o C3 verifica a retoma «pelo PID e pelo inicio de cada unidade»), e o `pid` é o
//   do filho `node --test` que a correu (o pai do processo do ficheiro de teste).
// - as vagas globais vivem em os.tmpdir()/forge-vagas/ do executor (§4.1): cada cenário dá aos executores que lança um TEMP/TMP/TMPDIR
//   privado, partilhado só entre os executores desse cenário, por isso nunca toca nas vagas reais da máquina.
// Tudo o que um teste lança morre pelo PID (a árvore desse PID) no `after`; nunca se mata por nome.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const EXECUTOR = join(ROOT, 'scripts/executor.mjs');
export const MANIFESTO = join(ROOT, 'scripts/suites.json');
export const FIXTURES = join(ROOT, 'scripts/fixtures/executor');
export const exigeExecutor = () => assert.ok(existsSync(EXECUTOR), 'falta scripts/executor.mjs');
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));
export async function esperaAte(cond, ms, passo = 100) {
  const fim = Date.now() + ms;
  for (;;) { if (cond()) return true; if (Date.now() >= fim) return false; await espera(passo); }
}

// --- pastas temporárias e processos lançados (limpos no after de cada ficheiro) ---
const PASTAS = new Set(), PIDS = new Set();
export const tmp = (p = 'v01-') => { const d = mkdtempSync(join(tmpdir(), p)); PASTAS.add(d); return d; };
export const registaPid = (pid) => { if (Number.isInteger(pid) && pid > 0) PIDS.add(pid); };
export const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// mata a árvore de um PID que este teste lançou (ou que um processo lançado por ele registou): taskkill /PID /T no Windows, o grupo em POSIX
export function mataArvore(pid) {
  if (!vivo(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} } }
}
export async function limpa() {
  // os motores destacados (REDESENHO do V-01) não morrem com a chamada: só os dos repos temporários deste teste, pelo PID gravado em .forge/motor/*.json
  for (const d of PASTAS) {
    const m = join(d, '.forge', 'motor');
    if (!existsSync(m)) continue;
    for (const n of readdirSync(m).filter((x) => x.endsWith('.json'))) { try { PIDS.add(lerJson(join(m, n)).pid); } catch {} }
  }
  for (const pid of PIDS) mataArvore(pid);
  await espera(300);
  for (const d of PASTAS) { try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} }
  PIDS.clear(); PASTAS.clear();
}

// o ambiente dos filhos: sem NODE_TEST_CONTEXT nem GITHUB_HEAD_REF herdados, sem a config de sistema nem a global do git
let vazio;
export const ambiente = (extra = {}) => {
  if (!vazio) { vazio = join(tmp('v01-gitconfig-'), 'vazio'); writeFileSync(vazio, ''); }
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio, GIT_TERMINAL_PROMPT: '0' };
  delete e.NODE_TEST_CONTEXT;
  delete e.GITHUB_HEAD_REF;
  return { ...e, ...extra };
};
// um TEMP privado para os executores de um cenário: as vagas globais (os.tmpdir()/forge-vagas/) ficam lá dentro
export const tempPrivado = () => { const t = tmp('v01-temp-'); return { TEMP: t, TMP: t, TMPDIR: t }; };

export const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', ...a],
  { cwd, encoding: 'utf8', env: ambiente() });
export const gitOk = (cwd, ...a) => { const r = git(cwd, ...a); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
export const shaDe = (d) => gitOk(d, 'rev-parse', 'HEAD').trim();

// o caso scripts/fixtures/executor/<caso>/ num repo git novo, com a sonda na raiz, o .gitignore (.forge/ e .sonda/) e um commit: árvore limpa
export function repo(caso) {
  const d = tmp(`v01-${caso}-`);
  cpSync(join(FIXTURES, caso), d, { recursive: true });
  copyFileSync(join(FIXTURES, 'sonda.mjs'), join(d, 'sonda.mjs'));
  copyFileSync(join(FIXTURES, 'gitignore'), join(d, '.gitignore'));
  gitOk(d, 'init', '-q', '-b', 'main');
  gitOk(d, 'config', 'core.autocrlf', 'false');
  gitOk(d, 'add', '-A');
  gitOk(d, 'commit', '-q', '-m', 'fixture');
  return d;
}

// lança `node scripts/executor.mjs <args> --raiz <raiz>`; `fim` resolve no exit (não no close: um neto com o stdio herdado não o prende)
export function lanca(raiz, args, { env = {}, limite_ms = 120000 } = {}) {
  const t0 = Date.now();
  const p = spawn(process.execPath, [EXECUTOR, ...args, '--raiz', raiz], { cwd: raiz, env: ambiente(env), stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', windowsHide: true });
  registaPid(p.pid);
  let out = '', pendurado = false;
  p.stdout.on('data', (b) => { out += b; });
  p.stderr.on('data', (b) => { out += b; });
  const relogio = setTimeout(() => { pendurado = true; mataArvore(p.pid); }, limite_ms);
  const fim = new Promise((resolve) => {
    const acaba = (status, signal) => { clearTimeout(relogio); const ms = Date.now() - t0; setTimeout(() => { p.stdout.destroy(); p.stderr.destroy(); resolve({ status, signal, ms, out, pendurado }); }, 200); };
    p.on('exit', acaba);
    p.on('error', (e) => { out += String(e); acaba(null, null); });
  });
  return { pid: p.pid, fim };
}
export const correr = (raiz, args, opcoes) => lanca(raiz, args, opcoes).fim;
export const saida = (r) => `saída ${r.status}${r.pendurado ? ' (PENDURADO: morto pelo teste)' : ''} ao fim de ${Math.round(r.ms / 1000)} s\n${r.out.slice(-2500)}`;

// --- o que o executor deixou ---
export const pastaResultados = (raiz) => join(raiz, '.forge', 'resultados');
export const resultados = (raiz) => {
  const d = pastaResultados(raiz);
  return existsSync(d) ? readdirSync(d).filter((n) => n.endsWith('.json')).sort().map((nome) => ({ nome, dados: lerJson(join(d, nome)) })) : [];
};
export const umResultado = (raiz) => {
  const r = resultados(raiz);
  assert.equal(r.length, 1, `esperava 1 ficheiro de resultados em .forge/resultados/, há ${r.length}: ${r.map((x) => x.nome).join(', ')}`);
  return r[0];
};
export const unidade = (res, ficheiro) => res.unidades.find((u) => u.ficheiro === ficheiro);
export const eventos = (raiz) => {
  const f = join(raiz, '.sonda', 'eventos.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
export const inicios = (raiz, f) => eventos(raiz).filter((e) => e.evento === 'inicio' && (!f || e.f === f));
// os intervalos [ini, fim] registados pelas fixtures (o processo do ficheiro de teste, dentro da vaga da unidade)
export function intervalos(evs, tag = '') {
  const ab = new Map(), out = [];
  for (const e of evs) {
    const k = `${e.f}|${e.pid}`;
    if (e.evento === 'inicio') ab.set(k, e.t);
    else if (e.evento === 'fim' && ab.has(k)) { out.push({ f: e.f, tag, ini: ab.get(k), fim: e.t }); ab.delete(k); }
  }
  return out;
}
// o máximo de intervalos abertos ao mesmo tempo (dentro de [de, ate], se dados); um fim no mesmo instante de um início fecha primeiro
export function sobreposicaoMax(ints, de = -Infinity, ate = Infinity) {
  const ev = [];
  for (const i of ints) { const a = Math.max(i.ini, de), b = Math.min(i.fim, ate); if (a < b) ev.push([a, 1], [b, -1]); }
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let n = 0, max = 0;
  for (const [, d] of ev) { n += d; max = Math.max(max, n); }
  return max;
}

// as linhas de resumo do TAP (`# pass|fail|skipped|todo N`), a última de cada
export function contagensTap(texto) {
  const ult = (k) => { const m = [...texto.matchAll(new RegExp(`^# ${k} (\\d+)\\s*$`, 'gm'))]; return m.length ? +m[m.length - 1][1] : null; };
  return { pass: ult('pass'), fail: ult('fail'), skip: ult('skipped'), todo: ult('todo') };
}

// --- o esquema da spec §4.2: devolve a lista de erros (vazia = válido); com `raiz`, o tap de cada unidade final tem de existir e bater certo ---
const ESTADOS = ['pass', 'fail', 'limite', 'erro', 'em_curso'];
const FINAIS = ['pass', 'fail', 'limite', 'erro'];
export const final = (u) => FINAIS.includes(u.estado);
const inteiro = (x, min = 0) => Number.isInteger(x) && x >= min;
const data = (x) => typeof x === 'string' && Number.isFinite(Date.parse(x));
export function validaResultado(r, { raiz } = {}) {
  const e = [];
  const exige = (cond, msg) => { if (!cond) e.push(msg); };
  if (!r || typeof r !== 'object') return ['o resultado não é um objeto'];
  exige(r.versao === 1, `versao: ${JSON.stringify(r.versao)}`);
  exige(typeof r.sha === 'string' && /^[0-9a-f]{40}$/.test(r.sha), `sha: ${JSON.stringify(r.sha)}`);
  exige(r.arvore === 'limpa' || (typeof r.arvore === 'string' && /^suja:[0-9a-f]{64}$/.test(r.arvore)), `arvore: ${JSON.stringify(r.arvore)}`);
  exige(typeof r.node === 'string' && /^v\d+\.\d+\.\d+/.test(r.node), `node: ${JSON.stringify(r.node)}`);
  exige(typeof r.comando === 'string' && r.comando.length > 0, 'comando em falta');
  exige(data(r.inicio) && data(r.fim) && Date.parse(r.fim) >= Date.parse(r.inicio), `inicio/fim: ${r.inicio} / ${r.fim}`);
  exige(typeof r.completo === 'boolean', `completo: ${JSON.stringify(r.completo)}`);
  exige(Array.isArray(r.unidades) && r.unidades.length > 0, 'unidades vazias ou em falta');
  exige(r.suites && typeof r.suites === 'object' && !Array.isArray(r.suites), 'suites em falta');
  if (!Array.isArray(r.unidades) || !r.suites) return e;
  for (const [i, u] of r.unidades.entries()) {
    const q = `unidades[${i}] (${u?.ficheiro})`;
    exige(typeof u.suite === 'string' && u.suite in r.suites, `${q}: suite ${JSON.stringify(u.suite)} fora de suites`);
    exige(typeof u.ficheiro === 'string' && !isAbsolute(u.ficheiro) && !u.ficheiro.includes('\\'), `${q}: ficheiro tem de ser relativo e com /`);
    exige(u.bloco === null || typeof u.bloco === 'string', `${q}: bloco ${JSON.stringify(u.bloco)}`);
    exige(ESTADOS.includes(u.estado), `${q}: estado ${JSON.stringify(u.estado)}`);
    for (const k of ['pass', 'fail', 'skip', 'todo']) exige(inteiro(u[k]), `${q}: ${k} ${JSON.stringify(u[k])}`);
    exige(Array.isArray(u.skips) && u.skips.every((s) => s && typeof s.teste === 'string' && typeof s.motivo === 'string'), `${q}: skips`);
    exige(u.duracoes && typeof u.duracoes === 'object' && Object.values(u.duracoes).every((v) => typeof v === 'number' && v >= 0), `${q}: duracoes`);
    exige(typeof u.duracao_s === 'number' && u.duracao_s >= 0, `${q}: duracao_s ${JSON.stringify(u.duracao_s)}`);
    exige(inteiro(u.concorrentes_max, 1), `${q}: concorrentes_max ${JSON.stringify(u.concorrentes_max)}`);
    exige(inteiro(u.pid, 1), `${q}: pid ${JSON.stringify(u.pid)}`);
    exige(data(u.inicio), `${q}: inicio ${JSON.stringify(u.inicio)}`);
    exige(typeof u.tap === 'string' && u.tap.startsWith('.forge/resultados/logs/'), `${q}: tap ${JSON.stringify(u.tap)}`);
    if (u.estado === 'pass') exige(u.fail === 0, `${q}: estado pass com fail ${u.fail}`);
    if (raiz && (u.estado === 'pass' || u.estado === 'fail') && typeof u.tap === 'string') {
      const f = join(raiz, u.tap);
      if (!existsSync(f)) { e.push(`${q}: o tap ${u.tap} não existe`); continue; }
      const c = contagensTap(readFileSync(f, 'utf8'));
      for (const k of ['pass', 'fail', 'skip', 'todo']) exige(c[k] === u[k], `${q}: ${k} = ${u[k]}, o TAP diz ${c[k]}`);
    }
  }
  for (const [nome, s] of Object.entries(r.suites)) {
    const us = r.unidades.filter((u) => u.suite === nome);
    exige(us.length > 0, `suites.${nome} sem unidades`);
    exige(s && ESTADOS.includes(s.estado), `suites.${nome}.estado ${JSON.stringify(s?.estado)}`);
    for (const k of ['pass', 'fail', 'skip']) exige(inteiro(s?.[k]) && s[k] === us.reduce((a, u) => a + (u[k] || 0), 0), `suites.${nome}.${k} = ${s?.[k]}, a soma das unidades dá ${us.reduce((a, u) => a + (u[k] || 0), 0)}`);
    if (r.completo === true) exige((s?.estado === 'pass') === us.every((u) => u.estado === 'pass'), `suites.${nome}.estado ${s?.estado} não bate com as unidades`);
  }
  if (r.completo === true) exige(r.unidades.every(final), 'completo: true com unidades sem estado final');
  return e;
}