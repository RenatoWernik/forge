// Seed de uma mutação do corpus (F-22a, #75): ficheiros que o projeto gerado ainda não tem, escritos na cópia temporária ANTES do find/replace.
//   "seed": { "files": { "<caminho relativo>": "<conteúdo>" }, "commit": true | false }
// Recusa um caminho que já existe, que sai da cópia ou que entra em .git. Com commit: true faz git init (se a cópia não tem .git), add e
// commit, só na cópia, com identidade e datas fixas. Só biblioteca padrão.
import { mkdirSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, resolve, sep, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

const DATE = '2026-01-01T00:00:00Z';
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=forge-corpus', '-c', 'user.email=corpus@forge.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
  });
  if (r.error || r.status !== 0) throw new Error(`seed: git ${args[0]} falhou: ${r.error?.message ?? r.stderr}`);
};

export function applySeed(dest, seed) {
  if (seed === undefined) return;
  const files = seed?.files;
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.keys(files).length) throw new Error('seed: files tem de ser um objeto com pelo menos um ficheiro');
  if (seed.commit !== undefined && typeof seed.commit !== 'boolean') throw new Error('seed: commit tem de ser true ou false');
  const root = resolve(dest);
  const targets = Object.entries(files).map(([rel, content]) => {
    if (typeof content !== 'string') throw new Error(`seed: o conteúdo de ${rel} não é texto`);
    const abs = resolve(root, rel);
    if (isAbsolute(rel) || !abs.startsWith(root + sep)) throw new Error(`seed: ${rel} sai da cópia do projeto`);
    if (abs.slice(root.length + 1).toLowerCase().split(sep).includes('.git')) throw new Error(`seed: ${rel} entra em .git`);
    if (existsSync(abs) || lstatOrNull(abs)) throw new Error(`seed: ${rel} já existe no projeto gerado`);
    return [abs, content];
  });
  if (new Set(targets.map(([abs]) => abs)).size !== targets.length) throw new Error('seed: dois caminhos apontam para o mesmo ficheiro');
  for (const [abs, content] of targets) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, content); }
  if (seed.commit) {
    if (!existsSync(resolve(root, '.git'))) git(root, 'init', '-q');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'corpus seed');
  }
}
const lstatOrNull = (p) => { try { return lstatSync(p); } catch { return null; } };
