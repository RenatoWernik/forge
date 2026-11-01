// Corre ao mesmo tempo que a pendura e acaba sozinha: matar a árvore da outra unidade não pode matar esta.
import { test } from 'node:test';
import { marca, dorme } from '../sonda.mjs';

test('vizinha acaba', async () => {
  marca(import.meta.url, 'inicio');
  await dorme(8);
  marca(import.meta.url, 'fim');
});