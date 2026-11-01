// F-26 (#101): rules 8 and 9 of the briefs as a lint over tests/critico/<folder>/, so they stop costing critic rounds.
//   L1 (rule 8): no hex literal of 7 to 40 chars reaches git as a revision: one anywhere in the initializer of an identifier containing
//      «base», or one in the argument list of a call whose first argument is 'git' (or of a gitX(...) helper), or in a string or template
//      that starts with «git ». Comments, titles, messages and fixture data (`{ ref: '...' }`) are not git.
//   L2 (rule 9): every test titled «ÂMBITO:» calls soNoTicket (tests/critico/_comum/ambito.mjs).
//   L3 (rule 9, the other way): every file that runs `git diff --name-only` (the «only these files changed» pattern) has that diff inside
//      a «ÂMBITO:» test, or uses base() (tests/critico/_comum/base.mjs).
// The folders in scripts/guardas-legado.json are frozen: «legado» must still exist, «emCurso» (open branches) is exempt when present.
// Reads text only: it never runs or imports a tests/critico file (the f-14 included). scripts/corpus/guardas/ is the oracle of the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CRITICO = join(ROOT, 'tests/critico');
const CORPUS = join(ROOT, 'scripts/corpus/guardas');
const LISTA = join(ROOT, 'scripts/guardas-legado.json');

// --- a scanner, not a parser: strings, template literals, regexes and comments are told apart; the rest is single punctuation ---
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete']);
// A template literal is a string token (its text, with each `${...}` blanked to a space) pushed AFTER the tokens of its interpolations,
// which are real code: «{ ... }» marker groups tagged with `tpl`, the template token.
export function tokenize(src, line = 1) {
  const out = [];
  let i = 0;
  const strEnd = (j, q) => { // j is just after the opening quote; returns the index of the closing quote
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '\\') j++;
      else if (c === q) return j;
      else if (q === '`' && c === '$' && src[j + 1] === '{') j = exprEnd(j + 2);
      else if (c === '\n' && q !== '`') return j;
    }
    return j;
  };
  const exprEnd = (j) => { // j is just after `${`; returns the index of the matching `}`
    for (let d = 1; j < src.length; j++) {
      const c = src[j];
      if (c === '"' || c === "'" || c === '`') j = strEnd(j + 1, c);
      else if (c === '{') d++;
      else if (c === '}' && --d === 0) return j;
    }
    return j;
  };
  const adv = (to) => { for (; i < to; i++) if (src[i] === '\n') line++; };
  const regexAllowed = () => {
    const p = out[out.length - 1];
    return !p || (p.t === 'p' && !')]'.includes(p.v)) || (p.t === 'id' && KEYWORDS_BEFORE_REGEX.has(p.v));
  };
  while (i < src.length) {
    const c = src[i], n = src[i + 1], at = line;
    if (/\s/.test(c)) { adv(i + 1); continue; }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); adv(e < 0 ? src.length : e); continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); adv(e < 0 ? src.length : e + 2); continue; }
    if (c === '"' || c === "'") { const e = strEnd(i + 1, c); out.push({ t: 's', v: src.slice(i + 1, e), line: at }); adv(e + 1); out[out.length - 1].eline = line; continue; }
    if (c === '`') {
      const tpl = { t: 's', v: '', line: at }, inner = [];
      let j = i + 1;
      for (; j < src.length && src[j] !== '`'; j++) {
        if (src[j] === '\\') { tpl.v += src.slice(j, j + 2); j++; }
        else if (src[j] === '$' && src[j + 1] === '{') {
          const e = exprEnd(j + 2), ln = at + (src.slice(i, j).match(/\n/g) || []).length;
          inner.push({ t: 'p', v: '{', tpl, line: ln }, ...tokenize(src.slice(j + 2, e), ln), { t: 'p', v: '}', line: ln });
          tpl.v += ' '; j = e;
        } else tpl.v += src[j];
      }
      out.push(...inner, tpl); adv(j + 1); tpl.eline = line; continue;
    }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, classe = false;
      for (; j < src.length && src[j] !== '\n'; j++) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') classe = true;
        else if (src[j] === ']') classe = false;
        else if (src[j] === '/' && !classe) break;
      }
      out.push({ t: 'x', v: 'regex', line: at }); adv(j + 1); continue;
    }
    const w = /^(?:([\p{L}_$][\p{L}\p{N}_$]*)|(\d[\w.]*))/u.exec(src.slice(i, i + 200));
    if (w) { out.push({ t: w[1] ? 'id' : 'n', v: w[0], line: at }); adv(i + w[0].length); continue; }
    out.push({ t: 'p', v: c, line: at }); adv(i + 1);
  }
  return out;
}

// --- the groups: every ( [ { with the strings directly inside it, so «the same call or array as 'git'» is a lookup ---
const TESTS = new Set(['test', 'it', 'describe', 'suite', 'only', 'skip', 'todo']);
const AMBITO = /^\s*[ÂA]MBITO:/i;
const HEX = /(?<![0-9A-Za-z_])(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![0-9A-Za-z_])/i; // a sha has digits and letters; «defaced» is not one
const DIFF_DE_NOMES = /\bgit\s+diff\b[\s\S]*--name-(?:only|status)/;

function grupos(toks) {
  const raiz = { strs: [], parent: null, from: 0, to: toks.length - 1 };
  const todos = [];
  let topo = raiz;
  toks.forEach((tk, idx) => {
    if (tk.t === 'p' && '([{'.includes(tk.v)) {
      const callee = toks[idx - 1]?.t === 'id' ? toks[idx - 1].v : null;
      const g = { strs: [], parent: topo, from: idx, to: toks.length - 1, open: tk.v, tpl: tk.tpl, git: /^git/i.test(callee), ambito: tk.v === '(' && TESTS.has(callee) && toks[idx + 1]?.t === 's' && AMBITO.test(toks[idx + 1].v) };
      todos.push(g); topo = g;
    } else if (tk.t === 'p' && ')]}'.includes(tk.v) && topo.parent) { topo.to = idx; topo = topo.parent; }
    else if (tk.t === 's') { topo.strs.push(tk.v); tk.group = topo; }
  });
  return { raiz, todos };
}
const dentroDeAmbito = (g) => { for (; g; g = g.parent) if (g.ambito) return true; return false; };
const chama = (toks, de, ate, nome) => toks.slice(de, ate + 1).some((tk, k, a) => tk.t === 'id' && tk.v === nome && a[k + 1]?.v === '(');
// The index after the expression that starts at `k`: a `;` or `,` at its own depth, a closing bracket of the outer group, or (no semicolon)
// a line break after a token that can end an expression, before one that starts a statement.
const NAO_COMECA = new Set(['in', 'of', 'instanceof']);
function fimDaExpressao(toks, k) {
  let d = 0;
  for (let m = k; m < toks.length; m++) {
    const tk = toks[m], n = toks[m + 1];
    if (tk.t === 'p' && '([{'.includes(tk.v)) d++;
    else if (tk.t === 'p' && ')]}'.includes(tk.v) && --d < 0) return m;
    else if (d === 0 && tk.t === 'p' && ';,'.includes(tk.v)) return m;
    const acaba = tk.t !== 'p' || ')]}'.includes(tk.v), comeca = n && (n.t === 'n' || n.t === 's' || (n.t === 'id' && !NAO_COMECA.has(n.v)));
    if (d === 0 && acaba && comeca && n.line > (tk.eline ?? tk.line)) return m + 1;
  }
  return toks.length;
}
// «a git call»: a `(` whose first argument is 'git' or whose callee is called git*(...) (a helper like gitR)
const chamadaGit = (toks, g) => g.open === '(' && (g.git || (toks[g.from + 1]?.t === 's' && toks[g.from + 1].v === 'git' && toks[g.from + 2]?.v === ','));
const COMANDO_GIT = /^\s*git\s/;
// Is a literal at group `g` an argument of git: in the argument list of a git call (through arrays and nested calls, never through a `{`
// block or object), or in the interpolation of a template that is a «git ...» command
function emGit(toks, g) {
  for (; g?.parent; g = g.parent) {
    if (g.tpl) { if (COMANDO_GIT.test(g.tpl.v)) return true; }
    else if (g.open === '{') return false;
    else if (chamadaGit(toks, g)) return true;
  }
  return false;
}

// The violations of one file: [{regra, linha, msg}]
export function lint(src) {
  const toks = tokenize(src);
  const { raiz, todos } = grupos(toks);
  const v = [];
  for (const g of todos) {
    if (g.ambito && !chama(toks, g.from, g.to, 'soNoTicket')) v.push({ regra: 'L2', linha: toks[g.from].line, msg: `teste «${toks[g.from + 1].v.slice(0, 50)}» sem soNoTicket(t, id)` });
  }
  const usaBase = chama(toks, 0, toks.length - 1, 'base');
  const diff = (g, linha) => { if (!usaBase && !dentroDeAmbito(g)) v.push({ regra: 'L3', linha, msg: 'git diff de nomes de ficheiros fora de um teste «ÂMBITO:» e sem base()' }); };
  // L1 case 1: a sha that is an argument of git. Case 2: any sha in the initializer of a base-named identifier (`BASE = env || 'sha'`, `base: 'sha'`)
  const sha = new Set();
  toks.forEach((tk, k) => {
    if (tk.t === 's' && HEX.test(tk.v) && (COMANDO_GIT.test(tk.v) || emGit(toks, tk.group))) sha.add(tk);
    if (tk.t === 'p' && (tk.v === '=' || tk.v === ':') && toks[k - 1]?.t === 'id' && /base/i.test(toks[k - 1].v) && !'=>'.includes(toks[k + 1]?.v ?? ' ')) {
      for (let m = k + 1, fim = fimDaExpressao(toks, k + 1); m < fim; m++) if (toks[m].t === 's' && HEX.test(toks[m].v)) sha.add(toks[m]);
    }
    if (tk.t === 's' && DIFF_DE_NOMES.test(tk.v)) diff(tk.group, tk.line);
  });
  for (const tk of sha) v.push({ regra: 'L1', linha: tk.line, msg: `sha «${HEX.exec(tk.v)[0]}» fixo em vez de base() (git merge-base HEAD origin/main)` });
  for (const g of [raiz, ...todos]) if (g.strs.includes('diff') && g.strs.some((s) => /^--name-(?:only|status)$/.test(s))) diff(g, toks.find((tk) => tk.group === g && tk.v === 'diff')?.line ?? 1);
  return v;
}

// --- the tree ---
const ficheiros = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
  ? (e.name === 'node_modules' ? [] : ficheiros(join(dir, e.name))) : (/\.(?:mjs|cjs|js)$/.test(e.name) ? [join(dir, e.name)] : [])));
const pastas = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
const lintPasta = (dir, prefixo) => ficheiros(dir).flatMap((f) => lint(readFileSync(f, 'utf8')).map((x) => ({ ...x, ficheiro: relative(dir, f).replaceAll('\\', '/'), texto: `${x.regra} ${prefixo}/${relative(dir, f).replaceAll('\\', '/')}:${x.linha}: ${x.msg}` })));

const lista = JSON.parse(readFileSync(LISTA, 'utf8'));
for (const k of ['legado', 'emCurso']) assert.ok(Array.isArray(lista[k]) && lista[k].every((p) => typeof p === 'string'), `${k}: a lista congelada tem de ser {legado: [...], emCurso: [...]}`);

test('lista congelada: cada pasta de legado ainda existe em tests/critico/', () => {
  const faltam = lista.legado.filter((p) => !existsSync(join(CRITICO, p)));
  assert.deepEqual(faltam, [], `pasta(s) em legado que já não existem em tests/critico/: ${faltam.join(', ')} (tire-as de scripts/guardas-legado.json)`);
});

for (const pasta of pastas(CRITICO).filter((p) => !lista.legado.includes(p) && !lista.emCurso.includes(p))) {
  test(`tests/critico/${pasta}: regras 8 e 9 (L1, L2, L3)`, () => {
    const falhas = lintPasta(join(CRITICO, pasta), `tests/critico/${pasta}`).map((x) => x.texto);
    assert.deepEqual(falhas, [], '\n' + falhas.join('\n'));
  });
}

// --- the corpus: scripts/corpus/guardas/<caso>/ has the .mjs files and an esperado.json, {regra, ficheiro} or {ok: true} ---
const casos = pastas(CORPUS);
test('corpus das guardas: pelo menos 5 casos maus (com L1, L2 e L3) e 4 limpos', () => {
  const esp = casos.map((c) => JSON.parse(readFileSync(join(CORPUS, c, 'esperado.json'), 'utf8')));
  assert.ok(esp.filter((e) => e.regra).length >= 5, 'menos de 5 casos maus');
  assert.ok(esp.filter((e) => e.ok === true).length >= 4, 'menos de 4 casos limpos');
  for (const r of ['L1', 'L2', 'L3']) assert.ok(esp.some((e) => e.regra === r), `nenhum caso mau de ${r}`);
});
for (const caso of casos) {
  test(`corpus das guardas › ${caso}`, () => {
    const esperado = JSON.parse(readFileSync(join(CORPUS, caso, 'esperado.json'), 'utf8'));
    const achados = lintPasta(join(CORPUS, caso), caso);
    if (esperado.ok === true) return assert.deepEqual(achados.map((x) => x.texto), [], 'falso positivo');
    assert.ok(achados.some((x) => x.regra === esperado.regra && x.ficheiro === esperado.ficheiro),
      `esperava ${esperado.regra} em ${esperado.ficheiro}; achou: ${achados.map((x) => x.texto).join(' | ') || 'nada'}`);
  });
}
