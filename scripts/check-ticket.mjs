#!/usr/bin/env node
// check-ticket (V-05, #129; spec #123 §3 e §4.5): a Ronda 0 mecânica. Corre antes de entregar um ticket e imprime sempre as 6 linhas, por esta ordem,
// também depois de um FAIL (um FAIL num passo não esconde os seguintes): `ok <passo>` ou `FAIL <passo> (detalhe)`.
//   1 árvore limpa  2 lint  3 âmbito  4 afetadas no ramo  5 pós-merge  6 esquema
// O passo 4 corre as suítes afetadas pelo executor; o 5 corre as mesmas num clone temporário com `main` = `origin/main` = HEAD (os testes
// «ÂMBITO:» fazem skip), em paralelo com o 4 e a partilhar as vagas; o 6 exige `pass` nas suítes das regras `esquema: true` tocadas.
//   node scripts/check-ticket.mjs --ambito <glob>... [--base origin/main] [--publicar <pr>] [--continuar] [--raiz <dir>]
// Saída: 0 tudo ok; 1 algum FAIL; 2 erro de uso; 3 incompleto (o orçamento_s do executor não chegou: repetir com --continuar).
// O relatório fica em <raiz>/.forge/check-ticket/<sha>.json. Com --publicar, `gh pr comment <pr> --body <...>` (GH_BIN muda o executável): a
// 1.ª linha é `CHECK-TICKET: VERDE <sha> <sha256 do relatório>` ou `CHECK-TICKET: VERMELHO <sha>`. Só biblioteca padrão.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afetadas } from './afetadas.mjs';
import { estadoDe, executa, lerTap } from './executor.mjs';

const LINTS = ['scripts/guardas-critico.test.mjs', 'scripts/mapa-suites.test.mjs'];
const LIMITE_LINT_MS = 180000;
const TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'];
class Uso extends Error {}

function lerArgs(argv) {
  const o = { ambito: [], base: 'origin/main', publicar: null, continuar: false, raiz: process.cwd() };
  const valor = (i, nome) => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Uso(`${nome} precisa de um valor`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ambito') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o.ambito.push(argv[++i]); }
    else if (a === '--base') o.base = valor(i++, a);
    else if (a === '--publicar') o.publicar = valor(i++, a);
    else if (a === '--continuar') o.continuar = true;
    else if (a === '--raiz') o.raiz = resolve(valor(i++, a));
    else throw new Uso(`argumento desconhecido: ${a}`);
  }
  if (!o.ambito.length) throw new Uso('indique --ambito <glob>...');
  if (o.publicar !== null && !/^(\d+|https:\/\/\S+)$/.test(o.publicar)) throw new Uso('--publicar: o número do PR (ou o URL dele)');
  return o;
}

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 });
const nomes = (txt) => txt.split('\0').filter(Boolean);
const curto = (s, n = 300) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const casa = (f, globs) => globs.some((g) => { const p = g.replaceAll('\\', '/').replace(/^\.\//, ''); return f === p || posix.matchesGlob(f, p); });

// 1: tudo commitado (o .forge/ é do executor e não conta)
function arvoreLimpa(raiz) {
  const r = git(raiz, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames');
  if (r.status !== 0) return { estado: 'FAIL', detalhe: curto(r.stderr.trim()) };
  const sujos = nomes(r.stdout).map((l) => l.slice(3)).filter((f) => !f.startsWith('.forge/'));
  return sujos.length ? { estado: 'FAIL', detalhe: curto(sujos.join(', ')) } : { estado: 'ok', detalhe: '' };
}

// 2: os lints da raiz, cada um num `node --test`; um lint em falta é FAIL
function lint(raiz) {
  const um = (rel) => new Promise((fim) => {
    if (!existsSync(join(raiz, rel))) return fim(`${rel} em falta`);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', rel], { cwd: raiz, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: LIMITE_LINT_MS });
    let out = '';
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    p.on('error', (e) => fim(`${rel}: ${e.message}`));
    p.on('close', (status, sinal) => {
      if (sinal) return fim(`${rel}: morto por ${sinal} (limite de ${LIMITE_LINT_MS / 1000} s)`);
      if (estadoDe(status, lerTap(out)) === 'pass') return fim(null);
      const maus = [...out.matchAll(/^\s*not ok \d+ - (.*?)\s*$/gm)].map((m) => m[1]).slice(0, 3);
      fim(`${rel}: ${maus.join('; ') || `código ${status}`}`);
    });
  });
  return Promise.all(LINTS.map(um)).then((r) => { const maus = r.filter(Boolean); return maus.length ? { estado: 'FAIL', detalhe: curto(maus.join(' | ')) } : { estado: 'ok', detalhe: '' }; });
}

// 3: os ficheiros do diff contra o merge-base (com a árvore de trabalho, sem deteção de renomeações: o nome antigo também conta) ⊆ os globs
function diffDoRamo(raiz, base) {
  const mb = git(raiz, 'merge-base', 'HEAD', base);
  if (mb.status !== 0 || !mb.stdout.trim()) throw new Error(`sem merge-base com ${base}`);
  const d = git(raiz, 'diff', '-z', '--name-only', '--no-renames', mb.stdout.trim());
  if (d.status !== 0) throw new Error(curto(d.stderr.trim()));
  return nomes(d.stdout);
}
const ambito = (ficheiros, globs) => {
  const fora = ficheiros.filter((f) => !casa(f, globs));
  return fora.length ? { estado: 'FAIL', detalhe: curto(`fora do âmbito: ${fora.join(', ')}`) } : { estado: 'ok', detalhe: '' };
};

// 4 e 5: as suítes afetadas pelo executor, na raiz ou no clone; só dá ok com o resultado completo, deste sha, e `pass` em cada suíte pedida
const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
async function corre(prefixo, raiz, suites, sha, continuar) {
  const saidas = [];
  let codigo;
  try { codigo = await executa(['--suites', suites.join(','), '--raiz', raiz, ...(continuar ? ['--continuar'] : [])], { saida: (l) => { saidas.push(l); console.log(`  [${prefixo}] ${l}`); } }); }
  catch (e) { return { estado: 'FAIL', detalhe: curto(`executor: ${e.message}`), suites: {} }; }
  const ficheiro = /→ (.+)$/.exec(saidas.at(-1) ?? '')?.[1];
  if (!ficheiro || !existsSync(ficheiro)) return { estado: 'FAIL', detalhe: 'o executor não deixou resultados', suites: {} };
  const res = lerJson(ficheiro);
  const maus = res.unidades.filter((u) => u.estado !== 'pass').map((u) => `${u.suite}: ${u.estado} ${u.ficheiro}`);
  const estados = Object.fromEntries(Object.entries(res.suites).map(([n, s]) => [n, s.estado]));
  if (maus.length) return { estado: 'FAIL', detalhe: curto(maus.join('; ')), suites: estados, ficheiro };
  if (codigo === 3) return { estado: 'pendente', detalhe: curto(`incompleto: repetir com --continuar (${suites.filter((s) => estados[s] !== 'pass').join(', ')})`), suites: estados, ficheiro };
  const faltam = suites.filter((s) => estados[s] !== 'pass');
  if (codigo !== 0 || res.sha !== sha || !res.completo || faltam.length) return { estado: 'FAIL', detalhe: curto(`sem prova (código ${codigo}${res.sha !== sha ? ', outro sha' : ''}): ${faltam.join(', ')}`), suites: estados, ficheiro };
  return { estado: 'ok', detalhe: suites.join(', '), suites: estados, ficheiro };
}

// curto de propósito: os logs do executor levam o sha e o nome do ficheiro, e o Windows corta os caminhos nos 260 caracteres
const clonePath = (sha) => join(tmpdir(), `fct-${sha.slice(0, 12)}`);
// o clone do passo 5: main = origin/main = HEAD; com --continuar reaproveita o do mesmo sha (tem os resultados das unidades já feitas)
function clona(raiz, sha, continuar) {
  const dir = clonePath(sha);
  if (continuar && existsSync(join(dir, '.git')) && git(dir, 'rev-parse', 'HEAD').stdout.trim() === sha) return dir;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  mkdirSync(dirname(dir), { recursive: true });
  for (const a of [['clone', '-q', '--no-checkout', raiz, dir], ['-C', dir, 'checkout', '-q', '-B', 'main', sha], ['-C', dir, 'update-ref', 'refs/remotes/origin/main', sha]]) {
    const r = git(raiz, ...a);
    if (r.status !== 0) throw new Error(curto(`git ${a[0] === '-C' ? a[2] : a[0]}: ${r.stderr.trim()}`));
  }
  return dir;
}

// 6: as regras `esquema: true` tocadas pelo diff e os consumidores delas (as suítes da regra) têm de ter `pass` no passo 4
function esquema(raiz, ficheiros, todas, p4) {
  const regras = lerJson(join(raiz, 'scripts', 'mapa-suites.json')).regras.filter((r) => r.esquema === true && ficheiros.some((f) => casa(f, r.caminhos)));
  const consumidores = [...new Set(regras.flatMap((r) => (r.suites.includes('*') ? todas : r.suites)))];
  const maus = consumidores.filter((s) => ['fail', 'limite', 'erro'].includes(p4.suites[s]) || (p4.estado !== 'pendente' && p4.suites[s] !== 'pass'));
  if (maus.length) return { estado: 'FAIL', detalhe: curto(`${maus.map((s) => `${s}: ${p4.suites[s] ?? 'não correu'}`).join(', ')} (esquema de ${regras.map((r) => r.caminhos[0]).join(', ')})`) };
  if (consumidores.some((s) => p4.suites[s] !== 'pass')) return { estado: 'pendente', detalhe: 'incompleto: repetir com --continuar' };
  return { estado: 'ok', detalhe: consumidores.join(', ') };
}

function publica(ghEnv, raiz, pr, corpo) {
  const r = spawnSync(ghEnv.GH_BIN || 'gh', ['pr', 'comment', pr, '--body', corpo], { cwd: raiz, env: ghEnv, encoding: 'utf8', shell: false });
  if (r.error || r.status !== 0) throw new Error(curto(`gh pr comment: ${r.error?.message ?? r.stderr.trim()}`));
}

async function main(argv) {
  const o = lerArgs(argv), raiz = o.raiz;
  const rev = git(raiz, 'rev-parse', 'HEAD');
  if (rev.status !== 0) throw new Uso(`${raiz} não é um repositório git com commits`);
  const sha = rev.stdout.trim();
  // o token só serve ao gh: os testes que o executor lança não o herdam (e GITHUB_HEAD_REF, do CI, não pode enganar o soNoTicket do clone)
  const ghEnv = { ...process.env };
  for (const k of [...TOKENS, 'GITHUB_HEAD_REF']) delete process.env[k];

  const passos = [];
  const diz = (passo, r) => { passos.push({ passo, ...r }); console.log(r.estado === 'ok' ? `ok ${passo}${r.detalhe ? ` (${r.detalhe})` : ''}` : `${r.estado === 'FAIL' ? 'FAIL' : 'pendente'} ${passo} (${r.detalhe})`); };
  const falha = (e) => ({ estado: 'FAIL', detalhe: curto(e.message) });
  const orfao = (porque) => ({ estado: 'FAIL', detalhe: porque });

  const pLint = lint(raiz); // corre em paralelo com o executor: o orçamento_s dele já ocupa quase toda a chamada
  diz('árvore limpa', arvoreLimpa(raiz));

  let ficheiros = null, suites = null, todas = [], erro;
  try { ficheiros = diffDoRamo(raiz, o.base); } catch (e) { erro = e; }

  let pRamo = Promise.resolve(orfao('sem diff contra a base')), pPos = pRamo;
  if (ficheiros) {
    try {
      todas = lerJson(join(raiz, 'scripts', 'suites.json')).suites.map((s) => s.nome);
      const r = await afetadas(ficheiros, { raiz });
      suites = [...r.suites];
      if (suites.includes('*')) suites = todas;
      if (!suites.length) throw new Error(ficheiros.length ? 'nenhuma suíte afetada (erro de mapa?)' : 'diff vazio contra a base');
      pRamo = corre('ramo', raiz, suites, sha, o.continuar).catch(falha);
      pPos = Promise.resolve().then(() => corre('pós-merge', clona(raiz, sha, o.continuar), suites, sha, o.continuar)).catch(falha);
    } catch (e) { pRamo = Promise.resolve(falha(e)); pPos = pRamo; suites = null; }
  }
  diz('lint', await pLint);
  diz('âmbito', ficheiros ? ambito(ficheiros, o.ambito) : falha(erro));
  const p4 = await pRamo;
  diz('afetadas no ramo', p4);
  diz('pós-merge', await pPos);
  let p6;
  try { p6 = suites ? esquema(raiz, ficheiros, todas, p4) : orfao('sem afetadas no ramo'); } catch (e) { p6 = falha(e); }
  diz('esquema', p6);

  const falhou = passos.some((p) => p.estado === 'FAIL'), pendente = passos.some((p) => p.estado === 'pendente');
  const codigo = falhou ? 1 : pendente ? 3 : 0;
  const pasta = join(raiz, '.forge', 'check-ticket'), rel = join(pasta, `${sha}.json`);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(`${rel}.tmp`, JSON.stringify({ versao: 1, sha, base: o.base, ambito: o.ambito, ficheiros, suites, resultado: falhou ? 'VERMELHO' : pendente ? 'INCOMPLETO' : 'VERDE',
    passos, fim: new Date().toISOString() }, null, 2) + '\n');
  renameSync(`${rel}.tmp`, rel);
  if (pendente && !falhou) console.log('check-ticket: incompleto; repetir com --continuar (o relatório fica para a chamada final)');
  if (o.publicar !== null && codigo !== 3) {
    const cabeca = falhou ? `CHECK-TICKET: VERMELHO ${sha}` : `CHECK-TICKET: VERDE ${sha} ${createHash('sha256').update(readFileSync(rel)).digest('hex')}`;
    publica(ghEnv, raiz, o.publicar, [cabeca, ...passos.map((p) => `${p.estado === 'ok' ? 'ok' : 'FAIL'} ${p.passo}${p.detalhe ? ` (${p.detalhe})` : ''}`)].join('\n'));
  }
  // o clone fica com os logs TAP do pós-merge quando algo falhou ou falta (o --continuar também o reaproveita); só o verde o apaga
  if (codigo === 0) rmSync(clonePath(sha), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  else console.log(`check-ticket: o clone do pós-merge (com os logs) ficou em ${clonePath(sha)}`);
  return codigo;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => {
    console.error(e instanceof Uso ? `check-ticket: ${e.message}` : e);
    process.exitCode = e instanceof Uso ? 2 : 1;
  });
}
