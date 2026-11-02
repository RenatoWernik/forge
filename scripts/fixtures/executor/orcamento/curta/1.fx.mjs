import { test } from 'node:test';
import { marca, dorme } from '../sonda.mjs';

test('dorme 6 s', async () => {
  marca(import.meta.url, 'inicio');
  await dorme(6);
  marca(import.meta.url, 'fim');
});