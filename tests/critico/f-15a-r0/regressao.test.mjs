// F-15a: regressão e higiene. Nenhum ficheiro de teste existente perde testes; o teste «never pins» continua lá, com as mesmas
// regexes; o doctor continua a correr os executáveis sem shell; e o que o ticket acrescenta ao pacote não leva caminhos da
// máquina, ids de sessão, dados pessoais nem dependências fora da biblioteca padrão. (A suíte completa 2× corre no lote.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, COMPAT_TEST, personalHits } from './helpers.mjs';

// Testes estáticos (`^test(`) por ficheiro em 0a35bee
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'mod-painel.test.mjs': 10, 'painel-web.test.mjs': 2, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'skill-new-project.test.mjs': 8, 'sync.test.mjs': 22 };

test('regressão: nenhum ficheiro de teste existente perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const names = [...readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)];
    assert.ok(names.length >= n, `${f}: ${names.length} testes, eram ${n}`);
  }
});

test('regressão: existe scripts/compat.test.mjs (verificação do critério 1)', () => {
  assert.ok(existsSync(join(ROOT, COMPAT_TEST)), 'falta ' + COMPAT_TEST);
});

test('regressão: o teste «real registry: never pins a version» continua no doctor.test.mjs, com as duas regexes de hoje', () => {
  const src = readFileSync(join(ROOT, 'scripts/doctor.test.mjs'), 'utf8');
  const at = src.indexOf("test('real registry: never pins a version");
  assert.ok(at >= 0, 'o teste never pins desapareceu ou mudou de nome');
  const body = src.slice(at, src.indexOf('\n});', at));
  assert.ok(body.includes(String.raw`assert.ok(!/"version"\s*:/.test(JSON.stringify(real)));`), 'a regex do "version" mudou');
  assert.ok(body.includes(String.raw`(@v?[0-9]+[.][0-9]+|==[0-9]|--tag|\/download\/v[0-9])`), 'a regex dos pins nos comandos mudou');
});

test('reprova sempre (injeção): o doctor.mjs corre executáveis só com execFile, sem shell', () => {
  const src = readFileSync(join(ROOT, 'scripts/doctor.mjs'), 'utf8');
  const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()).filter(Boolean));
  assert.deepEqual(imports.filter((n) => n !== 'execFile'), [], 'o doctor importa outra coisa do child_process');
  assert.doesNotMatch(src, /\bshell\s*:/, 'o doctor passa a opção shell');
  assert.doesNotMatch(src, /require\(\s*['"](node:)?child_process['"]\s*\)|import\(\s*['"](node:)?child_process['"]\s*\)/, 'child_process carregado por outra via');
});

const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const desde = () => { const m = git('merge-base', 'HEAD', 'origin/main'); return m.status === 0 ? m.stdout.trim() : BASE; };
const mudados = () => {
  const d = git('diff', '--name-only', '--diff-filter=AM', desde(), '--', '.', ':(exclude)tests');
  assert.equal(d.status, 0, d.stderr);
  const u = git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  return [...new Set([...d.stdout.split('\n'), ...u.stdout.split('\n')].map((s) => s.trim()).filter(Boolean))];
};
const acrescentadas = () => {
  const out = [];
  const d = git('diff', '-U0', '--no-color', desde(), '--', '.', ':(exclude)tests');
  let f;
  for (const l of d.stdout.split('\n')) {
    if (l.startsWith('+++ ')) f = l.slice(6);
    else if (l.startsWith('+') && f) out.push([f, l.slice(1)]);
  }
  const u = git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  for (const n of u.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) for (const l of readFileSync(join(ROOT, n), 'utf8').split(/\r?\n/)) out.push([n, l]);
  return out;
};

test('reprova sempre: o que o ticket acrescenta ao pacote (compat.json, fixture, registo, doctor) não tem caminhos da máquina, dados pessoais, ids de sessão nem tokens', () => {
  const achados = [];
  for (const [f, l] of acrescentadas()) for (const h of personalHits(l)) achados.push(`${f}: ${h} → ${l.trim().slice(0, 100)}`);
  assert.deepEqual(achados, []);
});

test('só biblioteca padrão: os .mjs/.js/.cjs acrescentados ou alterados só importam módulos do Node ou caminhos relativos', () => {
  const RE = [/\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  const fora = [];
  for (const f of mudados().filter((x) => ['.mjs', '.js', '.cjs'].includes(extname(x)) && existsSync(join(ROOT, x)))) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const re of RE) for (const m of src.matchAll(re)) if (!m[1].startsWith('node:') && !m[1].startsWith('.') && !builtinModules.includes(m[1])) fora.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(fora, []);
});
