// Crítico R1 do V-03 (#127): o N do assert `pass ≥ N` conta sobre os ficheiros que a versão da base corria, não sobre a suíte inteira.
// Resultado falso: nas suítes-alvo, os ficheiros que a base corria ficam com pass 0 (skip 5) e os outros ficheiros da mesma suíte ficam verdes
// com pass de sobra. A versão da base daria FALHA (pass < N nos seus alvos); o teste convertido tem de FALHAR também.
// Uso: node --test <este ficheiro>   
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers.mjs';
import { base } from '../_comum/base.mjs';

after(H.limpa);
const b = base();
let P = null;
before(() => { P = H.prepara(b); });

const CASOS = [
  [H.crit('f-05-r0', 'regressao-ataques-c.test.mjs'), /continua verde/],
  [H.crit('f-05-r0', 'regressao-ataques-b.test.mjs'), /continuam verdes/],
  [H.crit('f-04-r0', 'regressao.test.mjs'), /F-01, F-02, F-03 e F-10 continuam verdes/],
];
for (const [rel, re] of CASOS) {
  test(`N sobre os alvos da base: ${rel} ${re} FALHA quando só os ficheiros que a base corria ficam abaixo do N`, () => {
    const f = P.ficheiros.find((x) => x.rel === rel);
    assert.equal(f.erro, null, f.erro);
    const titulo = f.titulos.find((x) => re.test(x));
    const alvos = f.alvos[titulo], suite = H.suiteDe(P.dir), S = new Set(alvos.map(suite));
    const res = H.resultados(P.dir, P.sha, (d) => {
      for (const u of d.unidades) if (S.has(u.suite)) { if (alvos.includes(u.ficheiro)) { u.pass = 0; u.skip = 5; } else u.pass = 100000; }
    });
    const r = H.corre(P.dir, rel, { env: { FORGE_LOTE_RESULTADOS: res, FORGE_NESTED: '1' }, titulos: [titulo] });
    assert.equal(r.testes[titulo]?.estado, 'fail', `alvos da base ${JSON.stringify(alvos)} com pass 0 < N=${f.n[titulo]}; o teste convertido deu ${r.testes[titulo]?.estado}` + H.fim(r));
  });
}