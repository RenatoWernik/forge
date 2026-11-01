// caso limpo (R1 do crítico, falha 3a): «git» e um sha em prosa (título e mensagem), não em argumentos do git
import test from 'node:test';
import assert from 'node:assert/strict';
import { base } from '../_comum/base.mjs';

test('GUARDA: o git diff compara com base(), nunca com 645120f', () => {
  assert.ok(base() !== '645120f', 'o git devia dar o merge-base e não 645120f');
});