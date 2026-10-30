// F-05: os ataques c*.test.mjs da Ronda −1 do F-03 e todos os do F-10 continuam verdes. Comando à parte (ver regressao.test.mjs):
//   node --test tests/critico/f-05-r0/regressao-ataques-b.test.mjs
import { test } from 'node:test';
import { priorGreen, NESTED_SKIP } from './regressao-comum.mjs';

const MIN_B = 209; // testes a passar em e083b6a (144 do F-03 e 65 do F-10)

test('regressão: os ataques c*.test.mjs do F-03 e os do F-10 (tests/critico/f-03-r0 e f-10-r0) continuam verdes', { skip: NESTED_SKIP }, () => priorGreen(['f-03-r0/c*.test.mjs', 'f-10-r0/*.test.mjs'], MIN_B));
