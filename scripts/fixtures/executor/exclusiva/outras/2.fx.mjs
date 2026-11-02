import { test } from 'node:test';
import { marca, dorme } from '../sonda.mjs';

test('dorme 3 s', async () => {
  marca(import.meta.url, 'inicio');
  await dorme(3);
  marca(import.meta.url, 'fim');
});