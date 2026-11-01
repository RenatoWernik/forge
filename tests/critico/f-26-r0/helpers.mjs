// Ronda −1 do F-26 (#101): utilitários dos ataques. Só biblioteca padrão, sem rede e sem servidores.
// Esta pasta é nova, por isso o lint do F-26 também a lê. Aqui não há literais hexadecimais, nem a opção de nomes do git diff escrita por extenso,
// nem títulos de âmbito. Os casos em casos/*.txt trazem marcadores (@@...@@) que só se trocam pelo texto real dentro da cópia temporária.
//
// LEITURA DO CONTRATO (#101; PERGUNTAS no comentário 6552732340, por responder):
// - o lint é caixa preta: corre-se `node --test scripts/guardas-critico.test.mjs` numa cópia do repo (um repo git novo) e lê-se a saída tap;
// - um caso mau é uma pasta nova tests/critico/<pasta>/ plantada na cópia: o lint tem de falhar com a regra (L1, L2 ou L3) e o ficheiro nos blocos «not ok»;
// - na base faltam f-21b-r0, f-23b-r0 e f-24-r0 (ramos abertos): a cópia ganha uma pasta-marcador só para essas três, e só se faltarem (PERGUNTA 1).
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
// a lista congelada da #101: as 27 pastas de tests/critico/ na base, mais as 3 dos ramos abertos
export const NA_BASE = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-04-r0', 'f-05-r0', 'f-06-r0', 'f-07-r0', 'f-08-r0', 'f-09-r0', 'f-10-r0', 'f-11-r0', 'f-12-r0',
  'f-13-r0', 'f-14-r0', 'f-15a-r0', 'f-15b-r0', 'f-16-r0', 'f-17-r0', 'f-18-r0', 'f-20a-r0', 'f-20b-r0', 'f-20b-r1', 'f-20c-r0', 'f-20c-r1', 'f-21a-r0',
  'f-23a-r0', 'f-25-r0'];
export const PENDENTES = ['f-21b-r0', 'f-23b-r0', 'f-24-r0'];
export const CONGELADA = [...NA_BASE, ...PENDENTES];
export const PASTA_NOME = /^f-\d+[a-z]?-r\d+$/;

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
  for (const p of PENDENTES) if (!existsSync(join(d, 'tests/critico', p))) escreve(d, `tests/critico/${p}/LEIA.md`, 'marcador do crítico do F-26: pasta de um ramo aberto\n');
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

// os nomes de pastas que a lista congelada contém (valores de texto e chaves, a qualquer profundidade)
export const nomesDaLista = (j) => {
  const o = [];
  const anda = (v) => {
    if (typeof v === 'string') { if (PASTA_NOME.test(v)) o.push(v); }
    else if (Array.isArray(v)) v.forEach(anda);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (PASTA_NOME.test(k)) o.push(k); anda(x); }
  };
  anda(j);
  return o;
};
// muda a lista congelada da cópia: tira `tira` e acrescenta `poe`, no array (ou objeto) que tem as pastas
export const mexeLista = (d, { tira, poe }) => {
  const p = join(d, LISTA);
  let mexeu = false;
  const anda = (v) => {
    if (Array.isArray(v)) {
      if (v.includes('f-01-r0')) { mexeu = true; const n = v.filter((x) => x !== tira); if (poe) n.push(poe); return n; }
      return v.map(anda);
    }
    if (v && typeof v === 'object') {
      if ('f-01-r0' in v) { mexeu = true; const n = { ...v }; if (tira) delete n[tira]; if (poe) n[poe] = n['f-01-r0']; return n; }
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, anda(x)]));
    }
    return v;
  };
  const novo = anda(JSON.parse(readFileSync(p, 'utf8')));
  if (!mexeu) throw new Error('não encontrei as pastas na lista congelada ' + LISTA);
  writeFileSync(p, JSON.stringify(novo, null, 2) + '\n');
  commit(d, 'mexe a lista');
};