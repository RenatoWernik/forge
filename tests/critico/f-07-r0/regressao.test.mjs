// F-07: regressão e higiene («reprova sempre»). A suíte do pacote continua verde, nenhum ficheiro de teste perde testes (referência:
// e083b6a), os ataques da Ronda −1 já fundidos (f-01, f-02, f-03, f-10) continuam verdes, e o que o ticket acrescenta ao pacote não
// leva caminhos da máquina, dados pessoais nem dependências fora da biblioteca padrão.
// Depende do F-06: não (quando o F-06 entrar, o f-06-r0 entra na lista dos ataques fundidos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { ROOT, BASE, sandboxEnv, git } from './helpers.mjs';

// Testes estáticos (`^test(`) por ficheiro em e083b6a; 139 testes passavam
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };
const runTests = (globs) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 500000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
const failures = (out) => out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500);

test('regressão: nenhum ficheiro de teste do pacote perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const file = join(ROOT, 'scripts', f);
    assert.ok(existsSync(file), f + ' desapareceu');
    const count = [...readFileSync(file, 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].length;
    assert.ok(count >= n, `${f}: ${count} testes, eram ${n}`);
  }
});

test('regressão: node --test "scripts/*.test.mjs" passa, com mais do que os 139 testes de e083b6a (entra o scripts/contrato.test.mjs)', () => {
  const r = runTests(['scripts/*.test.mjs']);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass > 139, 'passaram ' + r.pass);
});

// Os ataques já fundidos não correm aqui dentro (seriam corridos duas vezes por `node --test tests/critico/`, que o «Pronto quando»
// exige): este teste só garante que nenhum desaparece.
test('regressão: os ataques da Ronda −1 já fundidos (f-01, f-02, f-03, f-10) continuam no repositório', () => {
  for (const d of ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-10-r0']) assert.ok(existsSync(join(ROOT, 'tests/critico', d)), d + ' desapareceu');
});

const desde = () => { const m = git('merge-base', 'HEAD', 'origin/main'); return m.status === 0 ? m.stdout.trim() : BASE; };
// Linhas acrescentadas pelo ticket fora de tests/ (o diff, só as linhas +, e os ficheiros novos ainda por seguir)
const acrescentadas = () => {
  const out = [];
  const d = git('diff', '-U0', '--no-color', desde(), '--', '.', ':(exclude)tests');
  assert.equal(d.status, 0, d.stderr);
  let f;
  for (const l of d.stdout.split('\n')) {
    if (l.startsWith('+++ ')) f = l.slice(6);
    else if (l.startsWith('+') && f) out.push([f, l.slice(1)]);
  }
  const u = git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  for (const n of u.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) for (const l of readFileSync(join(ROOT, n), 'utf8').split(/\r?\n/)) out.push([n, l]);
  return out;
};

test('reprova sempre: o que o ticket acrescenta ao pacote não tem caminhos da máquina, ids de sessão, dados pessoais nem nada da Guilda', () => {
  const me = userInfo().username;
  const PROIBIDO = [/\b[A-Z]:\\\\?[A-Za-z]/, /\b[A-Z]:\/[A-Za-z]/, /\/Users\//, /\/home\/[a-z]/, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /guilda/i, /renat/i, /@keyrus\./i, /AgentHomes|dev-mods|forge-wt|forge-ref/i,
    ...(me && me.length >= 3 ? [new RegExp(`\\b${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')] : [])];
  const achados = [];
  for (const [f, l] of acrescentadas()) for (const re of PROIBIDO) if (re.test(l.replace(/(?:github(?:usercontent)?\.com\/(?:repos\/)?|(?<![\w\/.-]))RenatoWernik\/(?:gauntlet-loop|forge)(?![\w.-])/gi, ''))) achados.push(`${f}: ${re} → ${l.trim().slice(0, 100)}`);
  assert.deepEqual(achados, []);
});

test('só biblioteca padrão: os .mjs/.js/.cjs acrescentados ou alterados fora de tests/ só importam node: ou caminhos relativos', () => {
  const d = git('diff', '--name-only', '--diff-filter=AM', desde(), '--', '.', ':(exclude)tests');
  const u = git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  const files = [...new Set([...d.stdout.split('\n'), ...u.stdout.split('\n')].map((s) => s.trim()).filter(Boolean))].filter((x) => ['.mjs', '.js', '.cjs'].includes(extname(x)) && existsSync(join(ROOT, x)));
  const RE = [/\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  const fora = [];
  for (const f of files) { const src = readFileSync(join(ROOT, f), 'utf8'); for (const re of RE) for (const m of src.matchAll(re)) if (!m[1].startsWith('node:') && !m[1].startsWith('.')) fora.push(`${f}: ${m[1]}`); }
  assert.deepEqual(fora, []);
});
