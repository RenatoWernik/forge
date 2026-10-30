// F-14 critério 5 e «reprova sempre», bloco 2 de 2: higiene e manifestos. Um comando, uma suite (rápido).
//   - os ataques da Ronda −1 já fundidos nunca se apagam nem se enfraquecem: cada tests/critico/**/*.test.mjs da base 248ed1c existe e
//     não perde testes estáticos (correr todos é do tester: na base, o conjunto passa os 540 s);
//   - o que o ticket acrescenta fora de tests/ não traz caminhos da máquina, ids de sessão, dados pessoais nem nada da Guilda (o handle
//     público RenatoWernik dos links do repositório é a exceção que o README já declara);
//   - os .mjs/.js/.cjs acrescentados ou alterados fora de tests/ só importam node: ou caminhos relativos;
//   - as duas validações `claude plugin validate ... --strict` saem 0, com a config temporária (não é uma sessão: não chama modelos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { ROOT, BASE, git, sandboxEnv, readFileSync, existsSync } from './helpers.mjs';

const conta = (t) => [...t.matchAll(/^\s*test\((['"`])/gm)].length;
const lista = (r) => r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);

test('regressão: nenhum ataque da Ronda −1 já fundido (tests/critico da base) desaparece nem perde testes', () => {
  const ls = git('ls-tree', '-r', '--name-only', BASE, '--', 'tests/critico');
  assert.equal(ls.status, 0, ls.stderr);
  const ficheiros = lista(ls).filter((n) => n.endsWith('.test.mjs'));
  assert.ok(ficheiros.length >= 131, 'a base tem ' + ficheiros.length + ' ficheiros de ataque');
  const menos = [];
  for (const n of ficheiros) {
    const antes = conta(git('show', `${BASE}:${n}`).stdout), f = join(ROOT, n);
    const agora = existsSync(f) ? conta(readFileSync(f, 'utf8')) : -1;
    if (agora < antes) menos.push(`${n}: ${agora} testes, eram ${antes}`);
  }
  assert.deepEqual(menos, []);
});

const desde = () => { const m = git('merge-base', 'HEAD', 'origin/main'); return m.status === 0 ? m.stdout.trim() : BASE; };
const acrescentadas = () => {
  const out = [];
  const d = git('diff', '-U0', '--no-color', desde(), '--', '.', ':(exclude)tests');
  assert.equal(d.status, 0, d.stderr);
  let f;
  for (const l of d.stdout.split('\n')) {
    if (l.startsWith('+++ ')) f = l.slice(6);
    else if (l.startsWith('+') && f) out.push([f, l.slice(1)]);
  }
  for (const n of lista(git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests'))) for (const l of readFileSync(join(ROOT, n), 'utf8').split(/\r?\n/)) out.push([n, l]);
  return out;
};

test('reprova sempre: o que o ticket acrescenta ao pacote não tem caminhos da máquina, ids de sessão, dados pessoais nem nada da Guilda', () => {
  const me = userInfo().username;
  const PROIBIDO = [/\b[A-Z]:\\\\?[A-Za-z]/, /\b[A-Z]:\/[A-Za-z]/, /\/Users\//, /\/home\/[a-z]/, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /guilda/i, /renat/i, /@keyrus\./i, /AgentHomes|dev-mods|forge-wt|forge-ref|Ads_Claude/i,
    ...(me && me.length >= 3 ? [new RegExp(`\\b${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')] : [])];
  const achados = [];
  for (const [f, l0] of acrescentadas()) {
    const l = l0.replace(/RenatoWernik/g, '');
    for (const re of PROIBIDO) if (re.test(l)) achados.push(`${f}: ${re} → ${l0.trim().slice(0, 100)}`);
  }
  assert.deepEqual(achados, []);
});

test('só biblioteca padrão: os .mjs/.js/.cjs acrescentados ou alterados fora de tests/ só importam node: ou caminhos relativos', () => {
  const files = [...new Set([...lista(git('diff', '--name-only', '--diff-filter=AM', desde(), '--', '.', ':(exclude)tests')), ...lista(git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests'))])]
    .filter((x) => ['.mjs', '.js', '.cjs'].includes(extname(x)) && existsSync(join(ROOT, x)));
  const RE = [/\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  const fora = [];
  for (const f of files) { const src = readFileSync(join(ROOT, f), 'utf8'); for (const re of RE) for (const m of src.matchAll(re)) if (!m[1].startsWith('node:') && !m[1].startsWith('.')) fora.push(`${f}: ${m[1]}`); }
  assert.deepEqual(fora, []);
});

for (const alvo of ['.', '.claude-plugin/plugin.json']) {
  test(`critério 5: claude plugin validate ${alvo} --strict sai com 0 (config temporária)`, () => {
    const r = spawnSync('claude', ['plugin', 'validate', alvo, '--strict'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 180000, shell: process.platform === 'win32' });
    assert.equal(r.error, undefined, 'claude não correu: ' + r.error);
    assert.equal(r.status, 0, ((r.stdout || '') + (r.stderr || '')).slice(-3000));
  });
}
