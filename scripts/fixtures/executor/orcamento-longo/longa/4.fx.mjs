import { test } from 'node:test';
import { marca, dorme } from '../sonda.mjs';

test('dorme 200 s', async () => {
  marca(import.meta.url, 'inicio');
  await dorme(200);
  marca(import.meta.url, 'fim');
});