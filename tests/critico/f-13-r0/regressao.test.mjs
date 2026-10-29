// F-13: regressão e higiene. A suíte do pacote continua verde (com o novo scripts/hooks.test.mjs), nenhum ficheiro de teste existente
// perde testes, e o que o ticket acrescenta ao pacote não leva caminhos da máquina, dados pessoais, nada da Guilda, nem dependências
// fora da biblioteca padrão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, sandboxEnv, git } from './helpers.mjs';

// Testes estáticos (`^test(`) por ficheiro em e083b6a
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };

test('regressão: nenhum ficheiro de teste existente perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const names = [...readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)];
    assert.ok(names.length >= n, `${f}: ${names.length} testes, eram ${n}`);
  }
});

test('regressão: existe scripts/hooks.test.mjs, e node --test "scripts/*.test.mjs" passa com mais testes do que os 139 de e083b6a', () => {
  assert.ok(existsSync(join(ROOT, 'scripts/hooks.test.mjs')), 'falta scripts/hooks.test.mjs (verificação dos critérios 1 a 3)');
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/*.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 480000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') || out.slice(-3000));
  const pass = +(out.match(/^# pass (\d+)/m) || [])[1];
  assert.ok(pass > 139, 'passaram ' + pass);
});

// Ponto de partida do ticket: o merge-base com a origin/main (depois do merge da main, só fica o diff deste ticket); sem origin, e083b6a
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

test('reprova sempre: o que o ticket acrescenta ao pacote não tem caminhos da máquina, ids de sessão, dados pessoais nem nada da Guilda', () => {
  const PROIBIDO = [/\b[A-Z]:\\\\?[A-Za-z]/, /\/Users\//, /\/home\/[a-z]/, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /guilda/i, /renat/i, /@keyrus\./i, /AgentHomes|dev-mods/i];
  const achados = [];
  for (const [f, l] of acrescentadas()) for (const re of PROIBIDO) if (re.test(l)) achados.push(`${f}: ${re} → ${l.trim().slice(0, 100)}`);
  assert.deepEqual(achados, []);
});

test('só biblioteca padrão: os .mjs/.js/.cjs acrescentados ou alterados só importam node: ou caminhos relativos', () => {
  const RE = [/\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  const fora = [];
  for (const f of mudados().filter((x) => ['.mjs', '.js', '.cjs'].includes(extname(x)) && existsSync(join(ROOT, x)))) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const re of RE) for (const m of src.matchAll(re)) if (!m[1].startsWith('node:') && !m[1].startsWith('.')) fora.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(fora, []);
});
