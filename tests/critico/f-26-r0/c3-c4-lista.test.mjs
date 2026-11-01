// Ronda −1 do F-26 (#101), C3 e C4: a lista congelada e a main limpa.
// Oráculos: a lista exata da #101 (as 27 pastas da base mais f-21b-r0, f-23b-r0 e f-24-r0), o lint com 0 falhas na cópia do repo, e dois
// mexidos na lista da cópia. Tirar a f-20b-r0 (o helpers.mjs dela tem um BASE fixo) põe-na sob o lint (L1). Acrescentar uma pasta que não existe
// faz falhar a regra da lista viva, e a falha tem de nomear a pasta.
// PERGUNTA 1 na #101: na base faltam as três pendentes; a cópia ganha um marcador só para elas (ver helpers.mjs › copia).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ROOT, LISTA, CONGELADA, temLint, copia, repoe, corre, resumo, mexeLista, nomesDaLista, apaga } from './helpers.mjs';

let d = null;
before(() => { if (temLint() && existsSync(join(ROOT, LISTA))) d = copia(); });
after(() => { if (d) apaga(d); });

test('C3 scripts/guardas-legado.json tem exatamente as 30 pastas congeladas da #101, sem repetidas', () => {
  assert.ok(existsSync(join(ROOT, LISTA)), 'falta ' + LISTA);
  const n = nomesDaLista(JSON.parse(readFileSync(join(ROOT, LISTA), 'utf8')));
  assert.equal(new Set(n).size, n.length, 'nomes repetidos: ' + n.join(', '));
  assert.deepEqual([...n].sort(), [...CONGELADA].sort());
});

test('C3 a main limpa: com a lista congelada, o lint dá 0 falhas (inclui as pastas novas tests/critico/_comum e f-26-r0)', () => {
  assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
  assert.ok(d, 'sem cópia (falta a lista)');
  const r = corre(d);
  assert.equal(r.falhas, '', 'falhas na main limpa:\n' + r.falhas.slice(0, 4000));
  assert.equal(r.code, 0, resumo(r));
});

test('C4 tirar da lista uma pasta que existe (f-20b-r0): FAIL com L1, a pasta e o helpers.mjs dela', () => {
  assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
  assert.ok(d, 'sem cópia (falta a lista)');
  mexeLista(d, { tira: 'f-20b-r0' });
  try {
    const r = corre(d);
    assert.notEqual(r.code, 0, 'o lint passou sem a f-20b-r0 na lista:\n' + resumo(r));
    for (const k of ['f-20b-r0', 'helpers.mjs']) assert.ok(r.falhas.includes(k), 'as falhas não nomeiam ' + k + ':\n' + r.falhas.slice(0, 3000));
    assert.match(r.falhas, /\bL1\b/, 'as falhas não nomeiam L1');
  } finally { repoe(d); }
});

test('C4 acrescentar à lista uma pasta que não existe (f-99z-r0): FAIL que nomeia a pasta', () => {
  assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
  assert.ok(d, 'sem cópia (falta a lista)');
  mexeLista(d, { poe: 'f-99z-r0' });
  try {
    const r = corre(d);
    assert.notEqual(r.code, 0, 'o lint passou com uma pasta inexistente na lista:\n' + resumo(r));
    assert.ok(r.falhas.includes('f-99z-r0'), 'as falhas não nomeiam f-99z-r0:\n' + r.falhas.slice(0, 3000));
  } finally { repoe(d); }
});