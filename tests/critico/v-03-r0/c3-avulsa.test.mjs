// V-03 critério C3 (equivalência na corrida avulsa) e a fase 1 da spec §4.4, sobre todos os testes convertidos (o gerador do C2). Numa cópia
// do repo sem .forge/resultados/ e sem nenhuma variável do lote (só FORGE_NESTED=1, para os testes com NESTED_SKIP correrem nas duas versões):
//   - cada teste convertido corre o filho com o mesmo argv, na mesma pasta e pela mesma ordem que a versão da base (o espião regista-os);
//   - com o filho verde e com o filho vermelho, o veredito de cada teste é o da versão da base, e com o filho vermelho é FALHA.
// Na fase 1 (FORGE_LOTE_FASE=1), cada teste convertido salta com o motivo exato «lote: satisfeito na fase 2» e não corre o filho.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { base } from '../_comum/base.mjs';
import { ficheirosComLote, prepara, corre, baseDe, MOTIVO, limpa, fim } from './helpers.mjs';

after(limpa);
const b = base(), rels = ficheirosComLote();
let P = null;
before(() => { if (b && rels.length) P = prepara(b); });

test('C3 gerador: há ficheiros com testes convertidos', () => assert.ok(rels.length > 0, 'nenhum ficheiro de tests/critico/ chama o doLote'));

const prep = (t, rel) => {
  if (!b) { t.skip('sem origin/main'); return null; }
  const f = P.ficheiros.find((x) => x.rel === rel);
  assert.equal(f.erro, null, f.erro);
  return f;
};
for (const rel of rels) {
  test(`C3 ${rel}: sem env nem resultados, os filhos têm o argv e a pasta da versão da base, pela mesma ordem`, (t) => {
    const f = prep(t, rel);
    if (!f) return;
    const novo = corre(P.dir, rel, { env: { FORGE_NESTED: '1' }, titulos: f.titulos }), velho = corre(P.dir, baseDe(rel), { env: { FORGE_NESTED: '1' }, titulos: f.titulos });
    assert.equal(velho.espiao.length, f.titulos.length, 'controlo: a versão da base corre um filho por teste convertido' + fim(velho));
    assert.deepEqual(novo.espiao, velho.espiao, 'o argv dos filhos mudou na corrida avulsa' + fim(novo));
  });
  test(`C3 ${rel}: sem env nem resultados, o veredito é o da versão da base com o filho verde e com o vermelho, e o vermelho dá FALHA`, (t) => {
    const f = prep(t, rel);
    if (!f) return;
    for (const resposta of ['verde', 'vermelho']) {
      const novo = corre(P.dir, rel, { env: { FORGE_NESTED: '1' }, titulos: f.titulos, resposta });
      const velho = corre(P.dir, baseDe(rel), { env: { FORGE_NESTED: '1' }, titulos: f.titulos, resposta });
      const dif = f.titulos.filter((x) => novo.testes[x]?.estado !== velho.testes[x]?.estado).map((x) => `${x}: base ${velho.testes[x]?.estado}, agora ${novo.testes[x]?.estado}`);
      assert.deepEqual(dif, [], `filho ${resposta}: vereditos diferentes` + fim(novo));
      if (resposta === 'vermelho') assert.deepEqual(f.titulos.filter((x) => novo.testes[x]?.estado !== 'fail'), [], 'filho vermelho sem FALHA' + fim(novo));
    }
  });
  test(`fase 1 ${rel}: cada teste convertido salta com «${MOTIVO}» e não corre o filho`, (t) => {
    const f = prep(t, rel);
    if (!f) return;
    const r = corre(P.dir, rel, { env: { FORGE_LOTE_FASE: '1', FORGE_NESTED: '1' }, titulos: f.titulos });
    assert.deepEqual(f.titulos.filter((x) => r.testes[x]?.estado !== 'skip' || r.testes[x]?.motivo !== MOTIVO), [], fim(r));
    assert.deepEqual(r.espiao, [], 'a fase 1 correu o filho');
  });
}