import { test } from 'node:test';
import { marca, dorme } from '../sonda.mjs';

test('dorme 0 s', async () => {
  marca(import.meta.url, 'inicio');
  await dorme(0);
  marca(import.meta.url, 'fim');
});