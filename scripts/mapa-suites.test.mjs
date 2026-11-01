// Lint do mapa de suítes afetadas (V-02, #126; spec #123 §4.3, com o MECANISMO FINAL da #126). Lê o git, o manifesto e o texto das suítes.
// As regras da seleção estão no código de scripts/afetadas.mjs; o scripts/mapa-suites.json só tem `sempre`, `foraDaLista` e os motivos, por isso
// nenhuma edição de dados reduz a seleção de um ficheiro de código. Aqui:
//   P1: todo o ficheiro de `git ls-files` fora de tests/critico dá TODAS as suítes do manifesto.
//   P2: toda a pasta de tests/critico/<x> do manifesto dá <x> e as `sempre`.
//   P3: o corpus histórico (scripts/corpus/afetadas/*.json) passa, e os últimos 40 commits (C6) dão as suítes cujos testes mudaram e as `sempre`.
//   P4: numa cópia temporária, retirar uma suíte de `sempre` ou acrescentar uma chave ao JSON (as antigas `regras`) faz o lint falhar com o nome.
//   Mais: o JSON só tem as chaves permitidas, `sempre` traz o mínimo aprovado e toda a pasta de tests/critico que lê o git está em `sempre` ou em
//   `foraDaLista`, com o motivo escrito.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afetadas, lerMapa } from './afetadas.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CORPUS = 'scripts/corpus/afetadas';
const PASTA = 'tests/critico/';
// o mínimo aprovado pelo orquestrador na #126 (as guardas por diff e varrimento); está aqui, e não em dados, para um JSON editado não o reduzir
const SEMPRE_MINIMO = ['f-01-r0', 'f-03-r0', 'f-04-r0', 'f-05-r0', 'f-06-r0', 'f-11-r0', 'f-14-r0', 'f-26-r0'];
const CHAVES = ['versao', 'sempre', 'foraDaLista'];

const lerJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const manifesto = lerJson('scripts/suites.json');
const nomes = manifesto.suites.map((s) => s.nome);
const gitEm = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const linhasDe = (r) => r.stdout.split(/\r?\n/).filter(Boolean);
const rastreados = linhasDe(gitEm(ROOT, 'ls-files'));
const falha = (erros) => { if (erros.length) assert.fail(erros.join('\n')); };
const pasta = (f) => (f.startsWith(PASTA) ? f.slice(PASTA.length).split('/')[0] : null);
const mapa = lerMapa(ROOT);
const sempre = Object.keys(mapa.sempre ?? {});
const ordenado = (xs) => [...xs].sort();
const suitesDe = (f) => ordenado(afetadas(f, { raiz: ROOT }).suites);
const naCopia = process.env.FORGE_MAPA_LINT_COPIA === '1'; // a P4 corre este lint numa cópia: lá não volta a copiar

test('controlo: git ls-files devolve os ficheiros do pacote', () => {
  assert.ok(rastreados.length > 300 && rastreados.includes('scripts/suites.json'), `só ${rastreados.length} ficheiros rastreados`);
});

test('mapa: só tem as chaves permitidas (versao, sempre, foraDaLista), `sempre` traz o mínimo aprovado e cada suíte tem o seu motivo', () => {
  const erros = [];
  for (const k of Object.keys(mapa)) if (!CHAVES.includes(k)) erros.push(`mapa-suites.json: a chave ${k} não é permitida (a seleção não se reduz por dados)`);
  for (const s of SEMPRE_MINIMO) if (!sempre.includes(s)) erros.push(`sempre perdeu a suíte ${s}`);
  for (const [k, lista] of [['sempre', mapa.sempre ?? {}], ['foraDaLista', mapa.foraDaLista ?? {}]]) {
    for (const [s, motivo] of Object.entries(lista)) {
      if (k === 'sempre' && !nomes.includes(s)) erros.push(`${k}: a suíte ${s} não está no manifesto`); // foraDaLista pode nomear uma pasta que o manifesto ainda não tem
      if (typeof motivo !== 'string' || !motivo.trim()) erros.push(`${k}.${s}: sem motivo`);
    }
  }
  for (const s of Object.keys(mapa.foraDaLista ?? {})) if (sempre.includes(s)) erros.push(`${s} está em sempre e em foraDaLista`);
  falha(erros);
});

test('mapa: toda a pasta de tests/critico que lê o git (diff, ls-files) está em `sempre` ou em `foraDaLista`', () => {
  const re = /git', *\['diff|diff --name-only|ls-files/;
  const pastas = new Set(rastreados.filter((f) => f.startsWith(PASTA) && re.test(readFileSync(join(ROOT, f), 'utf8'))).map(pasta));
  const lista = new Set([...sempre, ...Object.keys(mapa.foraDaLista ?? {})]);
  falha([...pastas].filter((p) => nomes.includes(p) && !lista.has(p)).map((p) => `tests/critico/${p} lê o git e não está em sempre nem em foraDaLista`));
});

// --- P1 e P2 ---
test('P1: todo o ficheiro de git ls-files fora de tests/critico dá exatamente TODAS as suítes do manifesto', () => {
  const fora = rastreados.filter((f) => !f.startsWith(PASTA));
  assert.ok(fora.length > 150, `controlo: só ${fora.length} ficheiros fora de tests/critico`);
  falha(fora.filter((f) => suitesDe([f]).join() !== ordenado(nomes).join()).map((f) => `${f} não dá todas as suítes`));
});

test('P2: toda a pasta de tests/critico/<x> do manifesto dá <x> e as `sempre`', () => {
  const erros = [];
  for (const n of nomes) {
    const f = rastreados.find((x) => x.startsWith(`${PASTA}${n}/`));
    if (!f) continue; // uma suíte sem pasta (do tipo comando)
    const s = suitesDe([f]);
    const faltam = [n, ...sempre].filter((x) => !s.includes(x));
    if (faltam.length) erros.push(`${f}: faltam ${faltam.join(', ')}`);
  }
  falha(erros);
});

// --- P3: o corpus e os últimos 40 commits ---
const casos = readdirSync(join(ROOT, CORPUS)).filter((n) => n.endsWith('.json')).sort().map((n) => ({ nome: n.replace(/\.json$/, ''), ...lerJson(`${CORPUS}/${n}`) }));

test('P3: o corpus histórico tem ≥ 3 casos com { commit, ficheiros, devem_incluir } e suítes do manifesto', () => {
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
  test(`P3: caso ${c.nome}: as afetadas dos ficheiros incluem ${c.devem_incluir.join(', ')}`, () => {
    const { suites } = afetadas(c.ficheiros, { raiz: ROOT });
    assert.deepEqual(c.devem_incluir.filter((s) => !suites.includes(s)), [], `caso ${c.nome}: faltam suítes nas afetadas`);
  });
}

test('P3 (C6): nos últimos 40 commits, as afetadas incluem as suítes cujos testes mudaram e as `sempre`', (t) => {
  const shas = linhasDe(gitEm(ROOT, 'log', '--format=%H', '-n', '40'));
  const erros = [];
  let vistos = 0;
  for (const sha of shas) {
    const d = gitEm(ROOT, 'diff', '--name-only', '--no-renames', '-z', `${sha}^`, sha);
    if (d.status !== 0) continue; // o commit raiz (ou um clone raso) não tem pai
    vistos++;
    const fs_ = d.stdout.split('\0').filter(Boolean);
    const dosTestes = nomes.filter((n) => fs_.some((f) => pasta(f) === n || manifesto.suites.find((s) => s.nome === n).ficheiros.some((g) => posix.matchesGlob(f, g))));
    const { suites } = afetadas(fs_, { raiz: ROOT });
    const faltam = [...dosTestes, ...sempre].filter((s) => !suites.includes(s));
    if (faltam.length) erros.push(`${sha.slice(0, 7)}: faltam ${[...new Set(faltam)].join(', ')}`);
  }
  if (vistos < 2) return t.skip('sem histórico (clone raso)');
  falha(erros);
});

// --- P4: editar o mapa não reduz a seleção, e o lint dá por isso ---
function copiaDoRepo() {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-copia-'));
  for (const f of rastreados) { mkdirSync(dirname(join(d, f)), { recursive: true }); copyFileSync(join(ROOT, f), join(d, f)); }
  for (const a of [['init', '-q', '-b', 'main'], ['config', 'core.autocrlf', 'false'], ['add', '-A'], ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'copia']]) assert.equal(gitEm(d, ...a).status, 0);
  return d;
}
const lintEm = (d) => {
  const env = { ...process.env, FORGE_MAPA_LINT_COPIA: '1' };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', 'scripts/mapa-suites.test.mjs'], { cwd: d, encoding: 'utf8', env, timeout: 240000, maxBuffer: 1 << 26 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const edita = (d, f) => { const p = join(d, 'scripts/mapa-suites.json'), m = JSON.parse(readFileSync(p, 'utf8')); f(m); writeFileSync(p, JSON.stringify(m, null, 2)); };

for (const [titulo, muda, nome] of [
  ['retirar uma suíte de `sempre`', (m) => { delete m.sempre['f-01-r0']; }, 'sempre perdeu a suíte f-01-r0'],
  ['acrescentar uma regra que reduz a seleção de scripts/corpus/answers/**', (m) => { m.regras = [{ caminhos: ['scripts/corpus/answers/**'], suites: ['f-26-r0'] }]; }, 'a chave regras não é permitida'],
]) {
  test(`P4: numa cópia, ${titulo} faz o lint falhar com o nome, e a seleção de um ficheiro de código não encolhe`, { skip: naCopia && 'já numa cópia da P4' }, () => {
    const d = copiaDoRepo();
    try {
      edita(d, muda);
      const r = lintEm(d);
      assert.notEqual(r.status, 0, 'o lint passou com o mapa editado:\n' + r.out.slice(-1500));
      assert.ok(r.out.includes(nome), `o lint não diz «${nome}»:\n` + r.out.slice(-1500));
      assert.deepEqual(ordenado(afetadas(['scripts/corpus/answers/x.json'], { raiz: d }).suites), ordenado(nomes));
    } finally { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  });
}

// --- executor --afetadas, num repo temporário com duas suítes: só a que o diff afeta corre ---
test('executor --afetadas: corre só as suítes do diff contra a base; sem nenhuma suíte afetada é erro de uso', () => {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-exec-'));
  const tmp = join(d, '..', `${basename(d)}-tmp`); // as vagas globais vivem em os.tmpdir(): um tmp só deste teste não espera por outros executores
  mkdirSync(tmp);
  const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  const sh = (cmd, ...a) => spawnSync(cmd, a, { cwd: d, encoding: 'utf8', env });
  const git = (...a) => { const r = sh('git', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a); assert.equal(r.status, 0, r.stderr); };
  try {
    for (const f of ['executor.mjs', 'afetadas.mjs']) { mkdirSync(join(d, 'scripts'), { recursive: true }); copyFileSync(join(ROOT, 'scripts', f), join(d, 'scripts', f)); }
    const teste = (t) => `import { test } from 'node:test';\ntest('${t}', () => {});\n`;
    for (const [rel, texto] of Object.entries({
      'scripts/suites.json': JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 2, orcamento_s: 100, suites: ['a', 'b'].map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`tests/critico/${n}/*.test.mjs`], limite_s: 30 })) }),
      'scripts/mapa-suites.json': JSON.stringify({ versao: 1 }),
      'tests/critico/a/a.test.mjs': teste('a'), 'tests/critico/b/b.test.mjs': teste('b'), 'lib/x.mjs': 'export const x = 1;\n',
    })) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); }
    git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'ramo');
    const vazio = sh(process.execPath, 'scripts/executor.mjs', '--afetadas', '--base', 'main');
    assert.equal(vazio.status, 2, vazio.stdout + vazio.stderr);
    assert.equal(sh(process.execPath, 'scripts/executor.mjs', '--afetadas', '--base', 'nao-existe').status, 2); // uma base que não existe não é «nada afetado»
    assert.equal(sh(process.execPath, 'scripts/afetadas.mjs', '--base', 'nao-existe').status, 2);
    writeFileSync(join(d, 'tests/critico/a/a.test.mjs'), teste('a muda')); git('commit', '-q', '-am', 'muda o teste de a');
    const r = sh(process.execPath, 'scripts/executor.mjs', '--afetadas', '--base', 'main');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /afetadas: 1 suítes .*: a\n/);
    const res = JSON.parse(readFileSync(join(d, '.forge/resultados', readdirSync(join(d, '.forge/resultados')).find((n) => n.endsWith('.json'))), 'utf8'));
    assert.deepEqual(Object.keys(res.suites), ['a']);
  } finally { for (const x of [d, tmp]) rmSync(x, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

// --- afetadas() numa pasta temporária (o 2.º argumento é { raiz }) ---
const pasta_ = (conteudos) => {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-'));
  for (const [rel, texto] of Object.entries(conteudos)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); }
  return d;
};
const manif = (...ns) => JSON.stringify({ versao: 1, suites: ns.map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`tests/critico/${n}/*.test.mjs`] })) });
const chamada = (alvo) => `import { ${'do' + 'Lote'} } from '../_comum/lote.mjs';\nawait ${'do' + 'Lote'}(t, '${alvo}');\n`;

test('afetadas(): as quatro regras — diff vazio, só testes, qualquer outro ficheiro (mesmo com a chave `regras` antiga) e pasta fora do manifesto', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b', 'c'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1, sempre: { c: 'sempre' }, regras: [{ caminhos: ['lib/**'], suites: ['b'] }] }),
  });
  try {
    const dos = (...fs) => afetadas(fs, { raiz: d }).suites.sort().join();
    assert.equal(dos(), 'c');
    assert.equal(dos('tests/critico/a/y.mjs'), 'a,c');
    assert.equal(dos('tests/critico/a/y.mjs', 'tests/critico/b/z.mjs'), 'a,b,c');
    assert.equal(dos('lib/x.mjs'), 'a,b,c');
    assert.equal(dos('README.md'), 'a,b,c');
    assert.equal(dos('tests/critico/a/y.mjs', 'README.md'), 'a,b,c');
    assert.equal(dos('tests/critico/_comum/h.mjs'), 'a,b,c');
    assert.equal(dos('tests/critico/nova/a.test.mjs'), 'a,b,c');
    assert.deepEqual(afetadas(['README.md'], { raiz: d }).porque.a, [{ regra: 'fora de tests/critico', ficheiro: 'README.md' }]);
    assert.equal(afetadas(['tests/critico/a/y.mjs'], { raiz: d }).porque.c.at(-1).regra, 'sempre');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('afetadas(ficheiros, { raiz }): o mesmo diff dá o resultado do mapa de cada raiz, e sem raiz vale o mapa deste repo', () => {
  const com = (s) => pasta_({ 'scripts/suites.json': manif('a', 'b'), 'scripts/mapa-suites.json': JSON.stringify({ versao: 1, sempre: { [s]: 'sempre' } }) });
  const [da, db] = [com('a'), com('b')];
  try {
    assert.deepEqual(afetadas([], { raiz: da }).suites, ['a']);
    assert.deepEqual(afetadas([], { raiz: db }).suites, ['b']);
    assert.deepEqual(ordenado(afetadas(['README.md']).suites), ordenado(afetadas(['README.md'], { raiz: ROOT }).suites));
    assert.deepEqual(ordenado(afetadas([]).suites), ordenado(sempre), 'sem raiz tem de valer o mapa do repo do módulo');
  } finally { for (const x of [da, db]) rmSync(x, { recursive: true, force: true }); }
});

test('afetadas(): um `sempre` com uma suíte desconhecida, ou um mapa que não é v1, é inválido', () => {
  for (const mapa_ of [{ versao: 1, sempre: { zz: 'x' } }, { versao: 2 }, { versao: 1, sempre: ['a'] }]) {
    const d = pasta_({ 'scripts/suites.json': manif('a'), 'scripts/mapa-suites.json': JSON.stringify(mapa_) });
    try { assert.throws(() => afetadas(['tests/critico/a/x.mjs'], { raiz: d }), /sempre|versao/); } finally { rmSync(d, { recursive: true, force: true }); }
  }
});

test('afetadas(): o fecho do lote segue a cadeia A → B → C pelos imports relativos e não entra em ciclo', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b', 'c'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1 }),
    'tests/critico/a/a.test.mjs': "import { ajuda } from './ajuda.mjs';\n",
    'tests/critico/a/ajuda.mjs': chamada('b'),
    'tests/critico/b/b.test.mjs': chamada('c'),
    'tests/critico/c/c.test.mjs': chamada('a'),
  });
  try {
    const r = afetadas(['tests/critico/a/a.test.mjs'], { raiz: d });
    assert.deepEqual(r.suites.sort(), ['a', 'b', 'c']);
    assert.deepEqual(r.porque.c, [{ regra: 'doLote:b', ficheiro: 'tests/critico/a/a.test.mjs' }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('afetadas(): os imports entre pastas levam a suíte que importa (helpers e golden de outra suíte)', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1 }),
    'tests/critico/a/h.mjs': 'export const x = 1;\n',
    'tests/critico/b/b.test.mjs': "import { x } from '../a/h.mjs';\n",
  });
  try {
    const r = afetadas(['tests/critico/a/golden/g.txt'], { raiz: d });
    assert.deepEqual(r.suites.sort(), ['a', 'b']);
    assert.equal(r.porque.b[0].regra, 'importa tests/critico/a/');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
