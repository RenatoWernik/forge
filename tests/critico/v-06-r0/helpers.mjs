// Ronda −1 do V-06 (#130, spec #123 §4.5): utilitários dos ataques ao avanço automático. Só biblioteca padrão, sem rede e sem o gh real.
// Cada cenário de cenarios/*.json vira, numa pasta temporária:
//   origem.git (bare, faz de GitHub) ← trabalho/ (clone, cwd do avancar) · gh/ (estado do gh falso) · temp/ (TEMP do avancar) · home/
// A main da origem tem uma cópia dos scripts/*.mjs deste repo (o avancar, o executor, as afetadas...; também em .claude/ os módulos do
// §3), um scripts/suites.json com a suíte «s» (s/*.test.mjs), um scripts/mapa-suites.json em que tudo afeta «*», e s/a.test.mjs, verde.
// O PR #9110 (branch v-99-pr, ticket #9130) tem dois commits, P1 e H; H acrescenta s/b.test.mjs, verde ou vermelho conforme o cenário.
// Com «headMuda», um terceiro commit H2 move o head real do PR, mas o gh continua a dizer H. O `pr merge` do gh falso faz o squash na
// origem (commit-tree com a árvore do head real e pai na base) e recusa um --match-head-commit diferente do head real.
//
// O CONTRATO, com a RESPOSTA do orquestrador às PERGUNTAS 1–6 da Ronda −1 (#130, último comentário):
// - o avancar corre com cwd = trabalho/ (um clone cujo origin é a origem); é a cópia de scripts/avancar.mjs que vive lá, por isso um
//   avancar que use o cwd ou a pasta do próprio script vê o mesmo repo. O .forge/proxima-fase.json fica em trabalho/.forge/.
//   O gh é o do PATH e herda o env do avancar.
// - códigos: 0 tudo ok, 1 pós-merge vermelho, 2 qualquer recusa antes do merge (o head-mudou inclui-se: ≤ 1 pr merge, recusado pelo gh).
// - o VEREDITO, o CHECK-TICKET e o PÓS-MERGE VERDE <sha> são comentários do PR; a fase seguinte é um comentário na issue da spec.
// - pacote = as issues com «Parte da spec #N» no corpo; os bloqueios são a linha «**Bloqueado por:** …», com itens `#n` ou um id
//   (`V-01`) resolvido pelo prefixo do título (`V-01:`) dentro do pacote; «—» é sem bloqueios e o texto entre parênteses ignora-se.
//   Entra na fase quem está aberto com todos os bloqueios fechados; sem ready-for-agent, sem bloqueios nativos nem sub-issues.
// - .forge/proxima-fase.json = { spec, geradoEm, proximas: [ { numero, titulo } ] }; o stdout e o comentário na spec citam os números.
// - modo projeto: o merge vai para a integração, o pós-merge corre sobre a nova origin/<integracao> e a main fica sempre intacta.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const AQUI = fileURLToPath(new URL('./', import.meta.url));
export const AVANCAR = join(ROOT, 'scripts/avancar.mjs');
export const CENARIOS = join(AQUI, 'cenarios');
export const GH_FALSO = join(AQUI, 'gh-falso.mjs');
export const REPO = 'critico-falso/v06-alvo';
export const PR = 9110, TICKET = 9130, SPEC = 9100;
export const LIVRES = [9101, 9102];
// o que a fase seguinte pode listar por engano: as 5 abertas do pacote, a de outro pacote com o mesmo prefixo V-01 e o ticket do PR
export const VIGIADAS = [9101, 9102, 9103, 9104, 9105, 9120, TICKET];
export const NOME_REGRESSAO = 'v06-regressao-do-pr';
// o valor falso do token (C4): vai no GH_TOKEN e no GITHUB_TOKEN de cada corrida e nunca pode aparecer em nenhuma saída
export const TOKEN = `ghp_FALSOv06${randomBytes(12).toString('hex')}`;
export const exigeAvancar = () => assert.ok(existsSync(AVANCAR), 'falta scripts/avancar.mjs');
export const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const lerJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const corpus = () => readdirSync(CENARIOS).filter((n) => n.endsWith('.json')).sort().map((n) => lerJson(join(CENARIOS, n)));
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// --- pastas temporárias e processos lançados (limpos no after de cada ficheiro) ---
const PASTAS = new Set(), PIDS = new Set();
export const tmp = (p = 'v06-') => { const d = mkdtempSync(join(tmpdir(), p)); PASTAS.add(d); return d; };
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// mata a árvore de um PID que este teste lançou: taskkill /PID /T no Windows, o grupo em POSIX; nunca por nome
function mataArvore(pid) {
  if (!vivo(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} } }
}
export async function limpa() {
  for (const pid of PIDS) mataArvore(pid);
  await espera(300);
  for (const d of PASTAS) { try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} }
  PIDS.clear(); PASTAS.clear(); BIN = null; vazio = null;
}

// --- o ambiente: sem a config de sistema nem a global do git, sem tokens nem NODE_OPTIONS herdados (chaves sem olhar a maiúsculas) ---
let vazio, BIN;
const tira = (e, ...ks) => { for (const k of Object.keys(e)) if (ks.includes(k.toUpperCase())) delete e[k]; return e; };
export function ambiente(extra = {}) {
  if (!vazio) { vazio = join(tmp('v06-gitconfig-'), 'vazio'); writeFileSync(vazio, ''); }
  const e = tira({ ...process.env }, 'NODE_TEST_CONTEXT', 'GITHUB_HEAD_REF', 'NODE_OPTIONS', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN', 'GH_REPO', 'GH_HOST', 'GIT_TRACE', 'FORGE_GH_FALSO_DIR', 'FORGE_LOTE_FASE', 'FORGE_LOTE_RESULTADOS');
  Object.assign(e, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio, GIT_TERMINAL_PROMPT: '0' });
  for (const [k, v] of Object.entries(extra)) { tira(e, k.toUpperCase()); e[k] = v; }
  return e;
}
// a pasta do gh falso (uma por processo de teste): gh.exe = cópia do node.exe no Windows; em POSIX, um sh que corre o gh-falso.mjs
export function binGh() {
  if (BIN) return BIN;
  BIN = tmp('v06-bin-');
  if (process.platform === 'win32') {
    const d = join(BIN, 'gh.exe');
    try { linkSync(process.execPath, d); } catch { copyFileSync(process.execPath, d); }
  } else {
    const d = join(BIN, 'gh');
    writeFileSync(d, `#!/bin/sh\nexec "${process.execPath}" "${GH_FALSO}" "$@"\n`);
    chmodSync(d, 0o755);
  }
  return BIN;
}
// o env do avancar num cenário: o gh falso à frente no PATH e o gh real fora dele, o token falso, sem rede no git (só file) e o argv do git
// registado (GIT_TRACE) para o C4
export function ambienteDoCenario(m) {
  const nomes = process.platform === 'win32' ? ['gh.exe', 'gh.cmd', 'gh.bat', 'gh.com'] : ['gh'];
  const path = (process.env.PATH ?? '').split(delimiter).filter((p) => p && !nomes.some((n) => existsSync(join(p, n))));
  return ambiente({
    PATH: [binGh(), ...path].join(delimiter), NODE_OPTIONS: `--import=${pathToFileURL(GH_FALSO).href}`, FORGE_GH_FALSO_DIR: m.estado,
    GH_TOKEN: TOKEN, GITHUB_TOKEN: TOKEN, GH_CONFIG_DIR: join(m.D, 'ghcfg'), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1',
    GIT_ALLOW_PROTOCOL: 'file', GIT_TRACE: join(m.estado, 'git-trace.log'), HOME: m.home, USERPROFILE: m.home, CLAUDE_CONFIG_DIR: m.home,
    TEMP: m.temp, TMP: m.temp, TMPDIR: m.temp, DISABLE_AUTOUPDATER: '1',
  });
}

const ID = { GIT_AUTHOR_NAME: 'critico', GIT_AUTHOR_EMAIL: 'critico@example.invalid', GIT_COMMITTER_NAME: 'critico', GIT_COMMITTER_EMAIL: 'critico@example.invalid' };
export const git = (cwd, ...a) => spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd, encoding: 'utf8', env: ambiente(ID), maxBuffer: 1e8 });
export const gitOk = (cwd, ...a) => { const r = git(cwd, ...a); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); return r.stdout; };
const shaDe = (d) => gitOk(d, 'rev-parse', 'HEAD').trim();
// as refs da origem: { refs/heads/main: sha, ... }
export function refs(gitDir) {
  const r = gitOk(gitDir, 'for-each-ref', '--format=%(refname) %(objectname)');
  return Object.fromEntries(r.split('\n').filter(Boolean).map((l) => l.split(' ')));
}

// --- o pacote de teste (spec #9100), na forma das issues reais: 5 abertas, 2 livres (9101, 9102) e 3 presas. A #9120 é de outro pacote e
// tem o mesmo prefixo V-01 da #9111: um id resolvido fora do pacote prende a 9101 e solta a 9104 ---
const issueDe = (number, title, bloqueios, { state = 'OPEN', spec = SPEC } = {}) => ({ number, title, state, labels: [],
  body: `Parte da spec #${spec} (pacote de teste do V-06).\n\n**Bloqueado por:** ${bloqueios}.\n\n**Objetivo:** ticket de teste.` });
export const PACOTE = [
  { number: SPEC, title: 'Spec: pacote de teste do V-06', state: 'OPEN', labels: ['spec'], body: 'Spec do pacote de teste do V-06.\n\nTickets: ver as issues que referenciam esta spec.' },
  { number: 9200, title: 'Spec: outro pacote', state: 'OPEN', labels: ['spec'], body: 'Spec de outro pacote.' },
  issueDe(9111, 'V-01: base fechada', '—', { state: 'CLOSED' }),
  issueDe(9112, 'V-02: outra base fechada', '#9111', { state: 'CLOSED' }),
  issueDe(9101, 'V-11: livre (um #n e um id, ambos fechados)', '#9112, V-01 (medição)'),
  issueDe(9102, 'V-12: livre (sem bloqueios)', '—'),
  issueDe(9103, 'V-13: presa (bloqueio aberto de outro pacote)', '#9120'),
  issueDe(9104, 'V-14: presa (um id fechado e um id aberto)', 'V-01, V-11'),
  issueDe(9105, 'V-15: presa (bloqueada por outra aberta do pacote)', '#9101'),
  issueDe(9120, 'V-01: de outro pacote, aberta', '—', { spec: 9200 }),
  issueDe(TICKET, 'V-30: o ticket deste PR', 'V-01, V-02'),
];
export const ROTULOS = ['spec', 'ready-for-agent', 'regressao', 'seguimento', 'flaky', 'integracao', 'needs-triage'];

const MANIFESTO = { versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 2, orcamento_s: 300,
  suites: [{ nome: 's', tipo: 'node-test', ficheiros: ['s/*.test.mjs'], limite_s: 120 }] };
const MAPA = { versao: 1, regras: [{ caminhos: ['**'], suites: ['*'] }] };
const verde = (nome) => `import { test } from 'node:test';\ntest('${nome}', () => {});\n`;
const VERMELHO = `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n`
  + `test('${NOME_REGRESSAO}', () => { assert.equal(1, 2, 'regressão introduzida pelo PR'); });\n`;
const poe = (d, rel, txt) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), txt); };
const commit = (d, msg) => { gitOk(d, 'add', '-A'); gitOk(d, 'commit', '-q', '-m', msg); return shaDe(d); };

// monta um cenário (o objeto de cenarios/<nome>.json) e devolve { c, D, origem, trab, estado, temp, home, P1, H, H2, refsAntes }
export function montaCenario(c) {
  const D = tmp(`v06-${c.nome}-`);
  const m = { c, D, origem: join(D, 'origem.git'), trab: join(D, 'trabalho'), estado: join(D, 'gh'), temp: join(D, 'temp'), home: join(D, 'home') };
  for (const p of [m.estado, m.temp, m.home]) mkdirSync(p, { recursive: true });
  const sem = join(D, 'semente');
  gitOk(D, 'init', '-q', '-b', 'main', sem);
  for (const n of readdirSync(join(ROOT, 'scripts'))) if (n.endsWith('.mjs') && !n.endsWith('.test.mjs')) poe(sem, `scripts/${n}`, readFileSync(join(ROOT, 'scripts', n)));
  for (const n of ['executor.mjs', 'afetadas.mjs', 'check-ticket.mjs', 'avancar.mjs']) if (existsSync(join(ROOT, 'scripts', n))) poe(sem, `.claude/${n}`, readFileSync(join(ROOT, 'scripts', n)));
  poe(sem, 'scripts/suites.json', JSON.stringify(MANIFESTO, null, 2) + '\n');
  poe(sem, 'scripts/mapa-suites.json', JSON.stringify(MAPA, null, 2) + '\n');
  poe(sem, 's/a.test.mjs', verde('v06-base-verde'));
  poe(sem, '.gitignore', '.forge/\n');
  commit(sem, 'base');
  if (c.integracao) gitOk(sem, 'branch', c.integracao);
  gitOk(sem, 'checkout', '-q', '-b', 'v-99-pr');
  poe(sem, 's/notas.md', 'primeira versão do PR\n');
  const P1 = commit(sem, 'pr: primeira versão');
  poe(sem, 's/b.test.mjs', c.pr.posMerge === 'vermelho' ? VERMELHO : verde('v06-pr-verde'));
  const H = commit(sem, 'pr: versão julgada');
  let H2 = null;
  if (c.pr.headMuda) { poe(sem, 's/c.test.mjs', verde('v06-pr-depois')); H2 = commit(sem, 'pr: push depois do veredito'); }
  gitOk(D, 'init', '-q', '--bare', '-b', 'main', m.origem);
  gitOk(sem, 'push', '-q', m.origem, 'main', 'v-99-pr', ...(c.integracao ? [c.integracao] : []));
  gitOk(D, 'clone', '-q', m.origem, m.trab);
  const SHA256 = createHash('sha256').update(c.nome).digest('hex');
  const troca = (s) => s.replaceAll('@H2', H2 ?? '@H2-INEXISTENTE').replaceAll('@H', H).replaceAll('@P1', P1).replaceAll('@SHA256', SHA256);
  const lista = c.comentarios.map((k, i) => ({ autor: k.autor ?? 'conta-falsa', corpo: troca(k.corpo), em: new Date(Date.UTC(2026, 10, 1, 9, i)).toISOString() }));
  writeFileSync(join(m.estado, 'cenario.json'), JSON.stringify({
    repo: REPO, origem: m.origem, padrao: 'main', rotulos: ROTULOS,
    pr: { number: PR, title: 'T-30: mudança de teste', body: `Closes #${TICKET}\n\nTicket T-30 do pacote de teste.`, headRefName: 'v-99-pr',
      baseRefName: c.pr.base, isDraft: !!c.pr.isDraft, head: H, headReal: H2 ?? H, ticket: TICKET },
    comentarios: { [PR]: lista },
    issues: PACOTE,
  }, null, 2));
  return Object.assign(m, { P1, H, H2, refsAntes: refs(m.origem) });
}

// corre `node scripts/avancar.mjs --pr 9110 --repo <REPO> --modo <modo> [--integracao <b>]` em trabalho/ e junta o que ficou
export function correAvancar(m, { limite_ms = 240000 } = {}) {
  const c = m.c;
  const args = ['scripts/avancar.mjs', '--pr', String(PR), '--repo', REPO, '--modo', c.modo, ...(c.integracao ? ['--integracao', c.integracao] : [])];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, args, { cwd: m.trab, env: ambienteDoCenario(m), stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32', windowsHide: true });
    if (Number.isInteger(p.pid)) PIDS.add(p.pid);
    let out = '', pendurado = false;
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    const relogio = setTimeout(() => { pendurado = true; mataArvore(p.pid); }, limite_ms);
    let feito = false;
    const acaba = (status) => {
      if (feito) return; feito = true;
      clearTimeout(relogio);
      setTimeout(() => {
        p.stdout.destroy(); p.stderr.destroy();
        const f = join(m.trab, '.forge', 'proxima-fase.json');
        resolve({ status, out, ms: Date.now() - t0, pendurado, chamadas: lerJsonl(join(m.estado, 'chamadas.jsonl')), refsDepois: refs(m.origem),
          proxima: existsSync(f) ? readFileSync(f, 'utf8') : null });
      }, 200);
    };
    p.on('exit', acaba);
    p.on('error', (e) => { out += String(e); acaba(null); });
  });
}
export const saida = (r) => `saída ${r.status}${r.pendurado ? ' (PENDURADO: morto pelo teste)' : ''} ao fim de ${Math.round(r.ms / 1000)} s\n`
  + `chamadas ao gh: ${r.chamadas.map((c) => `[${c.codigo}] gh ${c.argv.join(' ').slice(0, 160)}`).join('\n  ') || 'nenhuma'}\n${r.out.slice(-2500)}`;

// --- o que o avancar fez, visto pelo gh falso ---
const efeitos = (r) => r.chamadas.flatMap((c) => c.efeitos);
export const prMerges = (r) => r.chamadas.filter((c) => c.argv[0] === 'pr' && c.argv[1] === 'merge');
export const merges = (r) => efeitos(r).filter((e) => e.tipo === 'merge');
export const comentariosEm = (r, ...alvos) => efeitos(r).filter((e) => e.tipo === 'comentario' && alvos.includes(e.alvo));
export const issuesCriadas = (r) => efeitos(r).filter((e) => e.tipo === 'issue');
export const indice = (r, pred) => r.chamadas.findIndex(pred);
// as flags de uma chamada `pr merge`: --squash (ou -s) e o valor de --match-head-commit
export function flagsDoMerge(argv) {
  const a = argv.slice(2);
  let match = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--match-head-commit') match = a[i + 1] ?? null;
    else if (a[i].startsWith('--match-head-commit=')) match = a[i].slice('--match-head-commit='.length);
  }
  return { squash: a.includes('--squash') || a.includes('-s'), match };
}
// o esquema do .forge/proxima-fase.json (resposta à P3): devolve a lista de erros, vazia = válido
export function validaFase(f, titulos) {
  const e = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['não é um objeto'];
  if (f.spec !== SPEC) e.push(`spec: ${JSON.stringify(f.spec)} (esperava ${SPEC})`);
  if (typeof f.geradoEm !== 'string' || !Number.isFinite(Date.parse(f.geradoEm))) e.push(`geradoEm: ${JSON.stringify(f.geradoEm)}`);
  if (!Array.isArray(f.proximas)) return [...e, 'proximas não é uma lista'];
  for (const p of f.proximas) {
    if (!Number.isInteger(p?.numero)) e.push(`numero: ${JSON.stringify(p?.numero)}`);
    else if (p.titulo !== titulos.get(p.numero)) e.push(`titulo de ${p.numero}: ${JSON.stringify(p.titulo)} (esperava ${JSON.stringify(titulos.get(p.numero))})`);
  }
  return e;
}export const mencionaNumero = (texto, n) => new RegExp(`(?<![\\w])#?${n}(?![\\w])`).test(texto);

// C4: onde o token aparece (vazio = em lado nenhum): a saída do avancar, todos os ficheiros da pasta do cenário (o argv do gh em
// chamadas.jsonl, o do node em node-argv.jsonl, o do git em git-trace.log, os .git/config, o .forge/, o temp/) e o histórico de cada repo
export function procuraToken(m, r) {
  const achados = [], repos = [];
  if (r.out.includes(TOKEN)) achados.push('stdout/stderr do avancar');
  const anda = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (existsSync(join(p, 'HEAD')) && existsSync(join(p, 'objects'))) repos.push(p); anda(p); }
      else if (e.isFile() && statSync(p).size < 50e6 && readFileSync(p).includes(TOKEN)) achados.push(p);
    }
  };
  anda(m.D);
  for (const g of repos) {
    const l = spawnSync('git', ['--git-dir', g, 'log', '--all', '-p', '--format=%H%n%B'], { encoding: 'utf8', env: ambiente(), maxBuffer: 1e9 });
    if (l.stdout.includes(TOKEN)) achados.push(`${g}: histórico`);
  }
  return achados;
}