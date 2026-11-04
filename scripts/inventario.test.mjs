// V-03 (#127): as duas peças puras do scripts/inventario.mjs: os nomes completos de um TAP e a comparação antes/depois.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  assert.deepEqual(compara(antes, depois), { apagados: ['e'], semOk: ['b', 'c'], skipsNovos: ['c (skip: outro)'], aninhados: [] });
});

test('compara: o sha no motivo de um skip não o torna novo', () => {
  const skip = (motivo) => new Map([['f', [{ estado: 'skip', motivo }]]]);
  assert.deepEqual(compara(skip('já está na base 8ad82bcb49b9'), skip('já está na base 0123abc')).skipsNovos, []);
  assert.deepEqual(compara(skip('já está na base 8ad82bc'), skip('outro motivo 0123abc')).skipsNovos, ['f (skip: outro motivo 0123abc)']);
});

test('compara (P9): um nome só aninhado em «antes» conta se o mesmo teste tem ok no ficheiro próprio em «depois», e fica listado à parte; um apagado de verdade continua a falhar', () => {
  const ok = [{ estado: 'pass', motivo: '' }], falha = [{ estado: 'fail', motivo: '' }];
  const antes = new Map([
    ['f-04 › t/f-04/regressao.mjs ›  > C1: alfa', ok], ['f-04 › t/f-04/regressao.mjs ›  > C2: so skip', ok], ['f-04 › t/f-04/regressao.mjs ›  > C3: apagado', ok],
    ['f-04 › t/f-04/regressao.mjs › regressão: normal apagado', ok], ['f-04 › t/f-04/regressao.mjs ›  > C5: falhava', [{ estado: 'fail', motivo: '' }]]]);
  const depois = new Map([
    ['f-02 › t/f-02/c1.mjs › C1: alfa', ok], ['f-02 › t/f-02/c2.mjs › C2: so skip', [{ estado: 'skip', motivo: 'x' }]], ['f-02 › t/f-02/c5.mjs › C5: falhava', falha]]);
  const r = compara(antes, depois);
  assert.deepEqual(r.aninhados, ['f-04 › t/f-04/regressao.mjs ›  > C1: alfa → f-02 › t/f-02/c1.mjs › C1: alfa']);
  assert.deepEqual(r.apagados.sort(), ['f-04 › t/f-04/regressao.mjs ›  > C2: so skip', 'f-04 › t/f-04/regressao.mjs ›  > C3: apagado', 'f-04 › t/f-04/regressao.mjs ›  > C5: falhava', 'f-04 › t/f-04/regressao.mjs › regressão: normal apagado']);
});
test('inventario.mjs recusa um resultado com valido:false (antes ou depois), com saída ≠ 0 e o motivo; um válido sem unidades sai 0', () => {
  const d = mkdtempSync(join(tmpdir(), 'forge-inv-'));
  try {
    const grava = (n, extra) => { const f = join(d, n); writeFileSync(f, JSON.stringify({ versao: 1, unidades: [], ...extra })); return f; };
    const bom = grava('bom.json', {}), mau = grava('mau.json', { valido: false, motivo: 'a árvore mudou durante a corrida' });
    const corre = (a, b) => spawnSync(process.execPath, [fileURLToPath(new URL('./inventario.mjs', import.meta.url)),'--antes', a, '--depois', b], { encoding: 'utf8' });
    assert.equal(corre(bom, bom).status, 0);
    for (const [a, b] of [[mau, bom], [bom, mau]]) {
      const r = corre(a, b);
      assert.notEqual(r.status, 0, r.stdout);
      assert.match(r.stderr, /valido:false.*a árvore mudou/);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});