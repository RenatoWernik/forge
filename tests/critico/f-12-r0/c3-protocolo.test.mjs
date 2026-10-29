// F-12, critério 3: o FRAMEWORK.md gerado e o prompt do agente de painel dos workflows mandam escrever o painel.json e logo a seguir
// a cópia em `painel/estado`, no mesmo passo; o check.cjs tem a linha `panel: same data`, que fica «ok» num projeto gerado e falha
// quando cada uma das duas instruções sai. Oráculo: projetos do corpus (en e pt), o check.cjs real e duas mutações por instrução.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scaffold } from '../../../scripts/scaffold.mjs';
import { ROOT, tmp, sandboxEnv, respostas } from './helpers.mjs';

const LINHA = 'panel: same data';
const WORKFLOWS = ['.claude/workflows/gauntlet-build.js', '.claude/workflows/gauntlet-ponytail.js'];
const gerar = async (set) => { const dest = join(tmp(), 'p'); await scaffold(respostas(set), { dest }); return dest; };
const check = (cwd) => { const r = spawnSync(process.execPath, ['.claude/check.cjs'], { cwd, encoding: 'utf8', env: sandboxEnv(), timeout: 240000 }); return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }; };
const estado = (out) => out.split(/\r?\n/).map((l) => l.match(/^(ok|FAIL) {2,4}(.*)$/)).filter((m) => m && m[2].startsWith(LINHA)).map((m) => m[1]);
const mutar = (dest, rel) => { const f = join(dest, rel); const t = readFileSync(f, 'utf8'); assert.ok(t.includes('painel/estado'), `${rel} não fala de painel/estado`); writeFileSync(f, t.replaceAll('painel/estado', 'painel/outro')); };
// «logo a seguir»: a cópia em painel/estado aparece até 400 caracteres depois de uma menção ao painel.json
const emSeguida = (t) => { for (let i = t.indexOf('painel.json'); i >= 0; i = t.indexOf('painel.json', i + 1)) if (t.slice(i, i + 400).includes('painel/estado')) return true; return false; };

test('C3: num projeto en e num pt sem mutação, o check.cjs tem uma só linha «panel: same data» e ela está ok', async () => {
  for (const set of ['en-noplain-published', 'pt-plain-pending']) {
    const r = check(await gerar(set));
    assert.deepEqual(estado(r.out), ['ok'], `${set}: ${r.out.split('\n').filter((l) => l.includes(LINHA) || l.startsWith('FAIL')).join(' | ') || 'linha ausente'}`);
  }
});

test('C3: o FRAMEWORK.md e o prompt do agente de painel de cada workflow mandam escrever o painel.json e logo a seguir painel/estado', async () => {
  const dest = await gerar('en-noplain-published');
  for (const rel of ['FRAMEWORK.md', ...WORKFLOWS]) assert.ok(emSeguida(readFileSync(join(dest, rel), 'utf8')), `${rel}: sem «painel.json» seguido de «painel/estado»`);
});

test('C3: tirar a instrução do FRAMEWORK.md faz falhar a linha «panel: same data» e o check sai com 1', async () => {
  const dest = await gerar('en-noplain-published');
  mutar(dest, 'FRAMEWORK.md');
  const r = check(dest);
  assert.deepEqual(estado(r.out), ['FAIL']);
  assert.equal(r.status, 1);
});

for (const wf of WORKFLOWS) {
  test(`C3: tirar a instrução do prompt do painel em ${wf} faz falhar a linha «panel: same data» e o check sai com 1`, async () => {
    const dest = await gerar('en-noplain-published');
    mutar(dest, wf);
    const r = check(dest);
    assert.deepEqual(estado(r.out), ['FAIL']);
    assert.equal(r.status, 1);
  });
}

test('C3: o corpus do F-02 tem as mutações desta linha, uma no FRAMEWORK.md e outra num workflow', () => {
  const dir = join(ROOT, 'scripts/corpus/mutations');
  const ms = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^﻿/, ''))) : [];
  const desta = ms.filter((m) => typeof m.line === 'string' && m.line.startsWith(LINHA));
  assert.ok(desta.some((m) => m.file === 'FRAMEWORK.md'), 'falta a mutação do FRAMEWORK.md');
  assert.ok(desta.some((m) => WORKFLOWS.includes(m.file)), 'falta a mutação de um workflow');
});
