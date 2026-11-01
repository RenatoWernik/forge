// caso limpo: um sha num ref de fixture (estilo f-15a), que nunca chega ao git; o git do ficheiro só recebe HEAD
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const PINS = { 'gauntlet-loop': { repo: 'RenatoWernik/gauntlet-loop', ref: '9f8e7d6', path: 'SKILL.md' } };
const fetchFalso = (id) => ({ url: `https://raw.example.invalid/${PINS[id].repo}/${PINS[id].ref}/${PINS[id].path}`, body: '---\nname: x\n---\n' });

test('C9 o pin do gauntlet vem da fixture', () => {
  assert.match(fetchFalso('gauntlet-loop').url, /\/SKILL\.md$/);
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
});
