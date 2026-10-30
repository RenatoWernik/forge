// F-05: a regressão da Ronda −1 do F-03 (tests/critico/f-03-r0/regressao.test.mjs, que volta a correr a suíte do pacote e os
// ataques anteriores) continua verde. Comando à parte (ver regressao.test.mjs):
//   node --test tests/critico/f-05-r0/regressao-ataques-c.test.mjs
import { test } from 'node:test';
import { priorGreen, NESTED_SKIP } from './regressao-comum.mjs';

const MIN_C = 3; // testes a passar em e083b6a

test('regressão: o regressao.test.mjs da Ronda −1 do F-03 continua verde', { skip: NESTED_SKIP }, () => priorGreen(['f-03-r0/regressao.test.mjs'], MIN_C));
