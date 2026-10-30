// painel-vida.mjs, the command of a generated project that prints the painel/vida document (F-14). Standard library only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const painel = { versao: 1, projeto: 'P', modo: 'rigoroso', tickets: [], agentes: [{ nome: 'dev-1', papel: 'dev', ticket: 'T-01', modelo: 'm', checkpoint: 'dev-1.md' }] };

test('it prints painel/vida from the checkpoint mtimes, and refuses with exit 1 and no output when painel.json is missing or invalid', () => {
  const proj = mkdtempSync(join(tmpdir(), 'forge-vida-'));
  try {
    mkdirSync(join(proj, '.claude'));
    for (const n of ['painel-vida.mjs', 'painel-leitor.mjs']) copyFileSync(new URL(`./${n}`, import.meta.url), join(proj, '.claude', n));
    const run = () => spawnSync(process.execPath, ['.claude/painel-vida.mjs'], { cwd: proj, encoding: 'utf8' });
    let r = run();
    assert.deepEqual([r.status, r.stdout], [1, ''], 'no .checkpoints/');
    mkdirSync(join(proj, '.checkpoints'));
    writeFileSync(join(proj, '.checkpoints/painel.json'), '{');
    r = run();
    assert.deepEqual([r.status, r.stdout], [1, ''], 'invalid JSON');
    writeFileSync(join(proj, '.checkpoints/painel.json'), JSON.stringify(painel));
    writeFileSync(join(proj, '.checkpoints/dev-1.md'), '# cp\n');
    r = run();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout)['painel/vida'].agentes['dev-1'].vida, 'ativo');
  } finally { rmSync(proj, { recursive: true, force: true }); }
});
