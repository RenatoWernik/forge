// caso limpo do L4: o regressao convertido lê o resultado do lote com o doLote, sem spawn de --test; o título mantém o glob do pacote
import test from 'node:test';
import assert from 'node:assert/strict';
import { doLote } from '../_comum/lote.mjs';

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os 94 testes', (t) => {
  const r = doLote(t, 'scripts');
  if (!r) return;
  assert.equal(r.status, 0, r.out);
  assert.ok(r.pass >= 94, 'passaram ' + r.pass);
});