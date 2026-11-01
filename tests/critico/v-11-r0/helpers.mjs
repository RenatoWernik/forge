// Ronda −1 do V-11 (#135): utilitários dos ataques. Só biblioteca padrão, sem rede e sem servidores; as cópias vivem no tmp e apagam-se.
// Esta pasta é nova, por isso o lint do F-26 também a lê. Aqui não há literais hexadecimais, nem a opção de nomes do git diff escrita por
// extenso, nem títulos de âmbito sem soNoTicket: os textos plantados nas cópias montam-se a partir de pedaços.
//
// LEITURA DO CONTRATO (#135 com as PERGUNTAS dos comentários 6562861661 e 6562953831; segue a RESPOSTA do orquestrador, se mudar):
// - inventário fechado: as 22 pastas cujo helpers.mjs declara BASE = '<sha>' na base 875c519. Um uso de BASE (o identificador no código, fora
//   de comentários, strings, import e da própria declaração) está classificado se estiver num teste «ÂMBITO:» com soNoTicket(t, '<id da pasta>')
//   ou se tiver uma entrada {ficheiro, trecho, motivo} em scripts/guardas-legado.json › referencia (trecho = a linha do uso, sem espaços nas pontas);
// - exceções do lint: scripts/guardas-legado.json › excecoes [{ficheiro, regra, motivo}], que só valem para pastas de legado; legado continua
//   uma lista de strings (os ataques do F-26 usam-na assim);
// - inventário de nomes: estático (títulos literais de test/it/describe), do merge-base para a árvore, com o prefixo «ÂMBITO: » retirado.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { base } from '../_comum/base.mjs';

export { base };
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const LINT = ['scripts', 'guardas-critico.test.mjs'].join('/');
export const LISTA = ['scripts', 'guardas-legado.json'].join('/');
export const AMB = '\u00C2MBITO:';
export const AMBITO = /^\s*[\u00C2\u00E2Aa][Mm][Bb][Ii][Tt][Oo]:/;
export const NOME_SO = ['--name', 'only'].join('-');
export const SHA_PLANTADO = ['abc', '1234'].join('');

// o inventário fechado da #135: os 22 helpers.mjs com BASE fixo na base
export const INVENTARIO = ['f-01-r0', 'f-02-r0', 'f-04-r0', 'f-07-r0', 'f-08-r0', 'f-09-r0', 'f-10-r0', 'f-11-r0', 'f-12-r0', 'f-13-r0', 'f-14-r0',
  'f-15a-r0', 'f-16-r0', 'f-17-r0', 'f-18-r0', 'f-20a-r0', 'f-20b-r0', 'f-20c-r0', 'f-21a-r0', 'f-22a-r0', 'f-23a-r0', 'f-25-r0'];
// a secção legado de scripts/guardas-legado.json na base (31 pastas)
export const LEGADO = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-04-r0', 'f-05-r0', 'f-06-r0', 'f-07-r0', 'f-08-r0', 'f-09-r0', 'f-10-r0', 'f-11-r0', 'f-12-r0',
  'f-13-r0', 'f-14-r0', 'f-15a-r0', 'f-15b-r0', 'f-16-r0', 'f-17-r0', 'f-18-r0', 'f-20a-r0', 'f-20b-r0', 'f-20b-r1', 'f-20c-r0', 'f-20c-r1', 'f-21a-r0',
  'f-21b-r0', 'f-22a-r0', 'f-22a-r1', 'f-23a-r0', 'f-24-r0', 'f-25-r0'];
export const DECL = /\bBASE\s*=\s*'([0-9a-f]{7,40})'/;
export const idDaPasta = (p) => p.replace(/-r\d+$/, '');
export const pastaDe = (rel) => rel.split('/')[2];

const lixo = [];
export const novoTmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); lixo.push(d); return d; };
export const limpa = () => { for (const p of lixo.splice(0)) try { rmSync(p, { recursive: true, force: true }); } catch {} vazio = null; };
export const escreve = (raiz, rel, texto) => { const f = join(raiz, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, texto); return f; };
export const ler = (rel, raiz = ROOT) => readFileSync(join(raiz, rel), 'utf8');
export const lerJson = (rel, raiz = ROOT) => JSON.parse(ler(rel, raiz));

// o ambiente dos filhos: sem GITHUB_HEAD_REF nem NODE_TEST_CONTEXT herdados, sem config de sistema nem global do git (nunca a do utilizador)
let vazio = null;
export const ambiente = (extra = {}) => {
  if (!vazio) { vazio = join(novoTmp('critico-v11-cfg-'), 'gitconfig'); writeFileSync(vazio, ''); }
  const e = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: vazio, GIT_TERMINAL_PROMPT: '0' };
  delete e.GITHUB_HEAD_REF;
  delete e.NODE_TEST_CONTEXT; // sem isto, um node --test filho de um node --test não corre nada e sai com 0
  return { ...e, ...extra };
};
export const gitEm = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env: ambiente(), maxBuffer: 256 * 1024 * 1024 });
export const gitOk = (cwd, ...a) => { const r = gitEm(cwd, ...a); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
// git no repo do forge, com a config dele
export const gitRaiz = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const linhasDe = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

// os ficheiros da árvore (versionados e novos, sem os ignorados nem os apagados)
// (a do ROOT lê-se uma vez por processo)
let daRaiz = null;
export const arvore = (raiz = ROOT) => {
  if (raiz === ROOT && daRaiz) return daRaiz;
  const r = [...new Set(linhasDe(spawnSync('git', ['ls-files', '-c', '-o', '--exclude-standard'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout))]
    .filter((f) => existsSync(join(raiz, f)));
  if (raiz === ROOT) daRaiz = r;
  return r;
};
export const mjsDaPasta = (p, raiz = ROOT) => arvore(raiz).filter((f) => f.startsWith(`tests/critico/${p}/`) && /\.(?:mjs|cjs|js)$/.test(f));
export const listaNaBase = (sha, ...caminhos) => linhasDe(gitRaiz('ls-tree', '-r', '--name-only', sha, '--', ...caminhos).stdout);

// o texto de vários ficheiros numa revisão, num só git cat-file --batch: Map(caminho → texto, ou null se não existir)
export function naRevisao(sha, caminhos) {
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd: ROOT, input: caminhos.map((c) => `${sha}:${c}\n`).join(''), maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('git cat-file: ' + r.stderr);
  const buf = r.stdout, m = new Map();
  let i = 0;
  for (const c of caminhos) {
    const nl = buf.indexOf(10, i), cab = buf.subarray(i, nl).toString('utf8');
    i = nl + 1;
    if (/ missing$/.test(cab)) { m.set(c, null); continue; }
    const tam = Number(cab.split(' ')[2]);
    m.set(c, buf.subarray(i, i + tam).toString('utf8'));
    i += tam + 1;
  }
  return m;
}

// --- um leitor de JS, não um parser: comentários, strings, templates e regexes ficam em branco (as interpolações ficam como código) ---
const KW = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'instanceof', 'new', 'throw', 'else', 'do', 'yield', 'await']);
export function mascara(src) {
  const out = src.split(''), strs = [];
  let i = 0, ult = '';
  const branco = (a, b) => { for (let k = a; k < b && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '; };
  const regexOk = () => ult === '' || (ult[0] === 'p' && !')]'.includes(ult[1])) || (ult[0] === 'i' && KW.has(ult.slice(1)));
  const literal = (q) => {
    const ini = i;
    for (i++; i < src.length && src[i] !== q && src[i] !== '\n'; i++) if (src[i] === '\\') i++;
    strs.push({ ini, fim: i, raw: src.slice(ini + 1, i) });
    branco(ini + 1, i);
    i++;
  };
  const template = () => {
    const ini = i;
    let seg = ++i;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { branco(seg, i); i += 2; const u = ult; ult = ''; codigo(true); ult = u; seg = ++i; continue; }
      i++;
    }
    branco(seg, i);
    strs.push({ ini, fim: i, raw: src.slice(ini + 1, i) });
    i++;
  };
  const regex = () => {
    const ini = i;
    let classe = false;
    for (i++; i < src.length && src[i] !== '\n'; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '[') classe = true;
      else if (src[i] === ']') classe = false;
      else if (src[i] === '/' && !classe) break;
    }
    branco(ini + 1, i);
    i++;
    while (/[a-z]/i.test(src[i] ?? '')) i++;
  };
  function codigo(ateChaveta) {
    let d = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') { const e = src.indexOf('\n', i), f = e < 0 ? src.length : e; branco(i, f); i = f; continue; }
      if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2), f = e < 0 ? src.length : e + 2; branco(i, f); i = f; continue; }
      if (c === '"' || c === "'") { literal(c); ult = 'v'; continue; }
      if (c === '`') { template(); ult = 'v'; continue; }
      if (c === '/' && regexOk()) { regex(); ult = 'v'; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (ateChaveta) { if (c === '{') d++; else if (c === '}' && d-- === 0) return; }
      const w = /^[\p{L}\p{N}_$]+/u.exec(src.slice(i, i + 80));
      if (w) { ult = /^\d/.test(w[0]) ? 'v' : 'i' + w[0]; i += w[0].length; continue; }
      ult = 'p' + c;
      i++;
    }
  }
  codigo(false);
  return { codigo: out.join(''), strs };
}

const linhaEm = (src, idx) => src.slice(0, idx).split('\n').length;
const CHAMADA_TESTE = /(?<![\p{L}\p{N}_$.])(?:test|it|describe)\s*\(/gu;
const SO_NO_TICKET = /(?<![\p{L}\p{N}_$.])soNoTicket\s*\(/g;
// as chamadas test/it/describe com título literal: {titulo (o texto cru entre as aspas), ini, fim, linha, texto, ids (os ids dos soNoTicket(t, '<id>'))}
export function testes(src) {
  const { codigo, strs } = mascara(src);
  const porIni = new Map(strs.map((s) => [s.ini, s]));
  const out = [];
  for (const m of codigo.matchAll(CHAMADA_TESTE)) {
    const abre = m.index + m[0].length - 1;
    let k = abre + 1;
    while (/\s/.test(codigo[k] ?? '')) k++;
    const s = porIni.get(k);
    if (!s) continue;
    let d = 0, fim = abre;
    for (; fim < codigo.length; fim++) { if (codigo[fim] === '(') d++; else if (codigo[fim] === ')' && --d === 0) break; }
    const ids = [];
    for (const c of codigo.slice(abre, fim).matchAll(SO_NO_TICKET)) {
      const a = /^soNoTicket\s*\(\s*t\s*,\s*(['"])([^'"\n]+)\1\s*\)/.exec(src.slice(abre + c.index));
      if (a) ids.push(a[2]);
    }
    out.push({ titulo: s.raw, ini: m.index, fim, linha: linhaEm(src, m.index), texto: src.slice(m.index, fim + 1), ids });
  }
  return out;
}
export const semPrefixo = (titulo) => titulo.replace(/^\u00C2MBITO: /, '');
export const deAmbito = (te, id) => AMBITO.test(te.titulo) && te.ids.includes(id);

// os usos do identificador BASE no código: {linha, trecho, teste (o test/it/describe mais interior que o contém, ou null)}
export function usos(src) {
  const { codigo } = mascara(src);
  const imports = [...codigo.matchAll(/\bimport\s*\{[^}]*\}\s*from\b/g)].map((m) => [m.index, m.index + m[0].length]);
  const ts = testes(src);
  const linhas = src.split('\n');
  const r = [];
  for (const m of codigo.matchAll(/(?<![\p{L}\p{N}_$.])BASE(?![\p{L}\p{N}_$])/gu)) {
    if (imports.some(([a, b]) => m.index >= a && m.index < b)) continue;
    if (/\b(?:const|let|var)\s+$/.test(codigo.slice(Math.max(0, m.index - 30), m.index))) continue;
    const dentro = ts.filter((t) => t.ini <= m.index && m.index <= t.fim).sort((a, b) => (a.fim - a.ini) - (b.fim - b.ini))[0] ?? null;
    const linha = linhaEm(src, m.index);
    r.push({ linha, trecho: linhas[linha - 1].trim(), teste: dentro });
  }
  return r;
}

// --- cópias ---
// Cópia sem história (versionados e novos, sem os ignorados), para o lint, que só lê ficheiros
export const copia = () => {
  const d = join(novoTmp('critico-v11-copia-'), 'r');
  for (const f of arvore()) {
    const s = join(ROOT, f);
    if (statSync(s).isDirectory()) continue;
    mkdirSync(dirname(join(d, f)), { recursive: true });
    copyFileSync(s, join(d, f));
  }
  return d;
};
// Clone com a história (as BASE fixas existem lá): o HEAD deste repo, com as alterações da árvore por cima, e origin/main = o merge-base
export const clona = () => {
  const mb = base();
  if (!mb) return null;
  const comum = resolve(ROOT, gitRaiz('rev-parse', '--git-common-dir').stdout.trim());
  const pai = novoTmp('critico-v11-clone-'), d = join(pai, 'r');
  gitOk(pai, 'clone', '-q', '--shared', '--no-checkout', comum, d);
  gitOk(d, 'checkout', '-q', '--detach', gitRaiz('rev-parse', 'HEAD').stdout.trim());
  for (const f of linhasDe(gitRaiz('ls-files', '-m', '-o', '--exclude-standard').stdout)) {
    const s = join(ROOT, f);
    if (existsSync(s) && !statSync(s).isDirectory()) { mkdirSync(dirname(join(d, f)), { recursive: true }); copyFileSync(s, join(d, f)); }
  }
  for (const f of linhasDe(gitRaiz('ls-files', '-d').stdout)) rmSync(join(d, f), { force: true });
  gitOk(d, 'update-ref', 'refs/remotes/origin/main', mb);
  return d;
};
// põe o HEAD do clone num ramo com este nome (o mesmo commit; a árvore não muda)
export const ramo = (d, nome) => { gitOk(d, 'update-ref', `refs/heads/${nome}`, 'HEAD'); gitOk(d, 'symbolic-ref', 'HEAD', `refs/heads/${nome}`); };

// corre node --test com tap: {code, out, linhas (as linhas «ok/not ok» de topo), blocos (título → texto do bloco «not ok»)}
export const nodeTest = (cwd, args, extra = {}) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...args], { cwd, encoding: 'utf8', env: ambiente(extra), timeout: 300000, maxBuffer: 256 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const linhas = out.split(/\r?\n/), resultados = [];
  let atual = null;
  for (const l of linhas) {
    const m = /^(\s*)(not ok|ok) \d+ - (.*)$/.exec(l);
    if (m) { atual = { ok: m[2] === 'ok', titulo: m[3], bloco: [l] }; resultados.push(atual); continue; }
    if (atual) atual.bloco.push(l);
  }
  return { code: r.status, out, resultados: resultados.map((x) => ({ ...x, bloco: x.bloco.join('\n') })) };
};
export const cauda = (r, n = 3000) => r.out.slice(-n);