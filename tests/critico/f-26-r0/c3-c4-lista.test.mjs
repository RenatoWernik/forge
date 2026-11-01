// Ronda −1 do F-26 (#101 com a RESPOSTA do orquestrador), C3 e C4: a lista congelada {legado, emCurso} e a main limpa.
// Oráculos:
// - as listas exatas da resposta: legado com as 27 pastas da base, emCurso com f-21b-r0, f-23b-r0, f-24-r0, f-22a-r0 e f-22a-r1;
// - o lint com 0 falhas diretamente no repo (na base, as 5 de emCurso não existem e são ignoradas);
// - uma pasta de emCurso que existe fica isenta: o f-22a-r0 antigo real (com o BASE fixo) plantado na cópia dá 0 falhas;
// - na cópia, mexer em legado:
//   (a) uma entrada sem pasta dá FAIL e nomeia a pasta;
//   (b) tirar a f-20b-r0, que é suja (o helpers.mjs tem um BASE fixo), dá FAIL com L1 e o ficheiro;
//   (c) tirar a f-20c-r1, que é limpa (um ficheiro sem git, sem shas e sem testes de âmbito), dá 0 falhas.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ROOT, LISTA, LEGADO, EM_CURSO, temLint, copia, repoe, corre, resumo, mexeLista, secoes, planta, caso, apaga } from './helpers.mjs';

const temTudo = () => { assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs'); assert.ok(existsSync(join(ROOT, LISTA)), 'falta ' + LISTA); };
let d = null;
before(() => { if (temLint() && existsSync(join(ROOT, LISTA))) d = copia(); });
after(() => { if (d) apaga(d); });

test('C3 scripts/guardas-legado.json é {legado, emCurso} com as listas exatas da #101, sem repetidas', () => {
  assert.ok(existsSync(join(ROOT, LISTA)), 'falta ' + LISTA);
  const { legado, emCurso } = secoes(JSON.parse(readFileSync(join(ROOT, LISTA), 'utf8')));
  for (const [n, v] of [['legado', legado], ['emCurso', emCurso]]) assert.equal(new Set(v).size, v.length, n + ' com repetidas: ' + v.join(', '));
  assert.deepEqual([...legado].sort(), [...LEGADO].sort(), 'legado');
  assert.deepEqual([...emCurso].sort(), [...EM_CURSO].sort(), 'emCurso');
});

test('C3 a main limpa: no próprio repo, com a lista congelada, o lint dá 0 falhas (as pastas de emCurso que faltam são ignoradas)', () => {
  temTudo();
  const r = corre(ROOT);
  assert.equal(r.falhas, '', 'falhas na main limpa:\n' + r.falhas.slice(0, 4000));
  assert.equal(r.code, 0, resumo(r));
});

test('C3 uma pasta de emCurso que existe fica isenta: o f-22a-r0 antigo real (BASE fixo) plantado como f-22a-r0 dá 0 falhas', () => {
  temTudo();
  planta(d, 'f-22a-r0', { 'c6-manual-projeto.test.mjs': caso('f22a-antigo/c6-manual-projeto.test.mjs.txt'), 'helpers.mjs': caso('f22a-antigo/helpers.mjs.txt') });
  try {
    const r = corre(d);
    assert.equal(r.falhas, '', 'a pasta de emCurso não ficou isenta:\n' + r.falhas.slice(0, 3000));
    assert.equal(r.code, 0, resumo(r));
  } finally { repoe(d); }
});

test('C4 (a) uma entrada de legado sem pasta (f-99z-r0): FAIL que nomeia a pasta', () => {
  temTudo();
  mexeLista(d, { poe: 'f-99z-r0' });
  try {
    const r = corre(d);
    assert.notEqual(r.code, 0, 'o lint passou com uma pasta inexistente em legado:\n' + resumo(r));
    assert.ok(r.falhas.includes('f-99z-r0'), 'as falhas não nomeiam f-99z-r0:\n' + r.falhas.slice(0, 3000));
  } finally { repoe(d); }
});

test('C4 (b) tirar de legado uma pasta suja (f-20b-r0): FAIL com L1, a pasta e o helpers.mjs dela', () => {
  temTudo();
  mexeLista(d, { tira: 'f-20b-r0' });
  try {
    const r = corre(d);
    assert.notEqual(r.code, 0, 'o lint passou sem a f-20b-r0 em legado:\n' + resumo(r));
    for (const k of ['f-20b-r0', 'helpers.mjs']) assert.ok(r.falhas.includes(k), 'as falhas não nomeiam ' + k + ':\n' + r.falhas.slice(0, 3000));
    assert.match(r.falhas, /\bL1\b/, 'as falhas não nomeiam L1');
  } finally { repoe(d); }
});

test('C4 (c) tirar de legado uma pasta limpa (f-20c-r1): 0 falhas', () => {
  temTudo();
  mexeLista(d, { tira: 'f-20c-r1' });
  try {
    const r = corre(d);
    assert.equal(r.falhas, '', 'falso positivo na pasta limpa:\n' + r.falhas.slice(0, 3000));
    assert.equal(r.code, 0, resumo(r));
  } finally { repoe(d); }
});