// F-18 critério 6 (#62.4; ATAQUE: vermelho na base 0c1bfae).
// Oráculo: a frase C6_LIMITE aparece 1 vez em templates/.claude/briefs/batch.md e 1 vez no prompt do tester do gauntlet-batch.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ler, conta, C6_LIMITE, lote, SUITE2, E2E3, testerCalls } from './helpers.mjs';

test('C6 o .claude/briefs/batch.md tem a frase do limite 1 vez', () => {
  const t = ler('templates/.claude/briefs/batch.md');
  assert.equal(conta(t, C6_LIMITE), 1, `a frase aparece ${conta(t, C6_LIMITE)} vezes no batch.md`);
});

test('C6 o prompt do tester do gauntlet-batch.js tem a frase do limite 1 vez', async () => {
  const [t] = testerCalls(await lote([...SUITE2(), ...E2E3()]));
  assert.ok(t, 'sem chamada do tester');
  assert.equal(conta(t.prompt, C6_LIMITE), 1, `a frase aparece ${conta(t.prompt, C6_LIMITE)} vezes no prompt do tester`);
});