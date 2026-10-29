// Corpus do forge (F-02, #3): o oráculo fechado dos invariantes do check.cjs. Só biblioteca padrão.
//   scripts/corpus/answers/<nome>.json    um conjunto de respostas de setup (o objeto que scaffold.mjs --answers aceita)
//   scripts/corpus/mutations/<nome>.json  { base, file, find, replace, line }: sobre o projeto gerado de `base`, troca `find` por `replace`
//                                         (texto literal, todas as ocorrências) em `file`; o check.cjs tem de falhar a linha `line`
// 1. Cada conjunto gera um projeto que passa o check.cjs («All ok.»). Os projetos em português passam pelo mesmo substituto de tradução do
//    scaffold.test.mjs: sem ele, um projeto acabado de gerar em português falha a linha `language`.
// 2. Cada mutação faz falhar a sua linha; uma que não falha é uma mutação sem verificação e o teste diz o nome dela.
// Tudo corre em pastas temporárias, com HOME falso: nada é escrito na árvore do pacote nem na configuração do utilizador.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, extname, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scaffold } from './scaffold.mjs';

const T0 = Date.now();
const BUDGET_MS = 300000;
const CORPUS = fileURLToPath(new URL('./corpus/', import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), 'forge-corpus-'));
const HOME = join(WORK, 'home');
const env = { ...process.env, HOME, USERPROFILE: HOME, CLAUDE_CONFIG_DIR: HOME };
after(() => rmSync(WORK, { recursive: true, force: true }));

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { throw new Error(`${relative(CORPUS, file)}: ${e.message}`); }
};
// <nome> -> conteúdo do <nome>.json; qualquer outro ficheiro na pasta é um erro, não é ignorado em silêncio
const load = (kind) => {
  const dir = join(CORPUS, kind);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const odd = names.filter((n) => extname(n) !== '.json');
  assert.deepEqual(odd, [], `${kind}/: só ficheiros .json`);
  return new Map(names.map((n) => [basename(n, '.json'), readJson(join(dir, n))]));
};
const answers = load('answers'), mutations = load('mutations');

// Mesmo substituto da tradução que o scaffold.test.mjs usa (o passo de tradução da skill new-project): cada linha de prosa vira uma frase portuguesa
const LINE_PT = 'Esta parte descreve o que o agente faz para cada peça, com o teste e a evidência que não podem faltar.';
const NATURAL = { '## Step 8': '## Etapa 8', '## 5. Checkpoint script': '## 5. Script do checkpoint', '## 1. Roles and models': '## 1. Funções e modelos' };
const translatePt = (text) => {
  let fence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*```/.test(l)) { fence = !fence; return l; }
    if (fence || !l.trim() || /^[|\s:-]+$/.test(l)) return l;
    if (l.startsWith('#')) return NATURAL[l] ?? l.replace(/^(#{2,} )(\d+\. )?.*$/, '$1$2Seção');
    return l.match(/^\s*(?:[-*] |\d+\. |> |\| )?/)[0] + LINE_PT + (l.includes('Verifies:') ? ' Verifica: ' : ' ') + (l.match(/`[^`]*`/g) ?? []).join(' ');
  }).join('\n');
};

let n = 0;
const build = async (set) => {
  const dest = join(WORK, 'p' + ++n);
  await scaffold(answers.get(set), { dest });
  const forge = readJson(join(dest, '.claude/forge.json'));
  const pending = readFileSync(join(dest, 'CLAUDE.md'), 'utf8').includes('PANEL-URL-PENDING'); // before the translation drops the bare URL
  if (/^pt/i.test(forge.langTag)) for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) writeFileSync(join(dest, rel), translatePt(readFileSync(join(dest, rel), 'utf8')));
  return { dest, forge, pending };
};
const check = (cwd) => { const r = spawnSync(process.execPath, ['.claude/check.cjs'], { cwd, encoding: 'utf8', env, timeout: 240000 }); return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };
// "ok" ou "FAIL" da linha `name` na saída do check: o nome exato, com ou sem o detalhe « (...)» que algumas linhas acrescentam ao falhar
const state = (out, name) => {
  for (const l of out.split(/\r?\n/)) {
    const m = l.match(/^(ok|FAIL) {2,4}(.*)$/);
    if (m && (m[2] === name || m[2].startsWith(name + ' ('))) return m[1];
  }
};

// Um projeto por conjunto, gerado e verificado uma só vez; as mutações reutilizam a saída para ver que a linha estava «ok» antes
const baselines = new Map();
const baseline = (set) => {
  if (!baselines.has(set)) baselines.set(set, build(set).then(({ dest, forge, pending }) => ({ forge, pending, ...check(dest) })));
  return baselines.get(set);
};

// Devolve o problema da mutação, ou null se ela faz falhar a sua linha como devia
async function verifyMutation(m) {
  if (!answers.has(m.base)) return `a base «${m.base}» não é um conjunto de respostas do corpus`;
  if (state((await baseline(m.base)).out, m.line) !== 'ok') return `a linha «${m.line}» não está «ok» no projeto sem mutação (nome inexato, ou já falhava)`;
  const { dest } = await build(m.base);
  const file = resolve(dest, m.file);
  if (!file.startsWith(dest + sep)) return `${m.file} está fora do projeto gerado`;
  if (!existsSync(file)) return `${m.file} não existe no projeto gerado`;
  const text = readFileSync(file, 'utf8');
  if (!text.includes(m.find)) return `o texto a procurar não existe em ${m.file}`;
  writeFileSync(file, text.replaceAll(m.find, m.replace));
  const post = check(dest);
  return state(post.out, m.line) === 'FAIL' && post.status === 1 ? null : `mutação sem verificação: depois dela a linha «${m.line}» não falhou`;
}

test('corpus: pelo menos 8 conjuntos de respostas e 5 mutações em 5 linhas distintas do check.cjs, todas com os campos preenchidos', () => {
  assert.ok(answers.size >= 8, 'conjuntos de respostas: ' + answers.size);
  assert.ok(mutations.size >= 5, 'mutações: ' + mutations.size);
  for (const [name, m] of mutations) {
    for (const k of ['base', 'file', 'find', 'replace', 'line']) assert.equal(typeof m[k], 'string', `${name}.${k}`);
    for (const k of ['base', 'file', 'find', 'line']) assert.ok(m[k], `${name}.${k} vazio`);
    assert.notEqual(m.find, m.replace, `${name}: find igual a replace`);
  }
  const lines = new Set([...mutations.values()].map((m) => m.line));
  assert.ok(lines.size >= 5, 'linhas distintas do check.cjs: ' + lines.size);
});

for (const name of answers.keys()) {
  test('respostas: ' + name + ' gera um projeto que passa o check.cjs com «All ok.»', async () => {
    const r = await baseline(name);
    assert.equal(r.status, 0, name + '\n' + r.out.split('\n').filter((l) => l.startsWith('FAIL')).join('\n'));
    assert.match(r.out, /All ok\./, name);
    assert.doesNotMatch(r.out, /^FAIL/m, name);
  });
}

test('respostas: as 8 combinações de língua, plainStyle e painel estão cobertas, lidas dos projetos gerados', async () => {
  const seen = new Set();
  for (const name of answers.keys()) {
    const { forge, pending } = await baseline(name);
    seen.add(`${/^pt/i.test(forge.langTag) ? 'pt' : /^en/i.test(forge.langTag) ? 'en' : forge.langTag}|plainStyle=${forge.plainStyle}|${pending ? 'pendente' : 'publicado'}`);
  }
  const want = ['en', 'pt'].flatMap((l) => [true, false].flatMap((p) => ['publicado', 'pendente'].map((u) => `${l}|plainStyle=${p}|${u}`)));
  assert.deepEqual(want.filter((w) => !seen.has(w)), [], 'combinações em falta (vistas: ' + [...seen].join(', ') + ')');
});

for (const [name, m] of mutations) {
  test(`mutação: ${name} faz falhar a linha «${m.line}»`, async () => {
    const problem = await verifyMutation(m);
    assert.equal(problem, null, `mutação «${name}»: ${problem}`);
  });
}

// Autoteste do critério 3: uma mutação inócua (um espaço num comentário) declarada como «tem de falhar» tem de ser apontada como sem verificação
test('autoteste: uma mutação inócua é apontada como mutação sem verificação, e um ficheiro fora do projeto é recusado', async () => {
  const [first] = mutations.values();
  assert.ok(first, 'corpus de mutações vazio');
  const inocua = { ...first, file: '.claude/check.cjs', find: '// Validates', replace: '//  Validates' };
  assert.match(String(await verifyMutation(inocua)), /mutação sem verificação/);
  assert.match(String(await verifyMutation({ ...first, file: '..' + sep + 'fora.txt' })), /fora do projeto/);
});

// Critério 5: nada fora de node: ou de um caminho relativo, no harness e nos ficheiros do corpus
const walk = (p) => (statSync(p).isFile() ? [p] : readdirSync(p).flatMap((x) => walk(join(p, x))));
const SPECIFIERS = [
  /\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
test('só biblioteca padrão: o harness e o corpus só importam node: ou caminhos relativos', () => {
  const sources = [fileURLToPath(import.meta.url), ...walk(CORPUS).filter((f) => ['.mjs', '.js', '.cjs'].includes(extname(f)))];
  const outside = sources.flatMap((f) => SPECIFIERS.flatMap((re) => [...readFileSync(f, 'utf8').matchAll(re)].map((x) => x[1])
    .filter((s) => !s.startsWith('node:') && !s.startsWith('.')).map((s) => `${basename(f)}: ${s}`)));
  assert.deepEqual(outside, []);
});

test('tempo: o corpus completo corre em 300 s ou menos', (t) => {
  const ms = Date.now() - T0;
  t.diagnostic(`tempo total do corpus: ${(ms / 1000).toFixed(1)} s (limite ${BUDGET_MS / 1000} s)`);
  assert.ok(ms <= BUDGET_MS, `o corpus demorou ${Math.round(ms / 1000)} s`);
});
