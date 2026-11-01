// Crítico R2 do V-03 (#127, P8): o estado final de um teste do lote só conta com a fase 2 ok, no mesmo sha e na MESMA ÁRVORE, e a espera pela
// fase 2 acaba sempre em falha, nunca em skip nem em pass. Mais uma regressão do df9d849: a corrida avulsa reutiliza um resultado de
// .forge/resultados/ que só tem a fase 1 completa (fase1_completa true, completo false: o passe cortado pelo orçamento na fase 2).
// Uso: node --test <este ficheiro>
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as H from './helpers.mjs';
import { base } from '../_comum/base.mjs';

after(H.limpa);
const b = base();
const LOTE = { teste: 'x', motivo: H.MOTIVO };
const FC = H.crit('f-05-r0', 'regressao-ataques-c.test.mjs'), ALVO_C = H.crit('f-03-r0', 'regressao.test.mjs');
const F6 = H.crit('f-06-r0', 'regressao.test.mjs'), ALVO_6 = H.crit('f-01-r0', 'regressao.test.mjs');
let P = null, tC = null, t6 = null;
before(() => {
  P = H.prepara(b);
  tC = P.ficheiros.find((x) => x.rel === FC).titulos.find((x) => /continua verde/.test(x));
  t6 = P.ficheiros.find((x) => x.rel === F6).titulos.find((x) => /f-01-r0 continua verde/.test(x));
});
// o ficheiro-alvo: «pendente» = fase 1 com skips do lote sem fase 2; «ok» = fase 2 fundida e verde; «fail» = fase 2 fundida em falha
const forma = (u, como, n) => {
  if (como === 'pendente') { u.pass = n - 2; u.skip = 2; u.skips = [LOTE, LOTE]; return; }
  u.tap_fase2 = '.forge/resultados/logs/x-f2.tap'; u.skips = [];
  if (como === 'ok') { u.pass = n; u.skip = 0; } else { u.pass = n - 1; u.fail = 1; u.skip = 0; u.estado = 'fail'; }
};
const res = (alvo, como, extra = () => {}) => H.resultados(P.dir, P.sha, (d) => { forma(d.unidades.find((u) => u.ficheiro === alvo), como, 3); extra(d); });
const OUTRA = (d) => { d.arvore = 'suja:0123456789abcdef0123456789abcdef01234567'; };
const fase2 = (rel, titulo, f, extra = {}) => { const s = Date.now(); const r = H.corre(P.dir, rel, { env: { FORGE_LOTE_RESULTADOS: f, FORGE_NESTED: '1', ...extra }, titulos: [titulo] }); r.s = (Date.now() - s) / 1000; return r; };
const filho = (f, espera) => {
  const p = spawn(process.execPath, ['--import', H.ESPIAO, '--test-reporter=tap', `--test-name-pattern=^(?:${H.escapa(tC)})$`, FC],
    { cwd: P.dir, env: H.ambiente({ FORGE_LOTE_RESULTADOS: f, FORGE_NESTED: '1', FORGE_LOTE_ESPERA_MS: espera, V03_ESPIAO_LOG: f + '.log', V03_ESPIAO_RESPOSTA: 'verde', V03_RAIZ: P.dir }), stdio: ['ignore', 'pipe', 'pipe'] });
  const o = { out: '' };
  p.stdout.on('data', (c) => { o.out += c; }); p.stderr.on('data', (c) => { o.out += c; });
  o.status = new Promise((r) => p.on('close', r));
  return o;
};

// --- (1) skip do lote com a fase 2 ok, mas noutra árvore ---
test('outra árvore: f-05 c com a fase 2 ok e fundida (1 + 2 = 3) num resultado de outra árvore FALHA, sem esperar', () => {
  const r = fase2(FC, tC, res(ALVO_C, 'ok', OUTRA));
  assert.equal(r.testes[tC]?.estado, 'fail', H.fim(r));
  assert.match(r.out, /outra árvore/, H.fim(r));
  assert.ok(r.s < 30, `esperou ${r.s} s por uma falha que não depende da fase 2`);
});
test('outra árvore: f-05 c com a fase 2 pendente num resultado de outra árvore FALHA, sem esperar', () => {
  const r = fase2(FC, tC, res(ALVO_C, 'pendente', OUTRA));
  assert.equal(r.testes[tC]?.estado, 'fail', H.fim(r));
  assert.match(r.out, /outra árvore/, H.fim(r));
  assert.ok(r.s < 30, `esperou ${r.s} s`);
});
test('outra árvore: f-06 «f-01-r0 continua verde» (min 0) com a fase 2 ok do f-01 regressao noutra árvore FALHA', () => {
  const r = fase2(F6, t6, res(ALVO_6, 'ok', OUTRA));
  assert.equal(r.testes[t6]?.estado, 'fail', H.fim(r));
  assert.match(r.out, /outra árvore/, H.fim(r));
});
test('controlo: o mesmo f-05 c na mesma árvore passa', () => {
  const r = fase2(FC, tC, res(ALVO_C, 'ok'));
  assert.equal(r.testes[tC]?.estado, 'pass', H.fim(r));
});

// --- (2) a espera de 45 s pela fase 2 ---
test('espera 45 s (valor por omissão): a fase 2 nunca chega e o f-05 c FALHA no fim, nem salta nem passa', () => {
  const r = fase2(FC, tC, res(ALVO_C, 'pendente'));
  assert.equal(r.testes[tC]?.estado, 'fail', H.fim(r));
  assert.match(r.out, /menos do que os 3 exigidos/, H.fim(r));
  assert.ok(r.s >= 44, `falhou ao fim de ${r.s} s: não esperou os 45 s`);
  assert.ok(r.s < 100, `demorou ${r.s} s`);
});
test('espera: a fase 2 chega a meio, mas em fail: o f-05 c FALHA', async () => {
  const f = res(ALVO_C, 'pendente'), mau = readFileSync(res(ALVO_C, 'fail'), 'utf8');
  const o = filho(f, '30000');
  await new Promise((r) => setTimeout(r, 3000));
  writeFileSync(f, mau);
  assert.notEqual(await o.status, 0, o.out.slice(-2000));
  assert.equal(H.topo(o.out)[tC]?.estado, 'fail', o.out.slice(-2000));
});
test('espera: o resultado desaparece durante a espera: o f-05 c FALHA (não salta)', async () => {
  const f = res(ALVO_C, 'pendente');
  const o = filho(f, '6000');
  await new Promise((r) => setTimeout(r, 1500));
  rmSync(f, { force: true });
  assert.notEqual(await o.status, 0, o.out.slice(-2000));
  assert.equal(H.topo(o.out)[tC]?.estado, 'fail', o.out.slice(-2000));
});

// --- (3) regressão: a corrida avulsa só reutiliza um resultado COMPLETO (fase 2 incluída) ---
const planta = (como, completo) => {
  const f = res(ALVO_6, como, (d) => { d.completo = completo; d.fase1_completa = true; });
  const dst = join(P.dir, '.forge', 'resultados'), n = join(dst, `${P.sha}-limpa-p9.json`);
  mkdirSync(dst, { recursive: true }); writeFileSync(n, readFileSync(f));
  return () => rmSync(n, { force: true });
};
test('avulsa: um resultado só com a fase 1 completa (completo false, f-01 regressao com o skip do lote por resolver) NÃO é reutilizado', () => {
  const tira = planta('pendente', false);
  try {
    const r = H.corre(P.dir, F6, { env: { FORGE_NESTED: '1' }, titulos: [t6], resposta: 'vermelho' });
    assert.ok(r.espiao.length >= 1, 'o teste reutilizou um resultado parcial: o f-01-r0/regressao tem um teste do lote que nunca correu' + H.fim(r));
    assert.equal(r.testes[t6]?.estado, 'fail', H.fim(r));
  } finally { tira(); }
});
test('controlo avulsa: um resultado completo verde é reutilizado (sem spawn)', () => {
  const tira = planta('ok', true);
  try {
    const r = H.corre(P.dir, F6, { env: { FORGE_NESTED: '1' }, titulos: [t6], resposta: 'vermelho' });
    assert.equal(r.espiao.length, 0, H.fim(r));
    assert.equal(r.testes[t6]?.estado, 'pass', H.fim(r));
  } finally { tira(); }
});