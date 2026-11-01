// F-22a R1 (#75): o campo `seed` das mutações do corpus (scripts/corpus-seed.mjs) e as duas mutações do registo de erros.
// Tudo em pastas temporárias; o git só corre dentro delas, com identidade e datas fixas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applySeed } from '../../../scripts/corpus-seed.mjs';
import { scaffold } from '../../../scripts/scaffold.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MUTATIONS = join(ROOT, 'scripts/corpus/mutations');
const WORK = mkdtempSync(join(tmpdir(), 'forge-f22a-r1-'));
const HOME = join(WORK, 'home');
mkdirSync(HOME);
after(() => rmSync(WORK, { recursive: true, force: true }));
let n = 0;
const fresh = () => { const d = join(WORK, 'p' + ++n); mkdirSync(d); return d; };
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const seed = (commit) => ({ files: { 'learnings/2026-10.md': '# Learnings 2026-10\n', 'notas/a.txt': 'a' }, commit });

test('seed sem commit: escreve os ficheiros (criando as pastas) e não cria repositório', () => {
  const d = fresh();
  applySeed(d, seed(false));
  assert.equal(readFileSync(join(d, 'learnings/2026-10.md'), 'utf8'), '# Learnings 2026-10\n');
  assert.equal(readFileSync(join(d, 'notas/a.txt'), 'utf8'), 'a');
  assert.equal(existsSync(join(d, '.git')), false);
});

test('seed com commit: git init na cópia, um commit só, identidade e datas fixas, árvore limpa', () => {
  const d = fresh();
  writeFileSync(join(d, 'ja-existia.txt'), 'x');
  applySeed(d, seed(true));
  assert.equal(git(d, 'rev-list', '--count', 'HEAD').stdout.trim(), '1');
  assert.equal(git(d, 'log', '-1', '--format=%an|%ae|%aI|%cI').stdout.trim(), 'forge-corpus|corpus@forge.invalid|2026-01-01T00:00:00Z|2026-01-01T00:00:00Z');
  const tree = git(d, 'ls-tree', '-r', '--name-only', 'HEAD').stdout.split('\n').filter(Boolean).sort();
  assert.deepEqual(tree, ['ja-existia.txt', 'learnings/2026-10.md', 'notas/a.txt']);
  assert.equal(git(d, 'status', '--porcelain').stdout, '');
});

test('seed com commit numa cópia que já tem repositório: não recomeça o histórico, acrescenta um commit', () => {
  const d = fresh();
  const cfg = ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid'];
  git(d, 'init', '-q');
  writeFileSync(join(d, 'antes.txt'), '1');
  git(d, 'add', '-A');
  git(d, ...cfg, 'commit', '-q', '-m', 'antes');
  applySeed(d, seed(true));
  assert.equal(git(d, 'rev-list', '--count', 'HEAD').stdout.trim(), '2');
});

test('seed recusa um caminho que já existe, e não escreve nenhum dos outros ficheiros', () => {
  const d = fresh();
  mkdirSync(join(d, 'learnings'));
  writeFileSync(join(d, 'learnings/2026-10.md'), 'original');
  assert.throws(() => applySeed(d, { files: { 'notas/a.txt': 'a', 'learnings/2026-10.md': 'novo' }, commit: false }), /já existe/);
  assert.equal(readFileSync(join(d, 'learnings/2026-10.md'), 'utf8'), 'original');
  assert.equal(existsSync(join(d, 'notas')), false);
});

test('seed recusa um caminho que sai da cópia («..», absoluto) ou entra em .git, e dois caminhos para o mesmo ficheiro', () => {
  const d = fresh();
  for (const rel of ['../fora.txt', 'a/../../fora.txt', join(WORK, 'fora.txt'), '.git/hooks/x', '.GIT/config']) {
    assert.throws(() => applySeed(d, { files: { [rel]: 'x' }, commit: false }), /sai da cópia|entra em \.git/, rel);
  }
  assert.throws(() => applySeed(d, { files: { 'a.txt': '1', './a.txt': '2' } }), /mesmo ficheiro/);
  assert.equal(existsSync(join(WORK, 'fora.txt')), false);
  assert.deepEqual(readdirSync(d), []);
});

test('seed mal formado é recusado (files vazio, conteúdo que não é texto, commit que não é booleano)', () => {
  const d = fresh();
  for (const s of [{}, { files: {} }, { files: [] }, { files: { 'a.txt': 1 } }, { files: { 'a.txt': 'x' }, commit: 'yes' }, null]) {
    assert.throws(() => applySeed(d, s), /seed:/, JSON.stringify(s));
  }
});

test('sem seed nada muda: applySeed(undefined) é um no-op, e as mutações antigas continuam byte a byte sem o campo', () => {
  const d = fresh();
  applySeed(d, undefined);
  assert.deepEqual(readdirSync(d), []);
  const base = git(ROOT, 'merge-base', 'HEAD', 'origin/main').stdout.trim();
  const old = git(ROOT, 'ls-tree', '--name-only', base, 'scripts/corpus/mutations/').stdout.split('\n').filter(Boolean);
  assert.ok(old.length >= 40, 'mutações antigas: ' + old.length);
  for (const f of old) {
    const antes = git(ROOT, 'show', base + ':' + f).stdout;
    assert.equal(readFileSync(join(ROOT, f), 'utf8'), antes, f);
    assert.equal('seed' in JSON.parse(antes.replace(/^﻿/, '')), false, f);
  }
});

test('as duas mutações do registo: seed (sem e com commit), a linha certa, e o caso limpo ok / a mutação FAIL no projeto gerado', async () => {
  const forma = JSON.parse(readFileSync(join(MUTATIONS, 'learnings-entrada-malformada.json'), 'utf8'));
  const reescrita = JSON.parse(readFileSync(join(MUTATIONS, 'learnings-linha-reescrita.json'), 'utf8'));
  assert.equal(forma.seed.commit, false);
  assert.equal(reescrita.seed.commit, true);
  assert.equal(forma.line, 'learnings: every entry of learnings/ is well formed');
  assert.equal(reescrita.line, 'learnings: learnings/ only grows (only STATUS lines change)');
  const answers = JSON.parse(readFileSync(join(ROOT, 'scripts/corpus/answers', forma.base + '.json'), 'utf8'));
  const proj = join(WORK, 'gerado');
  await scaffold(answers, { dest: proj });
  const env = { ...process.env, HOME, USERPROFILE: HOME, CLAUDE_CONFIG_DIR: HOME };
  const estado = (d, name) => { const r = spawnSync(process.execPath, ['.claude/check.cjs'], { cwd: d, env, encoding: 'utf8' }); return { status: r.status, line: (r.stdout.split('\n').find((l) => l.slice(6).startsWith(name)) || '').slice(0, 4).trim() }; };
  for (const [m, other] of [[forma, reescrita.line], [reescrita, forma.line]]) {
    const limpo = join(WORK, 'limpo-' + m.seed.commit);
    cpSync(proj, limpo, { recursive: true });
    applySeed(limpo, m.seed);
    assert.equal(estado(limpo, m.line).line, 'ok', 'caso limpo: ' + m.line);
    assert.equal(estado(limpo, other).line, 'ok', 'caso limpo, outra linha: ' + other);
    const mut = join(WORK, 'mut-' + m.seed.commit);
    cpSync(limpo, mut, { recursive: true });
    const f = join(mut, m.file);
    writeFileSync(f, readFileSync(f, 'utf8').replaceAll(m.find, m.replace));
    const post = estado(mut, m.line);
    assert.equal(post.line, 'FAIL', 'a mutação não falhou a sua linha: ' + m.line);
    assert.equal(post.status, 1);
    assert.equal(estado(mut, other).line, 'ok', 'a mutação falhou a outra linha: ' + other);
  }
});
