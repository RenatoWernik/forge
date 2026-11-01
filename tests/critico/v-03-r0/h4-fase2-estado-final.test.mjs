// V-03 R2, resposta à PERGUNTA 8 (#127): o N conta o estado final de cada teste: ok na fase 1, ou skip do lote com a execução da fase 2 ok no
// ficheiro de resultados (mesmo sha, mesma árvore). Um skip do lote sem a fase 2, ou com a fase 2 em fail, não conta. No f-05 c, o
// f-03-r0/regressao.test.mjs dá 1 (fase 1) + 2 (fase 2 ok) = 3 = MIN_C. O resultado falso põe esse ficheiro na forma do executor no meio da fase 2
// (unidade da fase 1 com 2 skips do lote, ainda sem tap_fase2) ou com a fase 2 já fundida; os outros ficheiros ficam verdes.
//   - controlo: fase 2 ok e fundida (pass 3): o teste PASSA;
//   - (a) a fase 2 de um dos 2 em fail: o teste FALHA;
//   - (b) a fase 2 em falta (os 2 skips do lote por resolver): o teste FALHA (depois de esperar, aqui 1,5 s);
//   - (c) o resultado, com a fase 2 fundida, é de outro sha: o teste FALHA;
//   - espera: a fase 2 chega ao ficheiro enquanto o teste espera: o teste PASSA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { base } from '../_comum/base.mjs';
import { prepara, resultados, corre, crit, outroSha, limpa, ambiente, fim, ESPIAO, escapa } from './helpers.mjs';

after(limpa);
const b = base();
const REL = crit('f-05-r0', 'regressao-ataques-c.test.mjs'), ALVO = crit('f-03-r0', 'regressao.test.mjs'), RE = /continua verde/;
let P = null, titulo = null;
before(() => { P = prepara(b); titulo = P.ficheiros.find((x) => x.rel === REL).titulos.find((x) => RE.test(x)); });

const LOTE = { teste: 'x', motivo: 'lote: satisfeito na fase 2' };
// o ficheiro do alvo: fase 1 (pass 1, 2 skips do lote por resolver) ou fundido com a fase 2 (ok: pass 3; fail: pass 2 e fail 1)
const forma = (u, como) => {
  if (como === 'pendente') { u.pass = 1; u.skip = 2; u.skips = [LOTE, LOTE]; return; }
  u.tap_fase2 = '.forge/resultados/logs/x-f2.tap'; u.skips = [];
  if (como === 'ok') { u.pass = 3; u.skip = 0; } else { u.pass = 2; u.fail = 1; u.skip = 0; u.estado = 'fail'; }
};
const resultado = (como, extra = () => {}) => resultados(P.dir, P.sha, (d) => { forma(d.unidades.find((u) => u.ficheiro === ALVO), como); extra(d); });
const corrido = (res, espera = '1500') => corre(P.dir, REL, { env: { FORGE_LOTE_RESULTADOS: res, FORGE_NESTED: '1', FORGE_LOTE_ESPERA_MS: espera }, titulos: [titulo] });

test('controlo: com a fase 2 ok e fundida (1 + 2 = 3) o f-05 c passa', () => {
  const r = corrido(resultado('ok'));
  assert.equal(r.testes[titulo]?.estado, 'pass', fim(r));
});
test('(a) a fase 2 de um dos 2 em fail: o f-05 c falha', () => {
  const r = corrido(resultado('fail'));
  assert.equal(r.testes[titulo]?.estado, 'fail', fim(r));
});
test('(b) a fase 2 em falta (skips do lote por resolver): o f-05 c falha, depois de esperar', () => {
  const r = corrido(resultado('pendente'));
  assert.equal(r.testes[titulo]?.estado, 'fail', fim(r));
});
test('(c) a fase 2 fundida num resultado de outro sha: o f-05 c falha', () => {
  const r = corrido(resultado('ok', (d) => { d.sha = outroSha(d.sha); }));
  assert.equal(r.testes[titulo]?.estado, 'fail', fim(r));
});
test('espera: a fase 2 chega ao resultado enquanto o f-05 c espera: passa', async () => {
  const res = resultado('pendente'), ok = JSON.parse(readFileSync(resultado('ok'), 'utf8'));
  const filho = spawn(process.execPath, ['--import', ESPIAO, '--test-reporter=tap', `--test-name-pattern=^(?:${escapa(titulo)})$`, REL],
    { cwd: P.dir, env: ambiente({ FORGE_LOTE_RESULTADOS: res, FORGE_NESTED: '1', FORGE_LOTE_ESPERA_MS: '30000', V03_ESPIAO_LOG: res + '.log', V03_ESPIAO_RESPOSTA: 'verde', V03_RAIZ: P.dir }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  filho.stdout.on('data', (c) => { out += c; }); filho.stderr.on('data', (c) => { out += c; });
  const status = new Promise((r) => filho.on('close', r));
  await new Promise((r) => setTimeout(r, 3000));
  writeFileSync(res, JSON.stringify(ok)); // a fase 2 do f-03 chega
  assert.equal(await status, 0, out.slice(-2000));
});
