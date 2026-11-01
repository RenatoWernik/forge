// Ronda −1 do V-03 (#127; spec #123 §4.4 e risco 1): utilitários dos ataques ao lote sem execução repetida. Só biblioteca padrão, sem rede,
// sem servidores e sem sessões claude.
//
// LEITURA DO CONTRATO (PERGUNTA na #127, comentário 6559814403; a resposta do orquestrador prevalece):
// - C1: o scripts/inventario.mjs sai com 0 quando as três propriedades valem e com ≠ 0 quando alguma falha, e nomeia o teste em causa.
// - L4: «um argumento que contenha scripts/*.test.mjs» é o glob literal. Os ficheiros da lista sem spawn de --test ficam byte a byte, e o L4
//   imprime cada achado como os outros: «L4 <pasta>/<ficheiro>:<linha>: ...».
// - C2: os testes com { skip: NESTED_SKIP } correm com FORGE_NESTED=1, para o skip próprio não esconder o lote.
// - o doLote é síncrono (spec §4.4: «devolve»). Os ataques aos ficheiros reais não dependem da forma do alvo.
// Estes ficheiros nunca escrevem como literal o glob do pacote nem um caminho de outra pasta de ataques (o L4 é léxico): montam-nos por
// partes. Os filhos que correm um ficheiro de teste correm-no diretamente (`node <ficheiro>`, sem --test), com o espiao.mjs carregado por
// --import: cada spawn de `--test` fica registado e devolve uma resposta falsa, por isso nenhum filho aninhado corre de verdade.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ESPIAO = pathToFileURL(fileURLToPath(new URL('./espiao.mjs', import.meta.url))).href;
export const MOTIVO = 'lote: satisfeito na fase 2';
export const crit = (...p) => ['tests', 'critico', ...p].join('/'); // um caminho de tests/critico/, relativo ao repo
export const PACOTE = ['scripts', '*.test.mjs'].join('/');
export const AQUI = 'v-03-r0';
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
export const LF = (s) => s.replace(/\r\n/g, '\n');

// A lista autorizada do ticket (corpo da #127), fechada
const R = (p, ...fs) => fs.map((f) => crit(p, f));
export const AUTORIZADOS = [
  ...R('f-01-r0', 'regressao.test.mjs'), ...R('f-02-r0', 'regressao.test.mjs'), ...R('f-03-r0', 'regressao.test.mjs'), ...R('f-04-r0', 'regressao.test.mjs'),
  ...R('f-05-r0', 'regressao.test.mjs', 'regressao-ataques-a.test.mjs', 'regressao-ataques-b.test.mjs', 'regressao-ataques-c.test.mjs'),
  ...R('f-06-r0', 'regressao.test.mjs'), ...R('f-07-r0', 'regressao.test.mjs'), ...R('f-08-r0', 'regressao.test.mjs'), ...R('f-09-r0', 'regressao.test.mjs'),
  ...R('f-10-r0', 'regressao.test.mjs'), ...R('f-11-r0', 'regressao.test.mjs'), ...R('f-13-r0', 'regressao.test.mjs', 'corpus-comandos.mjs'),
  ...R('f-14-r0', 'regressao-higiene.test.mjs', 'regressao-pacote.test.mjs'), ...R('f-16-r0', 'c4-corpus-e-regressao.test.mjs'),
  ...R('f-21a-r0', 'c4-passos.test.mjs'), ...R('f-21b-r0', 'regressao.test.mjs'), ...R('f-22c-r0', 'ambito.test.mjs'),
].sort();
// Os que na base correm o glob do pacote ou outra pasta de ataques sem FORGE_NESTED (lidos na base, 2026-11-01): o L4 tem de os acusar
// todos, e cada um passa a chamar o doLote
export const LITERAIS = [
  ...R('f-01-r0', 'regressao.test.mjs'), ...R('f-02-r0', 'regressao.test.mjs'), ...R('f-03-r0', 'regressao.test.mjs'), ...R('f-04-r0', 'regressao.test.mjs'),
  ...R('f-05-r0', 'regressao.test.mjs'), ...R('f-06-r0', 'regressao.test.mjs'), ...R('f-07-r0', 'regressao.test.mjs'), ...R('f-09-r0', 'regressao.test.mjs'),
  ...R('f-10-r0', 'regressao.test.mjs'), ...R('f-11-r0', 'regressao.test.mjs'), ...R('f-13-r0', 'regressao.test.mjs'), ...R('f-14-r0', 'regressao-pacote.test.mjs'),
].sort();
// O N do assert `pass ≥ N` de cada teste convertível, lido na base: [ficheiro, título, N]. Um teste convertido fora desta tabela está fora
// do inventário fechado do ticket.
export const NS = [
  [crit('f-01-r0', 'regressao.test.mjs'), /pelo menos os 94 testes/, 94],
  [crit('f-02-r0', 'regressao.test.mjs'), /pelo menos os 94 testes/, 94],
  [crit('f-03-r0', 'regressao.test.mjs'), /pelo menos os 120 testes/, 120],
  [crit('f-03-r0', 'regressao.test.mjs'), /do F-01 e do F-02 .*continuam verdes/, 60],
  [crit('f-04-r0', 'regressao.test.mjs'), /mais testes do que os 139/, 140],
  [crit('f-04-r0', 'regressao.test.mjs'), /F-01, F-02, F-03 e F-10 continuam verdes/, 150],
  [crit('f-05-r0', 'regressao.test.mjs'), /pelo menos os 139 testes/, 139],
  [crit('f-05-r0', 'regressao-ataques-a.test.mjs'), /continuam verdes/, 63],
  [crit('f-05-r0', 'regressao-ataques-b.test.mjs'), /continuam verdes/, 209],
  [crit('f-05-r0', 'regressao-ataques-c.test.mjs'), /continua verde/, 3],
  [crit('f-06-r0', 'regressao.test.mjs'), /pelo menos os 139 testes/, 139],
  [crit('f-06-r0', 'regressao.test.mjs'), /^regressão: \S+ continua verde/, 1],
  [crit('f-07-r0', 'regressao.test.mjs'), /mais do que os 139 testes/, 140],
  [crit('f-09-r0', 'regressao.test.mjs'), /testes que passavam em /, 198],
  [crit('f-10-r0', 'regressao.test.mjs'), /mais testes do que os 120/, 121],
  [crit('f-11-r0', 'regressao.test.mjs'), /mais testes do que os 133/, 134],
  [crit('f-13-r0', 'regressao.test.mjs'), /mais testes do que os 139/, 140],
  [crit('f-14-r0', 'regressao-pacote.test.mjs'), /sai 0, com pelo menos/, 291],
];
export const nDe = (rel, titulo) => NS.find(([f, re]) => f === rel && re.test(titulo))?.[2] ?? null;

// --- pastas temporárias (limpas no after de cada ficheiro) e o ambiente dos filhos ---
const PASTAS = new Set();
export const tmp = (p = 'v03-') => { const d = mkdtempSync(join(tmpdir(), p)); PASTAS.add(d); return d; };
export const limpa = () => { for (const d of PASTAS) { try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} } PASTAS.clear(); casa = null; };
let casa = null;
// HOME, USERPROFILE, CLAUDE_CONFIG_DIR e TMP temporários; git sem config de sistema nem global; sem NODE_TEST_CONTEXT, NODE_OPTIONS,
// GITHUB_HEAD_REF nem variáveis do lote ou do FORGE_NESTED herdadas
export const ambiente = (extra = {}) => {
  if (!casa) { casa = tmp('v03-casa-'); for (const p of ['home', 'tmp']) mkdirSync(join(casa, p)); writeFileSync(join(casa, 'gitconfig'), ''); }
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (/^(NODE_TEST_CONTEXT|NODE_OPTIONS|GITHUB_HEAD_REF|FORGE_LOTE_\w*|FORGE_NESTED|V03_\w*)$/i.test(k)) delete e[k];
  const h = join(casa, 'home'), t = join(casa, 'tmp');
  return { ...e, HOME: h, USERPROFILE: h, CLAUDE_CONFIG_DIR: h, TMP: t, TEMP: t, TMPDIR: t, DISABLE_AUTOUPDATER: '1',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(casa, 'gitconfig'), GIT_TERMINAL_PROMPT: '0', ...extra };
};
export const git = (cwd, args, env = {}) => {
  const r = spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', env: ambiente(env), maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const escreve = (d, rel, txt) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), txt); };
// os ficheiros do repo como estão no disco: os rastreados que existem e os novos não ignorados
const ficheirosDoDisco = () => git(ROOT, ['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter((f) => f && existsSync(join(ROOT, f)));
export const textoNaBase = (b, rel) => { try { return git(ROOT, ['show', `${b}:${rel}`]); } catch { return null; } };

// Uma cópia do repo como está no disco num git temporário com um só commit (árvore limpa, sha novo, sem .forge/resultados/); `extra` =
// { rel: texto } entra no mesmo commit
export function copiaRepo(extra = {}) {
  const d = join(tmp('v03-repo-'), 'r');
  for (const f of ficheirosDoDisco()) { mkdirSync(dirname(join(d, f)), { recursive: true }); cpSync(join(ROOT, f), join(d, f)); }
  for (const [rel, txt] of Object.entries(extra)) escreve(d, rel, txt);
  git(d, ['init', '-q']); git(d, ['add', '-A']); git(d, ['commit', '-q', '-m', 'v03']);
  return { dir: d, sha: git(d, ['rev-parse', 'HEAD']).trim() };
}
// A árvore da base `b` inteira, com tudo o que está fora de tests/critico/ como está no disco (o lint, o corpus e a lista congelada de agora)
export function arvoreComCriticoDaBase(b) {
  const pai = tmp('v03-l4-'), d = join(pai, 'r'), idx = join(pai, 'indice');
  mkdirSync(d);
  git(ROOT, ['read-tree', b], { GIT_INDEX_FILE: idx });
  git(ROOT, [`--work-tree=${d}`, 'checkout-index', '-a', '-f'], { GIT_INDEX_FILE: idx });
  for (const f of ficheirosDoDisco().filter((x) => !x.startsWith(crit('')))) { mkdirSync(dirname(join(d, f)), { recursive: true }); cpSync(join(ROOT, f), join(d, f)); }
  return d;
}

// --- correr um ficheiro de teste num filho, com o espião ---
export const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// os testes de topo do TAP (`ok N - título # SKIP motivo`, sem indentação): { título: { estado, motivo } }, pela ordem
export function topo(tap) {
  const t = {};
  for (const l of tap.split(/\r?\n/)) {
    const m = /^(not )?ok \d+ - (.*?)(?: # (SKIP|TODO)\b ?(.*))?$/.exec(l);
    if (m) t[m[2].replace(/\\#/g, '#')] = { estado: m[3] === 'SKIP' ? 'skip' : m[3] === 'TODO' ? 'todo' : m[1] ? 'fail' : 'pass', motivo: m[4] ?? '' };
  }
  return t;
}
// Corre `rel` (relativo a `dir`) diretamente, sem --test, com o espião; `titulos` restringe aos testes com esses títulos exatos.
// Devolve { status, out, testes, espiao: [{ cmd, args, cwd }] pela ordem dos spawns }.
export function corre(dir, rel, { env = {}, titulos = null, resposta = 'verde' } = {}) {
  const log = join(tmp('v03-espiao-'), 'log.jsonl');
  const args = ['--import', ESPIAO, '--test-reporter=tap'];
  if (titulos) args.push(`--test-name-pattern=^(?:${titulos.map(escapa).join('|')})$`);
  args.push(rel);
  const r = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 28,
    env: ambiente({ V03_ESPIAO_LOG: log, V03_ESPIAO_RESPOSTA: resposta, V03_RAIZ: dir, ...env }) });
  const espiao = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), testes: topo(r.stdout || ''), espiao };
}
export const fim = (r) => '\n--- saída (fim) ---\n' + r.out.slice(-2500);

// --- o gerador: os testes convertidos ---
const ficheirosCritico = (d) => globSync(crit('**', '*.mjs'), { cwd: d }).map((f) => f.replaceAll('\\', '/'))
  .filter((f) => !f.startsWith(crit('_comum') + '/') && !f.startsWith(crit(AQUI) + '/')).sort();
// Os *.test.mjs de tests/critico/ (fora de _comum/ e desta pasta) que chamam doLote, eles próprios ou num módulo local que importam
export function ficheirosComLote(d = ROOT) {
  const usa = new Set(ficheirosCritico(d).filter((f) => /\bdoLote\s*\(/.test(readFileSync(join(d, f), 'utf8'))));
  return ficheirosCritico(d).filter((f) => f.endsWith('.test.mjs') && (usa.has(f) || [...readFileSync(join(d, f), 'utf8').matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)]
    .some((m) => usa.has(join(dirname(f), m[1]).replaceAll('\\', '/')))));
}
export const baseDe = (rel) => rel.replace(/\.test\.mjs$/, '.v03base.test.mjs');

// O manifesto de `dir`: [{ nome, ficheiros }]
export function manifesto(dir) {
  const m = lerJson(join(dir, 'scripts', 'suites.json'));
  return m.suites.map((s) => ({ nome: s.nome, ficheiros: [...new Set((s.ficheiros || []).flatMap((g) => globSync(g, { cwd: dir }).map((f) => f.replaceAll('\\', '/'))))].sort() }));
}
// Prepara uma cópia do repo com a versão da base `b` de cada ficheiro com doLote ao lado (<nome>.v03base.test.mjs) e devolve, por ficheiro:
// { rel, titulos (os que saltam com o motivo do lote na fase 1), alvos: { título: [ficheiros que a versão da base corria] }, n: { título: N } }
export function prepara(b) {
  const rels = ficheirosComLote();
  const extra = {};
  for (const rel of rels) { const t = textoNaBase(b, rel); if (t !== null) extra[baseDe(rel)] = t; }
  const repo = copiaRepo(extra);
  const ficheiros = rels.map((rel) => {
    const f = { rel, temBase: baseDe(rel) in extra, titulos: [], alvos: {}, n: {}, erro: null };
    const f1 = corre(repo.dir, rel, { env: { FORGE_LOTE_FASE: '1', FORGE_NESTED: '1' } });
    f.titulos = Object.entries(f1.testes).filter(([, v]) => v.estado === 'skip' && v.motivo === MOTIVO).map(([k]) => k);
    for (const t of f.titulos) f.n[t] = nDe(rel, t);
    if (!f.titulos.length) { f.erro = `nenhum teste de ${rel} salta com «${MOTIVO}» na fase 1` + fim(f1); return f; }
    if (!f.temBase) { f.erro = `${rel} não existe na base`; return f; }
    const bv = corre(repo.dir, baseDe(rel), { env: { FORGE_NESTED: '1' }, titulos: f.titulos });
    const corridos = Object.keys(bv.testes);
    if (bv.espiao.length !== corridos.length) { f.erro = `a versão da base de ${rel} fez ${bv.espiao.length} spawns de --test para ${corridos.length} testes` + fim(bv); return f; }
    corridos.forEach((t, i) => {
      const e = bv.espiao[i], cwd = join(repo.dir, e.cwd);
      f.alvos[t] = [...new Set(e.args.filter((a) => !a.startsWith('--')).flatMap((g) => globSync(g, { cwd }).map((x) => join(e.cwd, x).replaceAll('\\', '/'))))].sort();
    });
    return f;
  });
  return { ...repo, ficheiros };
}

// --- resultados falsos (spec §4.2) ---
const PIOR = ['fail', 'limite', 'erro', 'em_curso'];
// recalcula o resumo das suítes a partir das unidades
export function fecha(d) {
  d.suites = {};
  for (const u of d.unidades) {
    const s = (d.suites[u.suite] ??= { estado: 'pass', pass: 0, fail: 0, skip: 0 });
    s.pass += u.pass; s.fail += u.fail; s.skip += u.skip;
    if (PIOR.indexOf(u.estado) >= 0 && (s.estado === 'pass' || PIOR.indexOf(u.estado) < PIOR.indexOf(s.estado))) s.estado = u.estado;
  }
  return d;
}
const tapDe = (u) => `TAP version 13\n# tests ${u.pass + u.fail}\n# suites 0\n# pass ${u.pass}\n# fail ${u.fail}\n# cancelled 0\n# skipped ${u.skip}\n# todo 0\n# duration_ms 1\n`;
let nRes = 0;
// Um resultado de --todas para o repo `dir` no `sha`, com a árvore limpa: cada ficheiro do manifesto é uma unidade verde com `pass` testes.
// `muda(dados)` altera-o antes de o gravar (o resumo das suítes é recalculado depois). Os TAP ficam em .forge/resultados/logs/ e o JSON em
// .forge/v03/ (nunca em .forge/resultados/, para a corrida avulsa não o reutilizar). Devolve o caminho do JSON.
export function resultados(dir, sha, muda = () => {}, pass = 100000) {
  const agora = new Date().toISOString(), unidades = [];
  for (const s of manifesto(dir)) for (const f of s.ficheiros) {
    unidades.push({ suite: s.nome, ficheiro: f, bloco: null, estado: 'pass', pass, fail: 0, skip: 0, todo: 0, skips: [], duracoes: {}, duracao_s: 1, concorrentes_max: 1, pid: 1, inicio: agora, tap: null });
  }
  const d = { versao: 1, sha, arvore: 'limpa', node: process.version, comando: 'node scripts/executor.mjs --todas', inicio: agora, fim: agora, completo: true, unidades, suites: {} };
  muda(d);
  const n = ++nRes;
  d.unidades.forEach((u, i) => { u.tap = `.forge/resultados/logs/v03-${n}-${i}.tap`; escreve(dir, u.tap, tapDe(u)); });
  fecha(d);
  const f = join(dir, '.forge', 'v03', `r${n}.json`);
  escreve(dir, `.forge/v03/r${n}.json`, JSON.stringify(d, null, 2));
  return f;
}
export const suiteDe = (dir) => { const m = manifesto(dir); return (f) => m.find((s) => s.ficheiros.includes(f))?.nome ?? null; };
export const outroSha = (s) => s.slice(0, -1) + (s.endsWith('0') ? '1' : '0');

// --- o lint das guardas da árvore `raiz`, corrido diretamente num filho: os ficheiros das linhas «L4 <pasta>/<ficheiro>:<linha>:» ---
export function lintL4(raiz, padrao = null) {
  const args = ['--test-reporter=tap'];
  if (padrao) args.push(`--test-name-pattern=${padrao}`);
  args.push(join(raiz, 'scripts', 'guardas-critico.test.mjs'));
  const r = spawnSync(process.execPath, args, { cwd: raiz, encoding: 'utf8', env: ambiente(), timeout: 120000, maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, testes: topo(r.stdout || ''), ficheiros: [...new Set([...out.matchAll(/\bL4 ([^\s:'"]+):\d+:/g)].map((m) => m[1]))].sort() };
}
