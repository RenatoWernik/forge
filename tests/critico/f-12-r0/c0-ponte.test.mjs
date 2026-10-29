// F-12: pré-condição dos ataques. A ponte tests/ponte/f-12.mjs existe, exporta o que os ataques usam e a sua `vista` só lê o DOM:
// não chama o leitor, não lê o estado interno da página nem a base de dados, para o que se mede ser o que a página DESENHA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PONTE, api } from './helpers.mjs';

test('C0: a ponte exporta vista (função), seletorResumo, seletorInboxTexto e seletorInboxEnviar (texto)', async () => {
  const u = await api();
  assert.equal(typeof u.vista, 'function', 'falta a função vista');
  for (const k of ['seletorResumo', 'seletorInboxTexto', 'seletorInboxEnviar']) assert.ok(typeof u[k] === 'string' && u[k].trim(), 'falta o seletor ' + k);
  if (u.docsVida !== undefined) assert.equal(typeof u.docsVida, 'function', 'docsVida, quando existe, é uma função');
});

test('C0: a vista só usa o document: sem leitor, JSON, window, globalThis, claude, __fake, storage, rede, eval nem imports', async () => {
  assert.ok(existsSync(PONTE), 'ponte em falta');
  const { vista } = await api();
  const src = vista.toString().replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(src, /\bdocument\b/, 'a vista não lê o document');
  const PROIBIDO = [/\bler\b/, /\bvalidar\b/, /\bJSON\b/, /\bwindow\b/, /\bglobalThis\b/, /\bself\b/, /\bclaude\b/, /__fake/, /\b(local|session)Storage\b/, /\bfetch\b/, /\beval\b/, /\bFunction\b/, /\bimport\b/, /\bXMLHttpRequest\b/];
  for (const re of PROIBIDO) assert.doesNotMatch(src, re, 'a vista usa ' + re);
  assert.doesNotMatch(readFileSync(PONTE, 'utf8'), /\bfrom\s*['"][^'"]*painel-leitor/, 'a ponte importa o leitor');
});
