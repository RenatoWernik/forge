// caso mau L1: o sha fixo está num `${...}` de um template que é argumento do git
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('C9 o compat.json antigo ainda lê', () => {
  spawnSync('git', ['show', `${'abc1234def'}:compat.json`], { encoding: 'utf8' });
});