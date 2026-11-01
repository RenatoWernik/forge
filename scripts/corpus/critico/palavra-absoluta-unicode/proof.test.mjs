import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAbsolute } from './piece/absolute.mjs';
test('whole absolute words are found', () => {
  for (const t of ['It never leaks', 'ALWAYS repeats', 'Nunca perde dados', 'Todos os casos passam', 'sem nenhuma falha', 'Qualquer erro, aqui']) assert.equal(hasAbsolute(t), true, t);
});
test('longer words that contain one are not found', () => {
  for (const t of ['Os métodos novos', 'A sempreviva', 'The allocation table', 'Anyone can read it', 'A tabela allin_one']) assert.equal(hasAbsolute(t), false, t);
});
