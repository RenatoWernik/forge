// Critério 1 (parte estática): o mod vem do plugin forge. O hooks.json do plugin lista o módulo do mod, e as duas
// validações --strict passam com config temporária. O arranque real e a captura são a evidência da Ronda 0 (e do crítico na R1);
// aqui nunca se instala nada no Claude Code real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, api, sandboxEnv, norm } from './helpers.mjs';

const json = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

// Os ficheiros de hooks que o plugin declara: o campo `hooks` do plugin.json (texto, lista ou objeto) e o hooks/hooks.json por omissão
const hooksDoPlugin = () => {
  const pj = json(join(ROOT, '.claude-plugin/plugin.json'));
  const decl = [pj.hooks].flat().filter((h) => typeof h === 'string').map((h) => resolve(ROOT, h));
  const inline = [pj.hooks].flat().filter((h) => h && typeof h === 'object').map((h) => ({ dir: ROOT, cfg: h }));
  const def = join(ROOT, 'hooks/hooks.json');
  const ficheiros = [...new Set([...decl, ...(existsSync(def) ? [def] : [])])].filter(existsSync).map((f) => ({ dir: dirname(f), cfg: json(f) }));
  return [...ficheiros, ...inline];
};

test('C1: um hooks.json do plugin forge lista, em `modules`, o módulo de hooks do mod', async () => {
  const u = await api();
  const listados = hooksDoPlugin().flatMap(({ dir, cfg }) => (Array.isArray(cfg.modules) ? cfg.modules.map((m) => norm(resolve(dir, m))) : []));
  assert.ok(listados.includes(norm(u.modulo)), `o módulo ${u.modulo} não está em nenhum "modules" do plugin: ${JSON.stringify(listados)}`);
});

const claude = (args) => spawnSync('claude', args, { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 180000, shell: process.platform === 'win32' });

for (const alvo of ['.', '.claude-plugin/plugin.json']) {
  test(`C1: claude plugin validate ${alvo} --strict sai com 0 (config temporária)`, () => {
    const r = claude(['plugin', 'validate', alvo, '--strict']);
    assert.equal(r.error, undefined, 'claude não correu: ' + r.error);
    assert.equal(r.status, 0, ((r.stdout || '') + (r.stderr || '')).slice(-3000));
  });
}
