// Ronda −1 do V-02 (#126, spec #123 §4.3): utilitários dos ataques ao mapa de suítes afetadas. Só biblioteca padrão, sem rede e sem servidores.
//
// LEITURA DO CONTRATO (as PERGUNTAS estão na #126; a resposta do orquestrador prevalece):
// - `afetadas(ficheiros)` de scripts/afetadas.mjs devolve `{ suites, porque }`; `suites` é uma lista (ou um Set) de nomes do manifesto, e um
//   "*" nela vale todas as suítes do manifesto (§4.3: «"*" quer dizer todas as suítes»). Pode ser síncrona ou assíncrona.
// - o mapa e o manifesto são os do repo onde o módulo está: nas fixtures e nas cópias, o scripts/afetadas.mjs (com os imports relativos dele)
//   é copiado para lá e corre com o cwd na raiz da cópia, por isso tanto a leitura pelo import.meta.url como pelo cwd funcionam.
// - os `caminhos` das regras são globs (§4.3 usa `**` e nomes exatos); o oráculo usa o path.posix.matchesGlob da biblioteca padrão.
// Tudo o que um teste cria vive numa pasta temporária, apagada no `after`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const REL_AFETADAS = 'scripts/afetadas.mjs';
export const REL_MAPA = 'scripts/mapa-suites.json';
export const REL_MANIFESTO = 'scripts/suites.json';
export const REL_LINT = 'scripts/mapa-suites.test.mjs';
export const REL_CORPUS = 'scripts/corpus/afetadas';
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
export const exige = (raiz, rel) => assert.ok(existsSync(join(raiz, rel)), `falta ${rel}`);

// --- pastas temporárias (limpas no after de cada ficheiro) ---
const PASTAS = new Set();
export const tmp = (p = 'v02-') => { const d = mkdtempSync(join(tmpdir(), p)); PASTAS.add(d); return d; };
export function limpa() {
  for (const d of PASTAS) { try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} }
  PASTAS.clear();
}

// o ambiente dos filhos: sem NODE_TEST_CONTEXT (um node --test aninhado com ele não corre nada) nem GITHUB_HEAD_REF, sem a config global do git
let vazio;
export const ambiente = (extra = {}) => {
  if (!vazio) { vazio = join(tmp('v02-gitconfig-'), 'vazio'); writeFileSync(vazio, ''); }
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio, GIT_TERMINAL_PROMPT: '0', DISABLE_AUTOUPDATER: '1' };
  delete e.NODE_TEST_CONTEXT;
  delete e.GITHUB_HEAD_REF;
  return { ...e, ...extra };
};
export const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', ...a],
  { cwd, encoding: 'utf8', env: ambiente(), maxBuffer: 64 * 1024 * 1024 });
export const gitOk = (cwd, ...a) => { const r = git(cwd, ...a); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
export const linhas = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
export const rastreados = (raiz = ROOT) => linhas(gitOk(raiz, 'ls-files'));

// --- manifesto e mapa ---
export const nomesManifesto = (raiz = ROOT) => { exige(raiz, REL_MANIFESTO); return lerJson(join(raiz, REL_MANIFESTO)).suites.map((s) => s.nome); };
export const lerMapa = (raiz = ROOT) => { exige(raiz, REL_MAPA); return lerJson(join(raiz, REL_MAPA)); };
export const casa = (f, g) => posix.matchesGlob(f, g);
export const regrasDe = (mapa, f) => mapa.regras.filter((r) => (r.caminhos || []).some((g) => casa(f, g)));
// as pastas tests/critico/<x>/ (montadas por pedaços, para o lint M3 não ler aqui um prefixo que apanha todo o tests/critico/)
export const PASTA_CRITICO = ['tests', 'critico'].join('/') + '/';
export const suiteDaPasta = (f) => (f.startsWith(PASTA_CRITICO) ? f.slice(PASTA_CRITICO.length).split('/')[0] : null);

// o resultado de afetadas() como um Set de nomes; "*" vale todas as suítes do manifesto
export function nomes(r, todas) {
  assert.ok(r && typeof r === 'object' && 'suites' in r && 'porque' in r, `afetadas() tem de devolver { suites, porque }: ${JSON.stringify(r)?.slice(0, 300)}`);
  const s = [...r.suites];
  assert.ok(s.every((x) => typeof x === 'string'), 'suites tem de ser uma lista de nomes');
  return new Set(s.includes('*') ? [...todas, ...s.filter((x) => x !== '*')] : s);
}

// afetadas() deste repo, no processo do teste
let modulo;
export async function afetadasAqui(ficheiros) {
  exige(ROOT, REL_AFETADAS);
  modulo ??= await import(pathToFileURL(join(ROOT, REL_AFETADAS)).href);
  assert.equal(typeof modulo.afetadas, 'function', `${REL_AFETADAS} não exporta afetadas(ficheiros)`);
  return await modulo.afetadas(ficheiros);
}

// afetadas() da cópia ou fixture `raiz`, num filho com o cwd lá (o "*" chega como "*"; os Map e Set do `porque` passam a objetos e listas)
export function afetadasEm(raiz, ficheiros) {
  exige(raiz, REL_AFETADAS);
  const codigo = `const m = await import(${JSON.stringify(pathToFileURL(join(raiz, REL_AFETADAS)).href)});
const r = await m.afetadas(${JSON.stringify(ficheiros)});
const rep = (k, v) => (v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v);
process.stdout.write('\\n@@V02@@' + JSON.stringify(r, rep));`;
  const p = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { cwd: raiz, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  assert.equal(p.status, 0, `afetadas() falhou na cópia:\n${(p.stdout + p.stderr).slice(-2000)}`);
  return JSON.parse(p.stdout.slice(p.stdout.lastIndexOf('@@V02@@') + 7));
}

// --- cópias do repo ---
// os ficheiros da árvore de trabalho (rastreados e novos não ignorados) num repo git novo, com um commit: a cópia temporária dos critérios
export function copiaRepo() {
  const d = tmp('v02-copia-');
  const fs_ = linhas(gitOk(ROOT, 'ls-files', '-co', '--exclude-standard')).filter((f) => existsSync(join(ROOT, f)));
  for (const f of fs_) { mkdirSync(dirname(join(d, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(d, f)); }
  iniciaRepo(d);
  return d;
}
export function iniciaRepo(d) {
  gitOk(d, 'init', '-q', '-b', 'main');
  gitOk(d, 'config', 'core.autocrlf', 'false');
  gitOk(d, 'add', '-A');
  gitOk(d, 'commit', '-q', '-m', 'copia');
}
export const commitaTudo = (d, msg) => { gitOk(d, 'add', '-A'); gitOk(d, 'commit', '-q', '-m', msg); };
export const escreve = (d, rel, texto) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); };

// o lint scripts/mapa-suites.test.mjs da cópia `raiz`, com o TAP e as contagens
export function lintEm(raiz) {
  exige(raiz, REL_LINT);
  const p = spawnSync(process.execPath, ['--test', '--test-reporter=tap', REL_LINT], { cwd: raiz, encoding: 'utf8', env: ambiente(), timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
  const out = (p.stdout || '') + (p.stderr || '');
  return { status: p.status, out, ...contagensTap(out) };
}
export function contagensTap(texto) {
  const ult = (k) => { const m = [...texto.matchAll(new RegExp(`^# ${k} (\\d+)\\s*$`, 'gm'))]; return m.length ? +m[m.length - 1][1] : null; };
  return { pass: ult('pass'), fail: ult('fail'), skip: ult('skipped') };
}
export const resumo = (r) => `saída ${r.status}, pass ${r.pass}, fail ${r.fail}\n${r.out.slice(-3000)}`;

// o scripts/afetadas.mjs deste repo e os seus imports relativos (de forma transitiva) para a mesma posição em `dest`
export function copiaModulo(dest, rel = REL_AFETADAS, vistos = new Set()) {
  if (vistos.has(rel)) return;
  vistos.add(rel);
  exige(ROOT, rel);
  const texto = readFileSync(join(ROOT, rel), 'utf8');
  escreve(dest, rel, texto);
  for (const m of texto.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g)) copiaModulo(dest, posix.normalize(posix.join(posix.dirname(rel), m[2])), vistos);
}

// uma fixture: o scripts/afetadas.mjs deste repo, um manifesto e um mapa próprios e os ficheiros dados, num repo git com um commit
export function fixture({ suites, regras, ficheiros }) {
  const d = tmp('v02-fixture-');
  if (existsSync(join(ROOT, REL_AFETADAS))) copiaModulo(d); // sem o módulo (a base), o afetadasEm falha com «falta scripts/afetadas.mjs»
  escreve(d, REL_MANIFESTO, JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 1, orcamento_s: 500,
    suites: suites.map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`${PASTA_CRITICO}${n}/*.test.mjs`], limite_s: 60 })) }, null, 2));
  escreve(d, REL_MAPA, JSON.stringify({ versao: 1, regras }, null, 2));
  for (const [rel, texto] of Object.entries(ficheiros)) escreve(d, rel, texto);
  iniciaRepo(d);
  return d;
}

// a linha da saída onde o nome da suíte aparece como palavra inteira (não como pedaço de um caminho: «scripts» não casa «scripts/x.mjs»)
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const temSuite = (linha, nome) => new RegExp(`(?<![\\w./-])${esc(nome)}(?![\\w./-])`).test(linha);
// --- a fixture do fecho do doLote (C4 e C5) ---
// suite-alfa tem doLote(t, 'suite-beta'), suite-beta tem doLote(t, 'suite-gama', {...}); lib/** → suite-alfa, README.md → suite-delta.
// A chamada é montada por pedaços: o texto deste ficheiro não pode parecer um consumidor do doLote a quem lê tests/critico/ à procura dele.
export const DOLOTE = 'do' + 'Lote';
export const SUITES_LOTE = ['suite-alfa', 'suite-beta', 'suite-gama', 'suite-delta'];
export const testeDe = (s, n) => `${PASTA_CRITICO}${s}/${n}.test.mjs`;
const corpo = (titulo, chamada) => [
  "import { test } from 'node:test';",
  chamada ? `import { ${DOLOTE} } from '../_comum/lote.mjs';` : '',
  `test('${titulo}', async (t) => {${chamada ? ` await ${chamada};` : ''} });`,
  '',
].join('\n');
export const fixtureLote = () => fixture({
  suites: SUITES_LOTE,
  regras: [
    { caminhos: ['lib/**'], suites: ['suite-alfa'] },
    { caminhos: ['README.md'], suites: ['suite-delta'] },
    { caminhos: [REL_AFETADAS, REL_MANIFESTO, REL_MAPA], suites: ['*'], motivo: 'fixture: o módulo, o manifesto e o mapa' },
  ],
  ficheiros: {
    'lib/x.mjs': 'export const x = 1;\n',
    'README.md': '# fixture\n',
    [testeDe('suite-alfa', 'a')]: corpo('alfa usa o lote da beta', `${DOLOTE}(t, 'suite-beta')`),
    [testeDe('suite-beta', 'b')]: corpo('beta usa o lote da gama', `${DOLOTE}(t, 'suite-gama', { pass: 1 })`),
    [testeDe('suite-gama', 'g')]: corpo('gama sozinha'),
    [testeDe('suite-delta', 'd')]: corpo('delta sozinha'),
  },
});