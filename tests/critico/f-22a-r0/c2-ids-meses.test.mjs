// F-22a critério 2: ids e meses. FAIL quando um id se repete (em qualquer ficheiro), a sequência tem buracos (os ids ordenados são 1..N, com
// pelo menos 3 dígitos), o mês de DATE não é o do nome do ficheiro, ou um ficheiro de learnings/ não se chama AAAA-MM.md nem README.md.
// Oráculo: um cenário por regra, e dois ficheiros de meses diferentes com ids contínuos entre eles, que dá ok.
// LACUNA DA BARRA: o C2 não diz em que linha nem que detalhe; aceita-se FAIL em qualquer linha `learnings:` (sem git a do C4 fica ok).
import { test, before, after } from 'node:test';
import { L_FORMA, entrada, ficheiro, projeto, caso, esperaFailLearnings, esperaOk, apaga } from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));
const nov = { DATE: '2026-11-02', 'REVIEW-BY': '2026-11-16' };

test('C2 GUARDA DO ORÁCULO: 2026-10.md com E-001 e E-002 e 2026-11.md com E-003 (ids contínuos entre meses) dão ok', () => {
  esperaOk(caso(P, {
    '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', { CLASS: 'a-a' }), entrada(2, 'test', { CLASS: 'b-b' })]),
    '2026-11.md': ficheiro('2026-11', [entrada(3, 'test', { CLASS: 'c-c', ...nov })]),
  }), L_FORMA);
});
test('C2 GUARDA: com README.md ao lado das entradas a linha continua ok', () => {
  esperaOk(caso(P, { 'README.md': '# Learnings\n', '2026-10.md': ficheiro('2026-10', [entrada(1)]) }), L_FORMA);
});

test('C2 id repetido no mesmo ficheiro (E-001, E-001): FAIL', () => {
  esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', { CLASS: 'a-a' }), entrada(1, 'test', { CLASS: 'b-b' })]) }));
});
test('C2 id repetido entre ficheiros (E-001 em 2026-10.md e em 2026-11.md): FAIL', () => {
  esperaFailLearnings(caso(P, {
    '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', { CLASS: 'a-a' })]),
    '2026-11.md': ficheiro('2026-11', [entrada(1, 'test', { CLASS: 'b-b', ...nov })]),
  }));
});
test('C2 buraco na sequência (E-001, E-003): FAIL', () => {
  esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', { CLASS: 'a-a' }), entrada(3, 'test', { CLASS: 'b-b' })]) }));
});
test('C2 buraco entre ficheiros (E-001 em 2026-10.md, E-003 em 2026-11.md): FAIL', () => {
  esperaFailLearnings(caso(P, {
    '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', { CLASS: 'a-a' })]),
    '2026-11.md': ficheiro('2026-11', [entrada(3, 'test', { CLASS: 'b-b', ...nov })]),
  }));
});
test('C2 a sequência não começa em 1 (só E-002): FAIL', () => {
  esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada(2)]) }));
});
test('C2 id com menos de 3 dígitos (E-01): FAIL', () => {
  esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada('E-01')]) }));
});
test('C2 o mês de DATE não é o do ficheiro (DATE 2026-11-02 em 2026-10.md): FAIL', () => {
  esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', nov)]) }));
});
test('C2 o mês de DATE não é o do ficheiro, outro ano (DATE 2025-10-20 em 2026-10.md): FAIL', () => {
  esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada(1, 'test', { DATE: '2025-10-20', 'REVIEW-BY': '2025-11-03' })]) }));
});
for (const nome of ['notes.md', '2026-10.txt', '2026-1.md', 'learnings-2026-10.md']) {
  test(`C2 ficheiro em learnings/ que não é AAAA-MM.md nem README.md («${nome}»): FAIL`, () => {
    esperaFailLearnings(caso(P, { '2026-10.md': ficheiro('2026-10', [entrada(1)]), [nome]: '# notes\n' }));
  });
}