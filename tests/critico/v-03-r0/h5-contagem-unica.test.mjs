// V-03 R3 (#127, resposta à R2): o estado final é a ÚNICA contagem do doLote, também para o N no corpo do teste (o assert depois do doLote). O
// f-03 «os ataques do F-01 e do F-02 continuam verdes» tem `pass ≥ 60` no corpo e não passa `min`. Resultado falso: tudo o que é do f-01-r0 e do
// f-02-r0 com pass 0, menos o f-01-r0/regressao.test.mjs, que conta 60 só quando a fase 2 dos 2 testes do lote dele está ok e fundida:
//   - fase 2 ok e fundida (pass 60): o teste PASSA (controlo);
//   - fase 2 em fail: o assert do corpo (e o alvo) FALHA;
//   - fase 2 por chegar (pass 58 e 2 skips do lote): espera e FALHA, porque o skip do lote sem fase 2 não conta;
//   - fase 2 por chegar e que chega a meio, ok: PASSA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { base } from '../_comum/base.mjs';
import { prepara, resultados, corre, crit, limpa, ambiente, fim, ESPIAO, escapa, MOTIVO } from './helpers.mjs';

after(limpa);
const b = base();
const REL = crit('f-03-r0', 'regressao.test.mjs'), ALVO = crit('f-01-r0', 'regressao.test.mjs'), RE = /do F-01 e do F-02 .*continuam verdes/;
let P = null, titulo = null;
before(() => { P = prepara(b); titulo = P.ficheiros.find((x) => x.rel === REL).titulos.find((x) => RE.test(x)); });

const LOTE = { teste: 'x', motivo: MOTIVO };
const resultado = (como) => resultados(P.dir, P.sha, (d) => {
  for (const u of d.unidades) if (u.suite === 'f-01-r0' || u.suite === 'f-02-r0') u.pass = 0;
  const u = d.unidades.find((x) => x.ficheiro === ALVO);
  if (como === 'pendente') { u.pass = 58; u.skip = 2; u.skips = [LOTE, LOTE]; return; }
  u.tap_fase2 = '.forge/resultados/logs/x-f2.tap'; u.skips = []; u.skip = 0;
  if (como === 'ok') u.pass = 60; else { u.pass = 59; u.fail = 1; u.estado = 'fail'; }
});
const corrido = (res, espera = '1500') => corre(P.dir, REL, { env: { FORGE_LOTE_RESULTADOS: res, FORGE_NESTED: '1', FORGE_LOTE_ESPERA_MS: espera }, titulos: [titulo] });

test('controlo: fase 2 ok e fundida (60 = o N do corpo): o teste do f-03 passa', () => {
  const r = corrido(resultado('ok'));
  assert.equal(r.testes[titulo]?.estado, 'pass', fim(r));
});
test('fase 2 de um dos 2 testes do lote em fail: o teste do f-03 falha', () => {
  const r = corrido(resultado('fail'));
  assert.equal(r.testes[titulo]?.estado, 'fail', fim(r));
});
test('fase 2 por chegar (58 + 2 skips do lote): o skip do lote não conta, o teste do f-03 espera e falha', () => {
  const r = corrido(resultado('pendente'));
  assert.equal(r.testes[titulo]?.estado, 'fail', fim(r));
});
test('fase 2 por chegar e que chega a meio, ok: o teste do f-03 passa com o estado final', async () => {
  const res = resultado('pendente'), ok = readFileSync(resultado('ok'), 'utf8');
  const filho = spawn(process.execPath, ['--import', ESPIAO, '--test-reporter=tap', `--test-name-pattern=^(?:${escapa(titulo)})$`, REL],
    { cwd: P.dir, env: ambiente({ FORGE_LOTE_RESULTADOS: res, FORGE_NESTED: '1', FORGE_LOTE_ESPERA_MS: '30000', V03_ESPIAO_LOG: res + '.log', V03_ESPIAO_RESPOSTA: 'verde', V03_RAIZ: P.dir }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  filho.stdout.on('data', (c) => { out += c; }); filho.stderr.on('data', (c) => { out += c; });
  const status = new Promise((r) => filho.on('close', r));
  await new Promise((r) => setTimeout(r, 3000));
  writeFileSync(res, ok);
  assert.equal(await status, 0, out.slice(-2000));
});
