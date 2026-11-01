// caso limpo (R1 do crítico, falha 1): base() dentro de um `${...}` do git diff conta como uso de base()
import test from 'node:test';
import { execSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';

test('GUARDA: só estes ficheiros mudaram', () => {
  execSync(`git diff --name-only ${base()} HEAD`, { encoding: 'utf8' });
});