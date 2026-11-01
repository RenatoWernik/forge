// F-05: os ataques da Ronda −1 do F-01 e do F-02 continuam verdes. Comando à parte (ver regressao.test.mjs):
//   node --test tests/critico/f-05-r0/regressao-ataques-a.test.mjs
import { test } from 'node:test';
import { priorGreen, NESTED_SKIP } from './regressao-comum.mjs';
import { doLote } from '../_comum/lote.mjs';

const MIN_A = 63; // testes a passar em e083b6a

test('regressão: os ataques da Ronda −1 do F-01 e do F-02 (tests/critico/f-01-r0 e f-02-r0) continuam verdes', { skip: NESTED_SKIP }, (t) => { doLote(t, ['f-01-r0', 'f-02-r0'], { min: MIN_A, corre: () => priorGreen(['f-01-r0/*.test.mjs', 'f-02-r0/*.test.mjs'], MIN_A) }); });
