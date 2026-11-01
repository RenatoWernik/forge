// V-03 (#127): as duas peças puras do scripts/inventario.mjs: os nomes completos de um TAP e a comparação antes/depois.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compara, testesDoTap } from './inventario.mjs';

const TAP = [
  'TAP version 13', '# Subtest: alfa-um', 'ok 1 - alfa-um # SKIP motivo novo', '# Subtest: com \\# cardinal', 'ok 2 - com \\# cardinal',
  '# Subtest: grupo', '    # Subtest: filho', '    ok 1 - filho', '    # Subtest: neto', '        # Subtest: n1', '        not ok 1 - n1', '    not ok 2 - neto',
  'not ok 3 - grupo', '# tests 4'].join('\n');

test('testesDoTap: o nome completo junta os grupos, o estado e o motivo vêm do TAP', () => {
  assert.deepEqual(testesDoTap(TAP).map((t) => [t.nome, t.estado, t.motivo]), [
    ['alfa-um', 'skip', 'motivo novo'], ['com # cardinal', 'pass', ''], ['grupo > filho', 'pass', ''], ['grupo > neto > n1', 'fail', ''], ['grupo > neto', 'fail', ''], ['grupo', 'fail', '']]);
});

test('compara: apagado, sem execução ok e skip novo; o skip do lote só vale com uma execução ok', () => {
  const m = (...es) => es.map(([estado, motivo = '']) => ({ estado, motivo }));
  const antes = new Map([['a', m(['pass'])], ['b', m(['pass'])], ['c', m(['pass'])], ['d', m(['skip', 'x'])], ['e', m(['pass'])]]);
  const depois = new Map([['a', m(['skip', 'lote: satisfeito na fase 2'], ['pass'])], ['b', m(['fail'])], ['c', m(['skip', 'outro'])], ['d', m(['skip', 'x'])]]);
  assert.deepEqual(compara(antes, depois), { apagados: ['e'], semOk: ['b', 'c'], skipsNovos: ['c (skip: outro)'] });
});

test('compara: o sha no motivo de um skip não o torna novo', () => {
  const skip = (motivo) => new Map([['f', [{ estado: 'skip', motivo }]]]);
  assert.deepEqual(compara(skip('já está na base 8ad82bcb49b9'), skip('já está na base 0123abc')).skipsNovos, []);
  assert.deepEqual(compara(skip('já está na base 8ad82bc'), skip('outro motivo 0123abc')).skipsNovos, ['f (skip: outro motivo 0123abc)']);
});
