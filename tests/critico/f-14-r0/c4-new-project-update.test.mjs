// Emenda 6503240709 do F-14: no passo 1 da skill new-project («Check the machine»), o `scripts/update.mjs --check` substitui o doctor
// como verificação das componentes.
// Oráculo: a secção «## 1.» do skills/new-project/SKILL.md tem um comando `node ... scripts/update.mjs ... --check` (em código) e não
// corre o doctor.mjs; e esse comando, corrido sem rede, com a fixture de versões e com HOME falso, lê e não escreve nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, FIXTURE, SEM_REDE, FAKE_HOME, tmp, sandboxEnv, walk, readFileSync, existsSync } from './helpers.mjs';

const passo1 = () => {
  const ls = readFileSync(join(ROOT, 'skills/new-project/SKILL.md'), 'utf8').split(/\r?\n/);
  const i = ls.findIndex((l) => /^## 1\./.test(l));
  const j = ls.findIndex((l, k) => k > i && /^## /.test(l));
  return i < 0 ? '' : ls.slice(i, j < 0 ? undefined : j).join('\n');
};
// o texto em código (blocos ``` e `inline`) da secção
const codigo = (s) => [...s.matchAll(/```[^\n]*\n([\s\S]*?)```/g), ...s.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).join('\n');

test('emenda: o passo 1 da skill new-project corre o update.mjs --check e já não o doctor', () => {
  const s = passo1();
  assert.ok(s, 'secção «## 1.» não encontrada no SKILL.md');
  const c = codigo(s);
  assert.ok(c.split('\n').some((l) => /\bnode\b.*scripts\/update\.mjs\b.*--check\b/.test(l)), 'nenhum comando `node .../scripts/update.mjs --check` no passo 1:\n' + c);
  assert.doesNotMatch(c, /doctor\.mjs/, 'o passo 1 ainda corre o doctor.mjs');
});

test('emenda guarda: o update.mjs --check com a fixture, sem rede e sem PATH, só lê: sai 0 ou 1, diz que nada correu nem foi escrito, e não escreve no HOME', () => {
  const log = join(tmp(), 'rede.log');
  const antes = walk(FAKE_HOME).length;
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(SEM_REDE).href,join(ROOT, 'scripts/update.mjs'), '--check', '--versions', FIXTURE], { cwd: tmp(), encoding: 'utf8', env: sandboxEnv({ PATH: '', Path: '', CRITICO_REDE_LOG: log }), timeout: 120000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.ok([0, 1].includes(r.status), `código ${r.status}\n${out.slice(-1500)}`);
  assert.match(out, /\d+ ok, \d+ outdated/);
  assert.match(out, /Nothing was run and nothing was written/);
  assert.equal(existsSync(log) ? readFileSync(log, 'utf8') : '', '', 'tentativas de rede');
  assert.equal(walk(FAKE_HOME).length, antes, 'o update --check escreveu no HOME');
});
