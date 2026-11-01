// F-11: regressão e higiene. A suíte do pacote continua verde (com o novo scripts/mod-painel.test.mjs), nenhum ficheiro de
// teste existente perde testes, o leitor partilhado não muda nem é duplicado no mod, e o código novo só usa a biblioteca padrão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, sandboxEnv, git, api } from './helpers.mjs';
import { doLote } from '../_comum/lote.mjs';

// Testes estáticos (`^test(`) por ficheiro em 4d437e8
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 27, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };

test('regressão: nenhum ficheiro de teste existente perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const names = [...readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)];
    assert.ok(names.length >= n, `${f}: ${names.length} testes, eram ${n}`);
  }
});

test('regressão: existe scripts/mod-painel.test.mjs, e node --test "scripts/*.test.mjs" passa com mais testes do que os 133 de 4d437e8', (t) => {
  assert.ok(existsSync(join(ROOT, 'scripts/mod-painel.test.mjs')), 'falta scripts/mod-painel.test.mjs (verificação dos critérios 2 a 6)');
  const r = doLote(t, 'scripts', { corre: () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/*.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 480000 }) });
  if (!r) return;
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') || out.slice(-3000));
  const pass = +(out.match(/^# pass (\d+)/m) || [])[1];
  assert.ok(pass > 133, 'passaram ' + pass);
});

const desde = () => { const m = git('merge-base', 'HEAD', 'origin/main'); return m.status === 0 ? m.stdout.trim() : BASE; };

test('âmbito: o ticket não altera o leitor partilhado (scripts/painel-leitor.mjs) nem o utilitário (scripts/painel.mjs)', () => {
  const d = git('diff', '--name-only', desde(), '--', 'scripts/painel-leitor.mjs', 'scripts/painel.mjs');
  assert.equal(d.status, 0, d.stderr);
  assert.equal(d.stdout.trim(), '', 'alterados:\n' + d.stdout);
});

// Critério 3 («o mod usa o leitor partilhado e não tem um cálculo próprio»), lado estático: um módulo do mod importa o
// scripts/painel-leitor.mjs do pacote (não uma cópia).
test('critério 3: um módulo do mod importa scripts/painel-leitor.mjs do pacote', async () => {
  const u = await api();
  const { resolve, dirname } = await import('node:path');
  const leitor = resolve(ROOT, 'scripts/painel-leitor.mjs');
  const importa = u.modulos.some((f) => [...readFileSync(f, 'utf8').matchAll(/\b(?:from|import)\s*\(?\s*['"](\.[^'"]*painel-leitor(?:\.mjs)?)['"]/g)].some((m) => resolve(dirname(f), m[1].endsWith('.mjs') ? m[1] : m[1] + '.mjs') === leitor));
  assert.ok(importa, 'nenhum módulo do mod importa ' + leitor);
});

// `claude-code` só em módulos TypeScript (o módulo de hooks e `import type`); um .mjs/.js/.cjs que os testes importam não o pode ter
test('só biblioteca padrão: os .mjs/.js/.cjs/.ts/.tsx acrescentados ou alterados só importam node:, caminhos relativos ou (em .ts/.tsx) claude-code', async () => {
  const RE = [/\bimport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g];
  const d = git('diff', '--name-only', '--diff-filter=AM', desde(), '--', '.', ':(exclude)tests');
  const n = git('ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude)tests');
  const mudados = [...new Set([...d.stdout.split('\n'), ...n.stdout.split('\n')].map((s) => s.trim()).filter(Boolean))];
  const fora = [];
  for (const f of mudados.filter((x) => ['.mjs', '.js', '.cjs', '.ts', '.tsx'].includes(extname(x)) && existsSync(join(ROOT, x)))) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const re of RE) for (const m of src.matchAll(re)) {
      const ok = m[1].startsWith('node:') || m[1].startsWith('.') || (m[1] === 'claude-code' && ['.ts', '.tsx'].includes(extname(f)));
      if (!ok) fora.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(fora, []);
});
