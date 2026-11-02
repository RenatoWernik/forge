import { test } from 'node:test';
import { marca, dorme } from '../sonda.mjs';

test('dorme 120 s', async () => {
  marca(import.meta.url, 'inicio');
  await dorme(120);
  marca(import.meta.url, 'fim');
});