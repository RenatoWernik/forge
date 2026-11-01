// Ronda −1 do F-26 (#101): utilitários dos ataques. Só biblioteca padrão, sem rede e sem servidores.
// Esta pasta é nova, por isso o lint do F-26 também a lê. Aqui não há literais hexadecimais, nem a opção de nomes do git diff escrita por extenso,
// nem títulos de âmbito. Os casos em casos/*.txt trazem marcadores (@@...@@) que só se trocam pelo texto real dentro da cópia temporária.
//
// LEITURA DO CONTRATO (#101 com a RESPOSTA do orquestrador às PERGUNTAS do comentário 6552732340, vinculativa):
// - o lint é caixa preta: corre-se `node --test scripts/guardas-critico.test.mjs` numa cópia do repo (um repo git novo) e lê-se a saída tap;
// - um caso mau é uma pasta nova tests/critico/<pasta>/ plantada na cópia: o lint tem de falhar com a regra (L1, L2 ou L3) e o ficheiro nos blocos «not ok»;
// - a lista é {legado, emCurso}: uma entrada de legado sem pasta dá FAIL; uma pasta de emCurso fica isenta se existir e é ignorada se não existir;
// - o corpus do dev: scripts/corpus/guardas/<caso>/ com os .mjs e um esperado.json, {regra, ficheiro} ou {ok: true}.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const AQUI = fileURLToPath(new URL('./', import.meta.url));
export const LINT = 'scripts/guardas-critico.test.mjs';
export const LISTA = 'scripts/guardas-legado.json';
export const CORPUS = 'scripts/corpus/guardas';
export const COMUM = 'tests/critico/_comum';
// a lista congelada da #101: legado = as 27 pastas de tests/critico/ na base; emCurso = as 5 dos ramos abertos
export const LEGADO = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-04-r0', 'f-05-r0', 'f-06-r0', 'f-07-r0', 'f-08-r0', 'f-09-r0', 'f-10-r0', 'f-11-r0', 'f-12-r0',
  'f-13-r0', 'f-14-r0', 'f-15a-r0', 'f-15b-r0', 'f-16-r0', 'f-17-r0', 'f-18-r0', 'f-20a-r0', 'f-20b-r0', 'f-20b-r1', 'f-20c-r0', 'f-20c-r1', 'f-21a-r0',
  'f-23a-r0', 'f-25-r0'];
export const EM_CURSO = ['f-21b-r0', 'f-23b-r0', 'f-24-r0', 'f-22a-r0', 'f-22a-r1'];

// o texto que, escrito por extenso nestes ficheiros, o próprio lint podia ler como violação
export const NOME_SO = ['--name', 'only'].join('-');
export const AMB = '\u00C2MBITO:';
export const SHA_F22A = ['645', '120f'].join('');
export const SHA_CURTO = ['abc', '1234'].join('');
export const SHA_OUTRO = ['9f8e', '7d6'].join('');
export const troca = (s) => s.replaceAll('@@NOME_SO@@', NOME_SO).replaceAll('@@AMBITO@@', AMB).replaceAll('@@SHA_F22A@@', SHA_F22A)
  .replaceAll('@@SHA_CURTO@@', SHA_CURTO).replaceAll('@@SHA_OUTRO@@', SHA_OUTRO);
export const caso = (rel) => troca(readFileSync(join(AQUI, 'casos', rel), 'utf8').replace(/\r\n/g, '\n'));

export const tmp = (p = 'critico-f26-') => mkdtempSync(join(tmpdir(), p));
export const apaga = (p) => { try { rmSync(p, { recursive: true, force: true }); } catch {} };
export const escreve = (raiz, rel, texto) => { const f = join(raiz, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, texto); return f; };

// o ambiente dos filhos: sem GITHUB_HEAD_REF nem NODE_TEST_CONTEXT herdados, sem config de sistema nem global do git (nunca a do utilizador)
const VAZIO = join(tmpdir(), 'critico-f26-gitconfig-vazio');
export const ambiente = (extra = {}) => {
  if (!existsSync(VAZIO)) writeFileSync(VAZIO, '');
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: VAZIO, GIT_TERMINAL_PROMPT: '0' };
  delete e.GITHUB_HEAD_REF;
  delete e.NODE_TEST_CONTEXT; // sem isto, um node --test filho de um node --test não corre nada e sai com 0
  return { ...e, ...extra };
};
// git nos repos temporários
export const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', ...a],
  { cwd, encoding: 'utf8', env: ambiente() });
export const gitOk = (cwd, ...a) => { const r = git(cwd, ...a); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
// git no repo do forge, com a config dele (o autocrlf da worktree conta para o diff)
export const gitRaiz = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export const temLint = () => existsSync(join(ROOT, LINT));

// Cópia do repo (versionados e novos, sem os ignorados) num repo git novo; origin/main aponta para o primeiro commit
export const copia = () => {
  const d = tmp('critico-f26-copia-');
  const r = gitRaiz('ls-files', '-z', '-c', '-o', '--exclude-standard');
  if (r.status !== 0) throw new Error('git ls-files: ' + r.stderr);
  for (const f of new Set(r.stdout.split('\0').filter(Boolean))) {
    const s = join(ROOT, f);
    if (!existsSync(s) || statSync(s).isDirectory()) continue;
    mkdirSync(dirname(join(d, f)), { recursive: true });
    copyFileSync(s, join(d, f));
  }
  gitOk(d, 'init', '-q', '-b', 'main');
  gitOk(d, 'add', '-A');
  gitOk(d, 'commit', '-q', '-m', 'copia');
  gitOk(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return d;
};
export const commit = (d, msg) => { gitOk(d, 'add', '-A'); gitOk(d, 'commit', '-q', '--allow-empty', '-m', msg); };
export const repoe = (d) => { gitOk(d, 'reset', '-q', '--hard', 'refs/remotes/origin/main'); gitOk(d, 'clean', '-q', '-fd'); };
// planta uma pasta nova tests/critico/<pasta>/ com os ficheiros dados e faz commit
export const planta = (d, pasta, ficheiros) => {
  for (const [rel, txt] of Object.entries(ficheiros)) escreve(d, `tests/critico/${pasta}/${rel}`, txt);
  commit(d, 'planta ' + pasta);
};

// corre o lint na cópia, com tap; `falhas` junta os blocos «not ok» (título e diagnóstico)
export const corre = (d) => {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', LINT], { cwd: d, encoding: 'utf8', env: ambiente(), timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  const ms = performance.now() - t0;
  const out = (r.stdout || '') + (r.stderr || '');
  const blocos = [];
  let atual = null;
  for (const l of out.split(/\r?\n/)) {
    if (/^\s*not ok \d+/.test(l)) { atual = [l]; blocos.push(atual); }
    else if (/^\s*ok \d+/.test(l)) atual = null;
    else if (atual) atual.push(l);
  }
  const testes = Number((out.match(/^# tests (\d+)/m) || [])[1] || 0);
  // um lint que não corre nenhum teste passaria em vão os casos limpos, o C3 e o C5
  if (r.status === 0 && testes === 0) throw new Error('o lint saiu com 0 sem correr nenhum teste:\n' + out.slice(-2000));
  return { code: r.status, out, ms, testes, falhas: blocos.map((b) => b.join('\n')).join('\n') };
};
export const resumo = (r) => r.out.split(/\r?\n/).slice(-60).join('\n');

// as duas secções da lista congelada; falha clara se a forma não for {legado: [...], emCurso: [...]}
export const secoes = (j) => {
  if (!j || !Array.isArray(j.legado) || !Array.isArray(j.emCurso)) throw new Error('a lista congelada não tem a forma {legado: [...], emCurso: [...]}');
  return { legado: j.legado, emCurso: j.emCurso };
};
// muda a secção legado da lista da cópia: tira `tira` e acrescenta `poe`
export const mexeLista = (d, { tira, poe }) => {
  const p = join(d, LISTA);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const { legado } = secoes(j);
  if (tira && !legado.includes(tira)) throw new Error(tira + ' não está em legado');
  j.legado = legado.filter((x) => x !== tira).concat(poe ? [poe] : []);
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  commit(d, 'mexe a lista');
};
// regra 9: o mesmo contrato do soNoTicket de tests/critico/_comum/ambito.mjs, que ainda não existe na base (o ramo vem de GITHUB_HEAD_REF ou do
// git; HEAD destacado conta como fora); faz t.skip com o motivo e devolve true fora dos ramos <id>*
export const soNoTicket = (t, id) => {
  const ramo = process.env.GITHUB_HEAD_REF || gitRaiz('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
  if (ramo !== 'HEAD' && ramo.startsWith(id)) return false;
  t.skip(`âmbito do ${id}: fora da branch ${id}*`);
  return true;
};