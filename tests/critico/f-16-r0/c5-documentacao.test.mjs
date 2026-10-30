// F-16, resposta P7 (#57): o prompt do tester e o .claude/briefs/batch.md documentam a forma dos blocos (ATAQUE: vermelho na base).
// Oráculo: em cada um, uma frase com «block», o comando (testCommand ou «command»), «file» ou «folder», e «exist».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, CMD, lote, SUITE2, E2E3, testerCalls } from './helpers.mjs';

const regra = (t) => t.split(/\n+|(?<=[.!?;:])\s+/).some((s) => /\bblocks?\b/i.test(s) && /\b(command|testCommand)\b/i.test(s) && /\b(file|folder)s?\b/i.test(s) && /\bexists?\b/i.test(s));

test('C5 o prompt do tester diz que cada bloco é o comando seguido de um ficheiro ou pasta que existe', async () => {
  const r = await lote([...SUITE2(), ...E2E3()]);
  const [t] = testerCalls(r);
  assert.ok(t, 'sem chamada do tester');
  assert.ok(regra(t.prompt), 'o prompt do tester não documenta a forma dos blocos');
  assert.ok(t.prompt.includes(CMD.test));
});

test('C5 o .claude/briefs/batch.md diz que cada bloco é o comando seguido de um ficheiro ou pasta que existe', () => {
  assert.ok(regra(readFileSync(join(ROOT, 'templates/.claude/briefs/batch.md'), 'utf8')), 'o batch.md não documenta a forma dos blocos');
});
