// Lint do mapa de suítes afetadas (V-02, #126; spec #123 §4.3, com o REDESENHO conservador da #126). Lê o git, o manifesto e o texto das
// suítes; não corre nenhuma.
//   M1: todo o ficheiro de `git ls-files` casa com ≥ 1 regra do mapa.
//   M2: as listas não são vazias, os nomes de suítes existem no manifesto, uma regra "*" que cobre ficheiros de uma suíte tem `motivo`, e
//       toda a pasta de tests/critico que lê o git (diff, ls-files) está em `sempre` ou em `foraDaLista`, com o motivo escrito.
//   M4: o corpus histórico de scripts/corpus/afetadas/*.json: as afetadas dos ficheiros de cada caso incluem os `devem_incluir`, e retirar do
//       mapa a regra que o cobre faz o caso falhar.
//   C6: para os últimos 40 commits, as afetadas incluem as suítes cujos testes mudaram e as `sempre`.
//   O M3 (um scanner de literais de caminho) saiu: nunca vê `new URL('./x/', import.meta.url)` nem `join(raiz, pasta)`, e um falso negativo
//   custa mais do que as suítes a mais. Código e templates levam todas as suítes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afetadas, casa, lerMapa } from './afetadas.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CORPUS = 'scripts/corpus/afetadas';
const PASTA = 'tests/critico/';

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

test('controlo: git ls-files devolve os ficheiros do pacote', () => {
  assert.ok(rastreados.length > 300 && rastreados.includes('scripts/suites.json'), `só ${rastreados.length} ficheiros rastreados`);
});

test('M1: todo o ficheiro de git ls-files casa com ≥ 1 regra do mapa', () => {
  falha(rastreados.filter((f) => !mapa.regras.some((r) => r.caminhos.some((g) => casa(f, g)))).map((f) => `ficheiro sem regra no mapa: ${f}`));
});

test('M2: as regras têm listas não vazias com suítes do manifesto (ou "*"), e cada "*" que cobre ficheiros de uma suíte tem `motivo`', () => {
  const erros = [];
  mapa.regras.forEach((r, i) => {
    for (const s of r.suites) if (s !== '*' && !nomes.includes(s)) erros.push(`regra ${i} (${r.caminhos[0]}): a suíte ${s} não está no manifesto`);
    if (!r.suites.includes('*')) {
      const faltam = sempre.filter((s) => !r.suites.includes(s));
      if (faltam.length) erros.push(`regra ${i} (${r.caminhos[0]}): falta(m) a(s) suíte(s) sempre ${faltam.join(', ')}`);
      return;
    }
    const daSuite = rastreados.filter((f) => nomes.includes(pasta(f)) || manifesto.suites.some((s) => (s.ficheiros ?? []).some((g) => casa(f, g))));
    const cobre = daSuite.filter((f) => r.caminhos.some((g) => casa(f, g)));
    if (cobre.length && !(typeof r.motivo === 'string' && r.motivo.trim())) erros.push(`regra ${i} ("*" em ${r.caminhos[0]}) cobre ficheiros de suítes (${cobre[0]}) e não tem \`motivo\``);
  });
  falha(erros);
});

test('M2: cada suíte de `sempre` (do manifesto) e de `foraDaLista` tem o seu motivo, e nenhuma está nas duas', () => {
  const erros = [];
  for (const [k, lista] of [['sempre', mapa.sempre ?? {}], ['foraDaLista', mapa.foraDaLista ?? {}]]) {
    for (const [s, motivo] of Object.entries(lista)) {
      if (k === 'sempre' && !nomes.includes(s)) erros.push(`${k}: a suíte ${s} não está no manifesto`); // foraDaLista pode nomear uma pasta que o manifesto ainda não tem
      if (typeof motivo !== 'string' || !motivo.trim()) erros.push(`${k}.${s}: sem motivo`);
    }
  }
  for (const s of Object.keys(mapa.foraDaLista ?? {})) if (sempre.includes(s)) erros.push(`${s} está em sempre e em foraDaLista`);
  if (!sempre.length) erros.push('sempre está vazio: um diff vazio não teria nenhuma suíte');
  falha(erros);
});

test('M2: toda a pasta de tests/critico que lê o git (diff, ls-files) está em `sempre` ou em `foraDaLista`', () => {
  const re = /git', *\['diff|diff --name-only|ls-files/;
  const pastas = new Set(rastreados.filter((f) => f.startsWith(PASTA) && re.test(readFileSync(join(ROOT, f), 'utf8'))).map(pasta));
  const lista = new Set([...sempre, ...Object.keys(mapa.foraDaLista ?? {})]);
  falha([...pastas].filter((p) => nomes.includes(p) && !lista.has(p)).map((p) => `tests/critico/${p} lê o git e não está em sempre nem em foraDaLista`));
});

// --- M4 e as provas negativas ---
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

// numa raiz temporária com o manifesto e um mapa onde as regras (e o `sempre`) que cobrem o caso perdem as suítes de devem_incluir
function semARegra(c) {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-neg-'));
  try {
    const fora = new Set(c.devem_incluir), outra = nomes.find((n) => !fora.has(n));
    const m = structuredClone(mapa);
    for (const r of m.regras) {
      if (!c.ficheiros.some((f) => r.caminhos.some((g) => casa(f, g)))) continue;
      r.suites = r.suites.flatMap((s) => (s === '*' ? nomes : [s])).filter((s) => !fora.has(s));
      if (!r.suites.length) r.suites = [outra];
    }
    m.sempre = Object.fromEntries(Object.entries(m.sempre ?? {}).filter(([s]) => !fora.has(s)));
    mkdirSync(join(d, 'scripts'));
    writeFileSync(join(d, 'scripts/suites.json'), JSON.stringify(manifesto));
    writeFileSync(join(d, 'scripts/mapa-suites.json'), JSON.stringify(m));
    return afetadas(c.ficheiros, { raiz: d });
  } finally { rmSync(d, { recursive: true, force: true }); }
}

for (const c of casos) {
  test(`M4: caso ${c.nome}: as afetadas dos ficheiros incluem ${c.devem_incluir.join(', ')}`, () => {
    const { suites } = afetadas(c.ficheiros, { raiz: ROOT });
    assert.deepEqual(c.devem_incluir.filter((s) => !suites.includes(s)), [], `caso ${c.nome}: faltam suítes nas afetadas`);
  });
  test(`M4: caso ${c.nome}: prova negativa — sem a regra que o cobre, o caso falha`, () => {
    const { suites, porque } = afetadas(c.ficheiros, { raiz: ROOT });
    // o que também vem da regra implícita (ou dos imports entre pastas) não depende do mapa: não há regra para retirar
    const doMapa = c.devem_incluir.filter((s) => suites.includes(s) && !porque[s].some((e) => e.regra === 'implícita' || e.regra.startsWith('importa ')));
    if (!doMapa.length) return;
    const sem = semARegra(c).suites;
    assert.ok(doMapa.some((s) => !sem.includes(s)), `caso ${c.nome}: retirar a regra que o cobre não fez falhar o caso (afetadas sem ela: ${sem.join(', ')})`);
  });
}

// --- C6: por propriedade, sobre os últimos 40 commits ---
test('C6: nos últimos 40 commits, as afetadas incluem as suítes cujos testes mudaram e as `sempre`', (t) => {
  const shas = linhasDe(gitEm(ROOT, 'log', '--format=%H', '-n', '40'));
  const erros = [];
  let vistos = 0;
  for (const sha of shas) {
    const d = gitEm(ROOT, 'diff', '--name-only', '--no-renames', '-z', `${sha}^`, sha);
    if (d.status !== 0) continue; // o commit raiz (ou um clone raso) não tem pai
    vistos++;
    const fs_ = d.stdout.split('\0').filter(Boolean);
    const dosTestes = nomes.filter((n) => fs_.some((f) => pasta(f) === n || manifesto.suites.find((s) => s.nome === n).ficheiros.some((g) => casa(f, g))));
    const { suites } = afetadas(fs_, { raiz: ROOT });
    const faltam = [...dosTestes, ...sempre].filter((s) => !suites.includes(s));
    if (faltam.length) erros.push(`${sha.slice(0, 7)}: faltam ${[...new Set(faltam)].join(', ')}`);
  }
  if (vistos < 2) return t.skip('sem histórico (clone raso)');
  falha(erros);
});

// --- afetadas() com o mapa real: as cinco regras do redesenho ---
test('afetadas(): só documentos e o diff vazio dão exatamente as `sempre`', () => {
  for (const fs_ of [[], ['README.md'], ['README.pt-BR.md', 'CHANGELOG.md'], ['docs/x.md'], ['LICENSE']]) {
    assert.deepEqual(ordenado(afetadas(fs_).suites), ordenado(sempre), fs_.join(', ') || 'diff vazio');
  }
});

test('afetadas(): código e templates levam TODAS as suítes, mesmo um .md dentro de templates/ ou skills/', () => {
  for (const f of ['scripts/doctor.mjs', 'scripts/corpus/mutations/agents-md-por-traduzir-em-pt.json', 'scripts/corpus/learnings/invalid/zz.md', 'templates/.claude/briefs/dev.md',
    'templates/CLAUDE.md', 'skills/learn/SKILL.md', 'hooks/hooks.json', 'components.json', '.gitignore', 'tests/ponte/f-12.mjs', 'tests/critico/_comum/base.mjs']) {
    assert.deepEqual(ordenado(afetadas([f]).suites), ordenado(nomes), f);
  }
});

test('afetadas(): um diff só em testes dá a pasta, quem a importa, as `sempre` e nada mais; uma pasta fora do manifesto dá tudo', () => {
  const s = afetadas(['tests/critico/f-02-r0/c3-sem-verificacao.test.mjs']).suites;
  assert.ok(s.includes('f-02-r0') && sempre.every((x) => s.includes(x)), s.join(', '));
  assert.ok(s.length < nomes.length / 2, `um teste de uma pasta não devia levar ${s.length} suítes`);
  assert.deepEqual(ordenado(afetadas(['tests/critico/zz-nova/a.test.mjs']).suites), ordenado(nomes));
  // os helpers e os golden importados por outra suíte levam essa suíte (os repros da R1)
  assert.ok(afetadas(['tests/critico/f-20c-r0/golden/darwin.plist']).suites.includes('f-20c-r1'));
  assert.ok(afetadas(['tests/critico/f-24-r0/golden/c5.txt']).suites.includes('f-24-r1'));
});

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

// --- afetadas() numa pasta temporária (o 2.º argumento é { raiz }) ---
const pasta_ = (conteudos) => {
  const d = mkdtempSync(join(tmpdir(), 'mapa-suites-'));
  for (const [rel, texto] of Object.entries(conteudos)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), texto); }
  return d;
};
const manif = (...ns) => JSON.stringify({ versao: 1, suites: ns.map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`tests/critico/${n}/*.test.mjs`] })) });
const chamada = (alvo) => `import { ${'do' + 'Lote'} } from '../_comum/lote.mjs';\nawait ${'do' + 'Lote'}(t, '${alvo}');\n`;

test('afetadas(): regra do mapa, regra implícita, "*", `sempre` e ficheiro sem regra (que vale todas as suítes)', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b', 'c'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1, sempre: { c: 'sempre' }, regras: [{ caminhos: ['lib/**'], suites: ['b'] }, { caminhos: ['tudo.txt'], suites: ['*'] }] }),
  });
  try {
    const dos = (...fs) => afetadas(fs, { raiz: d }).suites.sort().join();
    assert.equal(dos('lib/x.mjs'), 'b,c');
    assert.equal(dos('tests/critico/a/y.mjs'), 'a,c');
    assert.equal(dos(), 'c');
    assert.equal(dos('tudo.txt'), 'a,b,c');
    assert.equal(dos('ninguem-cobre.txt'), 'a,b,c');
    assert.deepEqual(afetadas(['ninguem-cobre.txt'], { raiz: d }).porque.a, [{ regra: 'sem regra', ficheiro: 'ninguem-cobre.txt' }]);
    assert.equal(afetadas(['lib/x.mjs'], { raiz: d }).porque.c.at(-1).regra, 'sempre');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('afetadas(ficheiros, { raiz }): o mesmo ficheiro dá o resultado do mapa de cada raiz, e sem raiz vale o mapa deste repo', () => {
  const com = (suite) => pasta_({
    'scripts/suites.json': manif('a', 'b'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1, regras: [{ caminhos: ['lib/**'], suites: [suite] }] }),
  });
  const [da, db] = [com('a'), com('b')];
  try {
    assert.deepEqual(afetadas(['lib/x.mjs'], { raiz: da }).suites, ['a']);
    assert.deepEqual(afetadas(['lib/x.mjs'], { raiz: db }).suites, ['b']);
    assert.deepEqual(ordenado(afetadas(['README.md']).suites), ordenado(afetadas(['README.md'], { raiz: ROOT }).suites));
    assert.ok(afetadas(['README.md']).suites.includes('f-01-r0'), 'sem raiz tem de valer o mapa do repo do módulo');
  } finally { for (const x of [da, db]) rmSync(x, { recursive: true, force: true }); }
});

test('afetadas(): uma regra com a lista de suítes ou de caminhos vazia, ou um `sempre` com uma suíte desconhecida, é inválida', () => {
  for (const mapa_ of [{ regras: [{ caminhos: ['lib/**'], suites: [] }] }, { regras: [{ caminhos: [], suites: ['a'] }] }, { sempre: { zz: 'x' }, regras: [{ caminhos: ['lib/**'], suites: ['a'] }] }]) {
    const d = pasta_({ 'scripts/suites.json': manif('a'), 'scripts/mapa-suites.json': JSON.stringify({ versao: 1, ...mapa_ }) });
    try { assert.throws(() => afetadas(['lib/x.mjs'], { raiz: d }), /vazia|sem caminhos|sempre/); } finally { rmSync(d, { recursive: true, force: true }); }
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
    const r = afetadas(['lib/x.mjs'], { raiz: d });
    assert.deepEqual(r.suites.sort(), ['a', 'b', 'c']);
    assert.deepEqual(r.porque.c, [{ regra: 'doLote:b', ficheiro: 'lib/x.mjs' }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('afetadas(): os imports entre pastas levam a suíte que importa (helpers e golden de outra suíte)', () => {
  const d = pasta_({
    'scripts/suites.json': manif('a', 'b'),
    'scripts/mapa-suites.json': JSON.stringify({ versao: 1, regras: [{ caminhos: ['tests/critico/**'], suites: ['a'] }] }),
    'tests/critico/a/h.mjs': 'export const x = 1;\n',
    'tests/critico/b/b.test.mjs': "import { x } from '../a/h.mjs';\n",
  });
  try {
    const r = afetadas(['tests/critico/a/golden/g.txt'], { raiz: d });
    assert.deepEqual(r.suites.sort(), ['a', 'b']);
    assert.equal(r.porque.b[0].regra, 'importa tests/critico/a/');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
