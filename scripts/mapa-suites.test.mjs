// Lint do mapa de suítes afetadas (V-02, #126; spec #123 §4.3). Lê o git, o manifesto e o texto das suítes; não corre nenhuma.
//   M1: todo o ficheiro de `git ls-files` casa com ≥ 1 regra do mapa.
//   M2: os nomes de suítes do mapa, do corpus e dos doLote existem no manifesto; nenhuma lista é vazia.
//   M3: se uma suíte (com os imports relativos dela, de forma transitiva) contém um literal de caminho do repo, todo o ficheiro rastreado sob
//       esse prefixo mapeia para essa suíte (por uma regra ou pela regra implícita) ou para "*". Literais que contam: os que começam por
//       scripts/, templates/, skills/, hooks/, tests/, .claude-plugin/, components.json, compat.json ou README, e join(ROOT, '<a>', '<b>').
//       shortcut: é um scanner de texto, não um parser; um caminho montado em runtime (pedaços, variáveis) não se vê.
//   M4: o corpus histórico de scripts/corpus/afetadas/*.json: as afetadas dos ficheiros de cada caso incluem os `devem_incluir`.
//   Mais: uma regra "*" que cobre ficheiros de uma suíte (os do manifesto ou tests/critico/<suíte>/) tem de trazer `motivo`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afetadas, casa, diretas, ficheirosDaSuite, lerMapa } from './afetadas.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CORPUS = 'scripts/corpus/afetadas';
const PREFIXOS = ['scripts/', 'templates/', 'skills/', 'hooks/', 'tests/', '.claude-plugin/', 'components.json', 'compat.json', 'README'];
const SOMENTE_PASTA = new Set(PREFIXOS.slice(0, 5)); // «scripts/» sozinho é só o nome da pasta, não um caminho lido

const lerJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const manifesto = lerJson('scripts/suites.json');
const nomes = manifesto.suites.map((s) => s.nome);
const rastreados = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split(/\r?\n/).filter(Boolean);
const falha = (erros) => { if (erros.length) assert.fail(erros.join('\n')); };
const pasta = (f) => (f.startsWith('tests/critico/') ? f.slice('tests/critico/'.length).split('/')[0] : null);

test('controlo: git ls-files devolve os ficheiros do pacote', () => {
  assert.ok(rastreados.length > 300 && rastreados.includes('scripts/suites.json'), `só ${rastreados.length} ficheiros rastreados`);
});

test('M1: todo o ficheiro de git ls-files casa com ≥ 1 regra do mapa', () => {
  const mapa = lerMapa(ROOT);
  falha(rastreados.filter((f) => !mapa.regras.some((r) => r.caminhos.some((g) => casa(f, g)))).map((f) => `ficheiro sem regra no mapa: ${f}`));
});

test('M2: as regras têm listas não vazias com suítes do manifesto (ou "*"), e cada "*" que cobre ficheiros de uma suíte tem `motivo`', () => {
  const mapa = lerMapa(ROOT), erros = [];
  mapa.regras.forEach((r, i) => {
    for (const s of r.suites) if (s !== '*' && !nomes.includes(s)) erros.push(`regra ${i} (${r.caminhos[0]}): a suíte ${s} não está no manifesto`);
    if (!r.suites.includes('*')) return;
    const daSuite = rastreados.filter((f) => nomes.includes(pasta(f)) || manifesto.suites.some((s) => (s.ficheiros ?? []).some((g) => casa(f, g))));
    const cobre = daSuite.filter((f) => r.caminhos.some((g) => casa(f, g)));
    if (cobre.length && !(typeof r.motivo === 'string' && r.motivo.trim())) erros.push(`regra ${i} ("*" em ${r.caminhos[0]}) cobre ficheiros de suítes (${cobre[0]}) e não tem \`motivo\``);
  });
  falha(erros);
});

// --- M3 ---
const literais = (texto) => {
  const out = new Set();
  for (const m of texto.matchAll(/'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g)) out.add(m[3] !== undefined ? m[3].split('${')[0] : m[1] ?? m[2]);
  for (const m of texto.matchAll(/\b(?:join|resolve)\(\s*[A-Za-z_$][\w$]*((?:\s*,\s*(?:'[^'\n]*'|"[^"\n]*"))+)/g)) {
    out.add([...m[1].matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((x) => x[1] ?? x[2]).join('/'));
  }
  return [...out].filter((s) => PREFIXOS.some((p) => s.startsWith(p)) && !SOMENTE_PASTA.has(s));
};
const sob = (f, l) => (l.endsWith('/') ? f.startsWith(l) : f === l || f.startsWith(`${l}/`) || (l.startsWith('README') && !l.includes('/') && f.startsWith(l)));

test('M3: todo o ficheiro sob um literal de caminho que uma suíte lê mapeia para essa suíte', () => {
  const { porque } = diretas(rastreados, ROOT);
  const mapeados = Object.fromEntries(Object.entries(porque).map(([s, es]) => [s, new Set(es.map((e) => e.ficheiro))]));
  const erros = [];
  for (const s of manifesto.suites) {
    const lidos = new Set(ficheirosDaSuite(ROOT, s).flatMap((f) => literais(readFileSync(join(ROOT, f), 'utf8'))));
    for (const l of [...lidos].sort()) {
      const falta = rastreados.find((f) => sob(f, l) && !mapeados[s.nome]?.has(f));
      if (falta) erros.push(`consumidor não declarado: ${s.nome} lê ${l} (${falta} não mapeia para ${s.nome})`);
    }
  }
  falha(erros);
});

// --- M4 ---
const casos = readdirSync(join(ROOT, CORPUS)).filter((n) => n.endsWith('.json')).sort().map((n) => ({ nome: n.replace(/\.json$/, ''), ...lerJson(`${CORPUS}/${n}`) }));

test('M4: o corpus histórico tem ≥ 3 casos com { commit, ficheiros, devem_incluir } e suítes do manifesto', () => {
  assert.ok(casos.length >= 3, `só ${casos.length} casos`);
  const erros = [];
  for (const { nome, ...c } of casos) {
    if (Object.keys(c).sort().join() !== 'commit,devem_incluir,ficheiros') erros.push(`${nome}: as chaves têm de ser commit, ficheiros e devem_incluir`);
    for (const k of ['ficheiros', 'devem_incluir']) if (!Array.isArray(c[k]) || !c[k].length) erros.push(`${nome}: ${k} vazio`);
    for (const s of c.devem_incluir ?? []) if (!nomes.includes(s)) erros.push(`${nome}: a suíte ${s} não está no manifesto`);
  }
  falha(erros);
});

for (const c of casos) {
  test(`M4: caso ${c.nome}: as afetadas dos ficheiros incluem ${c.devem_incluir.join(', ')}`, () => {
    const { suites } = afetadas(c.ficheiros, ROOT);
    assert.deepEqual(c.devem_incluir.filter((s) => !suites.includes(s)), [], `caso ${c.nome}: faltam suítes nas afetadas`);
  });
}

// --- executor --afetadas, num repo temporário com duas suítes: só a que o diff afeta corre ---
test('executor --afetadas: corre só as suítes do diff contra a base; um diff vazio é erro de uso', () => {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-exec-'));
  const tmp = join(d, '..', `${basename(d)}-tmp`); // as vagas globais vivem em os.tmpdir(): um tmp só deste teste não espera por outros executores
  mkdirSync(tmp);
  const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const sh = (cmd, ...a) => spawnSync(cmd, a, { cwd: d, encoding: 'utf8', env });
  const git = (...a) => { const r = sh('git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a); assert.equal(r.status, 0, r.stderr); };
  try {
    for (const f of ['executor.mjs', 'afetadas.mjs']) { mkdirSync(join(d, 'scripts'), { recursive: true }); copyFileSync(join(ROOT, 'scripts', f), join(d, 'scripts', f)); }
    const teste = "import { test } from 'node:test';\ntest('ok', () => {});\n";
    for (const [rel, texto] of Object.entries({
      'scripts/suites.json': JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 2, orcamento_s: 100, suites: ['a', 'b'].map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`tests/critico/${n}/*.test.mjs`], limite_s: 30 })) }),
      'scripts/mapa-suites.json': JSON.stringify({ versao: 1, regras: [{ caminhos: ['lib/**'], suites: ['a'] }] }),
      'tests/critico/a/a.test.mjs': teste, 'tests/critico/b/b.test.mjs': teste, 'lib/x.mjs': 'export const x = 1;\n',
    })) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); }
    git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'ramo');
    const vazio = sh(process.execPath, 'scripts/executor.mjs', '--afetadas', '--base', 'main');
    assert.equal(vazio.status, 2, vazio.stdout + vazio.stderr);
    assert.equal(sh(process.execPath, 'scripts/executor.mjs', '--afetadas', '--base', 'nao-existe').status, 2); // uma base que não existe não é «nada afetado»
    assert.equal(sh(process.execPath, 'scripts/afetadas.mjs', '--base', 'nao-existe').status, 2);
    writeFileSync(join(d, 'lib/x.mjs'), 'export const x = 2;\n'); git('commit', '-q', '-am', 'muda lib');
    const r = sh(process.execPath, 'scripts/executor.mjs', '--afetadas', '--base', 'main');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /afetadas: 1 suítes .*: a\n/);
    const res = JSON.parse(readFileSync(join(d, '.forge/resultados', readdirSync(join(d, '.forge/resultados')).find((n) => n.endsWith('.json'))), 'utf8'));
    assert.deepEqual(Object.keys(res.suites), ['a']);
  } finally { for (const x of [d, tmp]) rmSync(x, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

// --- afetadas() numa pasta temporária (o 2.º argumento é a raiz) ---
const pasta_ = (conteudos) => {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-'));
  for (const [rel, texto] of Object.entries(conteudos)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); }
  return d;
};
const manif = (...ns) => JSON.stringify({ versao: 1, suites: ns.map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`tests/critico/${n}/*.test.mjs`] })) });
const chamada = (alvo) => `import { ${'do' + 'Lote'} } from '../_comum/lote.mjs';\nawait ${'do' + 'Lote'}(t, '${alvo}');\n`;

test('afetadas(): regra do mapa, regra implícita, "*" e ficheiro sem regra (que vale todas as suítes)', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b', 'c'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1, regras: [{ caminhos: ['lib/**'], suites: ['b'] }, { caminhos: ['tudo.txt'], suites: ['*'] }] }),
  });
  try {
    const dos = (...fs) => afetadas(fs, d).suites.sort().join();
    assert.equal(dos('lib/x.mjs'), 'b');
    assert.equal(dos('tests/critico/c/x.test.mjs'), 'c');
    assert.equal(dos('lib/x.mjs', 'tests/critico/a/y.mjs'), 'a,b');
    assert.equal(dos('tudo.txt'), 'a,b,c');
    assert.equal(dos('ninguem-cobre.txt'), 'a,b,c');
    assert.deepEqual(afetadas(['ninguem-cobre.txt'], d).porque.a, [{ regra: 'sem regra', ficheiro: 'ninguem-cobre.txt' }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('afetadas(): uma regra com a lista de suítes ou de caminhos vazia é inválida', () => {
  for (const regra of [{ caminhos: ['lib/**'], suites: [] }, { caminhos: [], suites: ['a'] }]) {
    const d = pasta_({ 'scripts/suites.json': manif('a'), 'scripts/mapa-suites.json': JSON.stringify({ versao: 1, regras: [regra] }) });
    try { assert.throws(() => afetadas(['lib/x.mjs'], d), /vazia|sem caminhos/); } finally { rmSync(d, { recursive: true, force: true }); }
  }
});

test('afetadas(): o fecho do lote segue a cadeia A → B → C pelos imports relativos e não entra em ciclo', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b', 'c'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1, regras: [{ caminhos: ['lib/**'], suites: ['a'] }] }),
    'tests/critico/a/a.test.mjs': "import { ajuda } from './ajuda.mjs';\n",
    'tests/critico/a/ajuda.mjs': chamada('b'),
    'tests/critico/b/b.test.mjs': chamada('c'),
    'tests/critico/c/c.test.mjs': chamada('a'),
  });
  try {
    const r = afetadas(['lib/x.mjs'], d);
    assert.deepEqual(r.suites.sort(), ['a', 'b', 'c']);
    assert.deepEqual(r.porque.c, [{ regra: 'doLote:b', ficheiro: 'lib/x.mjs' }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
