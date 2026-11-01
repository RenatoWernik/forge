// caso mau L2: dois testes de âmbito no mesmo ficheiro; o primeiro chama soNoTicket, o segundo não
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soNoTicket } from '../_comum/ambito.mjs';

test('ÂMBITO: o CHANGELOG ganha a entrada do ticket', (t) => {
  if (soNoTicket(t, 'f-97')) return;
  assert.ok(readFileSync('CHANGELOG.md', 'utf8').includes('F-97'));
});

test('ÂMBITO: o README só ganha a secção nova', () => {
  assert.ok(readFileSync('README.md', 'utf8').includes('## '));
});
