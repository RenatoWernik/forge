// caso limpo: base() dentro de um template aninhado num `${...}`, no array de argumentos do git
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';

test('GUARDA: só estes ficheiros mudaram', () => {
  spawnSync('git', ['diff', '--name-only', `${`${base()}`}..HEAD`], { encoding: 'utf8' });
});