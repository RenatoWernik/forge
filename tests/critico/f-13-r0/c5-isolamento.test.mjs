// F-13 critério 5: nada é escrito fora da pasta do projeto.
// Oráculo: HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma pasta temporária com um settings.json global falso; antes e depois,
// a lista de ficheiros e os hashes dessa pasta e da pasta-mãe do projeto são iguais. Vale para o scaffold e para os três hooks a correr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { api, tmp, FAKE_HOME, gerar, hooksDe, entradaPre, correrScript, foto, mkdirSync, writeFileSync } from './helpers.mjs';

// Um settings.json global falso, para apanhar um scaffold que escreva lá em vez de no projeto
mkdirSync(join(FAKE_HOME, '.claude'), { recursive: true });
writeFileSync(join(FAKE_HOME, '.claude/settings.json'), JSON.stringify({ model: 'opus', hooks: {} }, null, 2) + '\n');
writeFileSync(join(FAKE_HOME, 'settings.json'), JSON.stringify({ model: 'opus' }, null, 2) + '\n');

test('C5: HOME, USERPROFILE e CLAUDE_CONFIG_DIR estão numa pasta temporária (pré-condição do oráculo)', () => {
  for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) assert.equal(resolve(process.env[k]), resolve(FAKE_HOME), k);
});

test('C5: o scaffold com os três hooks não escreve nada na configuração (HOME, USERPROFILE, CLAUDE_CONFIG_DIR) nem ao lado do projeto', async () => {
  const mae = tmp();
  const dest = join(mae, 'proj');
  const home0 = foto(FAKE_HOME), irmaos0 = readdirSync(mae);
  await gerar(hooksDe(true, true, true), { dest });
  assert.deepEqual(foto(FAKE_HOME), home0, 'a pasta da configuração mudou');
  assert.deepEqual(readdirSync(mae).filter((n) => n !== 'proj'), irmaos0, 'apareceram ficheiros ao lado do projeto');
});

test('C5: os três hooks, ao correr (a bloquear, a passar e a avisar), não escrevem nada na configuração nem ao lado do projeto', async () => {
  const u = await api();
  const mae = tmp();
  const proj = join(mae, 'proj');
  await gerar(hooksDe(true, true, true), { dest: proj });
  const home0 = foto(FAKE_HOME);
  const agora = Date.UTC(2026, 9, 29, 12, 0, 0);
  for (const [q, e] of [
    ['matar', entradaPre(proj, 'Bash', 'taskkill /F /IM node.exe')], ['matar', entradaPre(proj, 'PowerShell', 'git log')],
    ['fundo', entradaPre(proj, 'Bash', 'npm test', true)], ['fundo', entradaPre(proj, 'Bash', 'npm test', false)],
    ['vigia', { session_id: 's', transcript_path: join(proj, 't.jsonl'), cwd: proj, permission_mode: 'default', hook_event_name: u.eventoVigia, prompt: 'x' }],
  ]) correrScript(proj, u.scripts[q], e, q === 'vigia' ? u.relogio(agora) : {});
  assert.deepEqual(foto(FAKE_HOME), home0, 'a pasta da configuração mudou');
  assert.deepEqual(readdirSync(dirname(proj)), ['proj'], 'apareceram ficheiros ao lado do projeto');
});
