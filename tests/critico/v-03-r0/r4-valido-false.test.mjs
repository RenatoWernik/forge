// Crítico R4 do V-03 (#127): um resultado com valido:false nunca serve ao doLote, dentro do lote nem na corrida avulsa.
// Copiar para tests/critico/v-03-r0/ e correr: node --test tests/critico/v-03-r0/r4-valido-false.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import * as H from './helpers.mjs';
import { base } from '../_comum/base.mjs';

after(H.limpa);
const b = base();
const FC = H.crit('f-05-r0', 'regressao-ataques-c.test.mjs'), ALVO_C = H.crit('f-03-r0', 'regressao.test.mjs');
const F6 = H.crit('f-06-r0', 'regressao.test.mjs'), ALVO_6 = H.crit('f-01-r0', 'regressao.test.mjs');
let P = null, tC = null, t6 = null;
before(() => {
  P = H.prepara(b);
  tC = P.ficheiros.find((x) => x.rel === FC).titulos.find((x) => /continua verde/.test(x));
  t6 = P.ficheiros.find((x) => x.rel === F6).titulos.find((x) => /f-01-r0 continua verde/.test(x));
});
const fundido = (u) => { u.tap_fase2 = '.forge/resultados/logs/x-f2.tap'; u.skips = []; u.pass = 3; u.skip = 0; };
const res = (alvo, extra = () => {}) => H.resultados(P.dir, P.sha, (d) => { fundido(d.unidades.find((u) => u.ficheiro === alvo)); extra(d); });
const fase2 = (f) => H.corre(P.dir, FC, { env: { FORGE_LOTE_RESULTADOS: f, FORGE_NESTED: '1', FORGE_LOTE_ESPERA_MS: '1500' }, titulos: [tC] });
const INVALIDO = (d) => { d.completo = false; d.fase1_completa = true; d.valido = false; d.motivo = 'a árvore mudou durante a corrida'; };

test('controlo: fase 2 sobre um resultado válido, com a fase 1 completa, passa', () => {
  const r = fase2(res(ALVO_C, (d) => { d.completo = false; d.fase1_completa = true; }));
  assert.equal(r.testes[tC]?.estado, 'pass', H.fim(r));
});
test('fase 2: um resultado com valido:false e a fase 1 completa FALHA o teste (é a forma que o motor grava ao invalidar)', () => {
  const r = fase2(res(ALVO_C, INVALIDO));
  assert.equal(r.testes[tC]?.estado, 'fail', H.fim(r));
});
test('avulsa: um resultado com valido:false e completo:true não é reutilizado', () => {
  const f = res(ALVO_6, (d) => { d.completo = true; d.fase1_completa = true; d.valido = false; d.motivo = 'forjado'; });
  const dst = join(P.dir, '.forge', 'resultados'), n = join(dst, `${P.sha}-limpa-p9.json`);
  mkdirSync(dst, { recursive: true }); writeFileSync(n, readFileSync(f));
  try {
    const r = H.corre(P.dir, F6, { env: { FORGE_NESTED: '1' }, titulos: [t6], resposta: 'vermelho' });
    assert.ok(r.espiao.length >= 1, 'o teste reutilizou um resultado inválido' + H.fim(r));
  } finally { rmSync(n, { force: true }); }
});