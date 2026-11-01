// F-09: regressão e higiene («reprova sempre»). Nenhum ficheiro de teste do pacote perde testes (referência: 9f176c1), a suíte
// scripts/*.test.mjs continua verde, os ataques da Ronda −1 já fundidos continuam no repositório, e o que o ticket acrescenta ao
// pacote não leva caminhos da máquina, dados pessoais nem dependências fora da biblioteca padrão.
// Depende do F-08: quando o F-06, o F-07 e o F-08 entrarem na main, os ataques deles entram na lista FUNDIDOS e o BASELINE sobe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { ROOT, BASE, sandboxEnv, git } from './helpers.mjs';
import { doLote } from '../_comum/lote.mjs';

// Testes estáticos (`^test(`) por ficheiro em 9f176c1
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'mod-painel.test.mjs': 10, 'painel-web.test.mjs': 2, 'painel.test.mjs': 13, 'scaffold.test.mjs': 35, 'sem-claude-mem.test.mjs': 1, 'skill-new-project.test.mjs': 8, 'sync.test.mjs': 22 };
const PASS_BASE = 198; // node --test "scripts/*.test.mjs" em 9f176c1: 198 passam, 0 falham
const FUNDIDOS = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-04-r0', 'f-05-r0', 'f-10-r0', 'f-11-r0', 'f-12-r0'];
const runTests = (globs) => {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 500000 });
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

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os testes que passavam em 9f176c1', (t) => {
  const r = doLote(t, 'scripts', { corre: () => runTests(['scripts/*.test.mjs']) });
  if (!r) return;
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= PASS_BASE, 'passaram ' + r.pass);
});

// Os ataques já fundidos não correm aqui dentro (seriam corridos duas vezes por `node --test tests/critico/`, que o «Pronto quando»
// exige): este teste só garante que nenhum desaparece.
test('regressão: os ataques da Ronda −1 já fundidos continuam no repositório', () => {
  for (const d of FUNDIDOS) assert.ok(existsSync(join(ROOT, 'tests/critico', d)), d + ' desapareceu');
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
