// Ronda −1 do V-05 (#129, spec #123 §3, §4.3 e §4.5): utilitários dos ataques ao `check-ticket`. Só biblioteca padrão, sem rede e sem
// servidores. Cada cenário é um repo git temporário com o seu próprio manifesto (scripts/suites.json) e mapa (scripts/mapa-suites.json, no
// formato da §4.3), e o scripts/check-ticket.mjs deste repo corre sobre ele com --raiz. O gh é falso: o GH_BIN aponta para uma cópia do node
// chamada gh(.exe), e o gh-falso.mjs (pré-carregado por NODE_OPTIONS=--import) regista o argv dessa cópia e sai; nos outros node não faz nada.
//
// LEITURA DO CONTRATO (registada como PERGUNTA na #129; a resposta do orquestrador prevalece):
// - `--raiz <dir>` é o repo sobre o qual corre (manifesto, mapa, lints, .forge/), como no executor; `--ambito g1 g2 ...` leva os globs seguidos.
// - cada execução imprime sempre as 6 linhas, uma por passo e por esta ordem, também depois de um FAIL: `ok <passo>` ou `FAIL <passo> (detalhe)`,
//   com <passo> = árvore limpa | lint | âmbito | afetadas no ramo | pós-merge | esquema. Outras linhas (do executor) podem aparecer pelo meio.
// - o código de saída é 0 com os 6 ok, 1 com algum FAIL e 3 quando o orçamento não chega (como no executor).
// - o passo lint corre os lints do repo da raiz: scripts/guardas-critico.test.mjs e scripts/mapa-suites.test.mjs.
// - o relatório é <raiz>/.forge/check-ticket/<sha do HEAD>.json; o <sha256> do VERDE é o dos bytes desse ficheiro, e <sha> é o HEAD inteiro.
// - GH_BIN é o caminho do executável do gh (corre sem shell). A 1.ª linha do --body é `CHECK-TICKET: VERDE <sha> <sha256>`, ou começa por
//   `CHECK-TICKET: VERMELHO`.
// Tudo o que um teste lança morre pelo PID (a árvore desse PID) no `after`; nunca se mata por nome.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CHECK = join(ROOT, 'scripts/check-ticket.mjs');
const PRELOAD = fileURLToPath(new URL('./gh-falso.mjs', import.meta.url));
export const exigeCheck = () => assert.ok(existsSync(CHECK), 'falta scripts/check-ticket.mjs');
export const PASSOS = ['árvore limpa', 'lint', 'âmbito', 'afetadas no ramo', 'pós-merge', 'esquema'];
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// --- pastas temporárias e processos lançados (limpos no after de cada ficheiro) ---
const PASTAS = new Set(), PIDS = new Set();
export const tmp = (p = 'v05-') => { const d = mkdtempSync(join(tmpdir(), p)); PASTAS.add(d); return d; };
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export function mataArvore(pid) {
  if (!vivo(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} } }
}
export async function limpa() {
  for (const pid of PIDS) mataArvore(pid);
  await espera(300);
  for (const d of PASTAS) { try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} }
  PIDS.clear(); PASTAS.clear();
}

// o ambiente dos filhos: sem NODE_TEST_CONTEXT nem GITHUB_HEAD_REF herdados, sem a config de sistema nem a global do git (com uma identidade
// para os commits que o check-ticket possa fazer no clone do pós-merge) e com um TEMP privado: as vagas do executor ficam lá dentro
let vazio;
const ambienteGit = () => {
  if (!vazio) { vazio = join(tmp('v05-gitconfig-'), 'vazio'); writeFileSync(vazio, ''); }
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio, GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'critico', GIT_AUTHOR_EMAIL: 'critico@example.invalid', GIT_COMMITTER_NAME: 'critico', GIT_COMMITTER_EMAIL: 'critico@example.invalid' };
  delete e.NODE_TEST_CONTEXT;
  delete e.GITHUB_HEAD_REF;
  return e;
};
export const ambiente = (extra = {}) => { const t = tmp('v05-temp-'); return { ...ambienteGit(), TEMP: t, TMP: t, TMPDIR: t, ...extra }; };

export const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', ...a],
  { cwd, encoding: 'utf8', env: ambienteGit(), maxBuffer: 1 << 28 });
export const gitOk = (cwd, ...a) => { const r = git(cwd, ...a); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
export const shaDe = (d) => gitOk(d, 'rev-parse', 'HEAD').trim();
export const escreve = (d, rel, txt) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), txt); };

// --- o repo de cada cenário (fixtures em texto, sem interpolações) ---
const MANIFESTO = {
  versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 2, orcamento_s: 300,
  suites: [
    { nome: 'scripts', tipo: 'node-test', ficheiros: ['scripts/*.test.mjs'], limite_s: 120 },
    { nome: 'a-r0', tipo: 'node-test', ficheiros: ['tests/critico/a-r0/*.test.mjs'], limite_s: 60 },
    { nome: 'c-r0', tipo: 'node-test', ficheiros: ['tests/critico/c-r0/*.test.mjs'], limite_s: 60 },
  ],
};
// spec §4.3: a regra das mutações é `esquema: true` e o seu consumidor é a c-r0, que nenhum outro caminho traz
export const MAPA = {
  versao: 1, regras: [
    { caminhos: ['tests/critico/_comum/**', 'scripts/suites.json', 'scripts/mapa-suites.json'], suites: ['*'], motivo: 'infraestrutura comum dos testes' },
    { caminhos: ['scripts/corpus/mutations/**'], suites: ['c-r0'], esquema: true },
    { caminhos: ['scripts/**'], suites: ['scripts'] },
    { caminhos: ['README.md', '.gitignore'], suites: ['a-r0'] },
  ],
};
// o lint do mapa do cenário (o do repo, do V-02, lê o histórico deste repo): o JSON lê-se, nenhuma lista vazia, só suítes do manifesto
const LINT_MAPA = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ler = (n) => JSON.parse(readFileSync(new URL('./' + n, import.meta.url), 'utf8'));
test('mapa do cenário: legível, sem listas vazias e só com suítes do manifesto', () => {
  const nomes = ler('suites.json').suites.map((s) => s.nome);
  for (const r of ler('mapa-suites.json').regras) {
    assert.ok(Array.isArray(r.suites) && r.suites.length > 0, 'lista vazia');
    for (const s of r.suites) assert.ok(s === '*' || nomes.includes(s), s);
  }
});
`;
export const FX = {
  x: `import test from 'node:test';
import assert from 'node:assert/strict';
test('a: verde', () => { assert.equal(1 + 1, 2); });
`,
  xMais: `import test from 'node:test';
import assert from 'node:assert/strict';
test('a: verde', () => { assert.equal(1 + 1, 2); });
test('a: outro verde', () => { assert.equal(2 * 2, 4); });
`,
  xVermelho: `import test from 'node:test';
import assert from 'node:assert/strict';
test('a: verde', () => { assert.equal(1 + 1, 3); });
`,
  // o padrão do f-22a-r1 teste 7: lê o merge-base, por isso passa no ramo e falha depois do merge (main = origin/main = HEAD)
  d: `import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const g = (...a) => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();
test('d: o ramo tem commits à frente da origin/main (lê o merge-base)', () => {
  assert.notEqual(g('merge-base', 'HEAD', 'origin/main'), g('rev-parse', 'HEAD'));
});
`,
  // o mesmo teste, mas de âmbito: no pós-merge (main) faz skip com o motivo
  k: `import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { soNoTicket } from '../_comum/ambito.mjs';
const g = (...a) => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();
test('ÂMBITO: só no ramo t-01 (lê o merge-base)', (t) => {
  if (soNoTicket(t, 't-01')) return;
  assert.notEqual(g('merge-base', 'HEAD', 'origin/main'), g('rev-parse', 'HEAD'));
});
`,
  // um teste de âmbito sem soNoTicket: a regra L2 do guardas-critico
  e: `import test from 'node:test';
import assert from 'node:assert/strict';
test('ÂMBITO: o cenário e não chama o helper', () => { assert.ok(true); });
`,
  consumidor: (campos) => `import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
const CONHECIDOS = ` + JSON.stringify(campos) + `;
test('c: cada mutação só tem os campos que este consumidor sabe aplicar', () => {
  for (const f of readdirSync('scripts/corpus/mutations')) {
    const m = JSON.parse(readFileSync('scripts/corpus/mutations/' + f, 'utf8'));
    assert.deepEqual(Object.keys(m).filter((k) => !CONHECIDOS.includes(k)), [], f);
  }
});
`,
  mutacao: JSON.stringify({ file: 'alvo.txt', find: 'a', replace: 'b' }, null, 2) + '\n',
  mutacaoComSeed: JSON.stringify({ file: 'alvo.txt', find: 'a', replace: 'b', seed: { files: { 'alvo.txt': 'a' }, commit: false } }, null, 2) + '\n',
};
export const RAMO = 't-01-cenario';

// o repo base (main, com origin/main = main) e o ramo RAMO com as mudanças do cenário (commitadas); `sujo` mexe depois, sem commit
export function cenario(ramo = () => {}, sujo = () => {}) {
  const d = tmp('v05-cen-');
  escreve(d, '.gitignore', '.forge/\n');
  escreve(d, 'README.md', '# cenário\n');
  escreve(d, 'scripts/suites.json', JSON.stringify(MANIFESTO, null, 2) + '\n');
  escreve(d, 'scripts/mapa-suites.json', JSON.stringify(MAPA, null, 2) + '\n');
  escreve(d, 'scripts/mapa-suites.test.mjs', LINT_MAPA);
  copyFileSync(join(ROOT, 'scripts/guardas-critico.test.mjs'), join(d, 'scripts/guardas-critico.test.mjs'));
  escreve(d, 'scripts/guardas-legado.json', JSON.stringify({ legado: [], emCurso: [] }) + '\n');
  cpSync(join(ROOT, 'scripts/corpus/guardas'), join(d, 'scripts/corpus/guardas'), { recursive: true });
  escreve(d, 'scripts/corpus/mutations/m1.json', FX.mutacao);
  escreve(d, 'tests/critico/_comum/ambito.mjs', readFileSync(join(ROOT, 'tests/critico/_comum/ambito.mjs'), 'utf8'));
  escreve(d, 'tests/critico/a-r0/x.test.mjs', FX.x);
  escreve(d, 'tests/critico/c-r0/z.test.mjs', FX.consumidor(['file', 'find', 'replace']));
  gitOk(d, 'init', '-q', '-b', 'main');
  gitOk(d, 'config', 'core.autocrlf', 'false');
  gitOk(d, 'add', '-A');
  gitOk(d, 'commit', '-q', '-m', 'base do cenário');
  gitOk(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  gitOk(d, 'checkout', '-q', '-b', RAMO);
  ramo(d);
  gitOk(d, 'add', '-A');
  if (git(d, 'diff', '--cached', '--quiet').status !== 0) gitOk(d, 'commit', '-q', '-m', 'o ticket do cenário');
  sujo(d);
  return d;
}

// --- o gh falso: uma cópia do node com o nome gh(.exe), uma por processo de teste; o registo é um por chamada de ghFalso() ---
let binGh;
export function ghFalso() {
  if (!binGh) {
    binGh = join(tmp('v05-ghbin-'), process.platform === 'win32' ? 'gh.exe' : 'gh');
    copyFileSync(process.execPath, binGh);
    if (process.platform !== 'win32') chmodSync(binGh, 0o755);
  }
  const log = join(tmp('v05-ghlog-'), 'chamadas.jsonl');
  const env = { GH_BIN: binGh, GH_FALSO_LOG: log, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(PRELOAD).href}`.trim() };
  return { bin: binGh, log, env, chamadas: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []) };
}
// dois tokens falsos com a forma dos do gh; nunca podem aparecer em nenhuma saída nem ficheiro
export const tokensFalsos = () => ({ GH_TOKEN: 'ghp_V05FALSO' + randomBytes(14).toString('hex'), GITHUB_TOKEN: 'gho_V05FALSO' + randomBytes(14).toString('hex') });

// lança `node scripts/check-ticket.mjs <args> --raiz <raiz>`; `fim` resolve no exit (um neto com o stdio herdado não o prende)
// tempReal: o TEMP da máquina (as vagas globais reais), para as pontas reais; por omissão, um TEMP privado
export function lanca(raiz, args, { env = {}, limite_ms = 240000, tempReal = false } = {}) {
  const t0 = Date.now();
  if (!existsSync(CHECK)) return { pid: 0, fim: Promise.resolve({ status: null, out: '', err: 'falta scripts/check-ticket.mjs', ms: 0, pendurado: false }) };
  const p = spawn(process.execPath, [CHECK, ...args, '--raiz', raiz], { cwd: raiz, env: tempReal ? { ...ambienteGit(), ...env } : ambiente(env), stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', windowsHide: true });
  if (p.pid) PIDS.add(p.pid);
  let out = '', err = '', pendurado = false;
  p.stdout.on('data', (b) => { out += b; });
  p.stderr.on('data', (b) => { err += b; });
  const relogio = setTimeout(() => { pendurado = true; mataArvore(p.pid); }, limite_ms);
  const fim = new Promise((resolve) => {
    const acaba = (status) => { clearTimeout(relogio); const ms = Date.now() - t0; setTimeout(() => { p.stdout.destroy(); p.stderr.destroy(); resolve({ status, out, err, ms, pendurado }); }, 200); };
    p.on('exit', acaba);
    p.on('error', (e) => { err += String(e); acaba(null); });
  });
  return { pid: p.pid, fim };
}
export const correr = (raiz, args, opcoes) => lanca(raiz, args, opcoes).fim;
export const saida = (r) => `saída ${r.status}${r.pendurado ? ' (PENDURADO: morto pelo teste)' : ''} ao fim de ${Math.round(r.ms / 1000)} s\n${(r.out + '\n' + r.err).slice(-3000)}`;

// as linhas dos passos, pela ordem em que aparecem: `ok <passo>` ou `FAIL <passo> (detalhe)`
export function linhas(out) {
  const r = [];
  for (const l of out.split(/\r?\n/)) {
    const m = /^(ok|FAIL) (.+?)(?: \((.*)\))?\s*$/.exec(l);
    if (m && PASSOS.includes(m[2])) r.push({ estado: m[1], passo: m[2], detalhe: m[3] ?? '', linha: l });
  }
  return r;
}
export const relatorio = (raiz) => join(raiz, '.forge', 'check-ticket', `${shaDe(raiz)}.json`);

// todos os ficheiros de uma pasta (recursivo), para procurar os tokens
export const ficheirosDe = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? ficheirosDe(join(dir, e.name)) : [join(dir, e.name)])) : []);
export const tamanho = (f) => statSync(f).size;