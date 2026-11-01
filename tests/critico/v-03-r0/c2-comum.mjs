// V-03 critério C2 (risco 1 da spec #123): as provas negativas, por propriedade sobre TODOS os testes convertidos. Partilhado pelo c2a e c2b.
// O gerador são os ficheiros de tests/critico/ que chamam o doLote (helpers.mjs › ficheirosComLote); o c4-l4 verifica que são os que o L4
// acusa na base. Para cada ficheiro, numa cópia do repo com a árvore limpa, os testes convertidos correm na fase 2 (FORGE_LOTE_RESULTADOS)
// contra um resultado falso da spec §4.2. Com o controlo (tudo verde, pass de sobra), todos passam: é o que prova que os casos vermelhos
// estão vermelhos pelo motivo certo. Em cada caso vermelho, cada teste convertido FALHA e nenhum salta. A fase 2 nunca corre o filho: o
// espião não regista nenhum spawn de --test. Os alvos de cada teste são os ficheiros que a versão da base dele corria (argv do espião).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { base } from '../_comum/base.mjs';
import { ficheirosComLote, prepara, resultados, corre, suiteDe, LITERAIS, limpa, fim } from './helpers.mjs';

export function c2(rotulo, CASOS, { inventario = false } = {}) {
  after(limpa);
  const b = base(), rels = ficheirosComLote();
  let P = null;
  before(() => { if (b && rels.length) P = prepara(b); });

  if (inventario) {
    test('C2 gerador: há testes convertidos, cada ficheiro da base que corre o pacote ou outra pasta chama o doLote, e cada teste convertido tem o N do seu assert (inventário fechado)', (t) => {
      if (!b) return t.skip('sem origin/main');
      assert.deepEqual(LITERAIS.filter((f) => !rels.includes(f)), [], 'ficheiros que na base correm o pacote ou outra pasta de ataques e não chamam o doLote');
      assert.deepEqual(P.ficheiros.filter((f) => f.erro).map((f) => f.erro), []);
      const semN = P.ficheiros.flatMap((f) => f.titulos.filter((x) => f.n[x] === null).map((x) => `${f.rel} › ${x}`));
      assert.deepEqual(semN, [], 'testes convertidos sem N na tabela NS (fora do inventário do ticket)');
    });
  }

  for (const rel of rels) for (const [nome, caso] of Object.entries(CASOS)) {
    test(`C2 ${rotulo} ${rel}: ${nome} → ${caso.verde ? 'todos passam' : 'todos FALHAM, nenhum salta'}, e a fase 2 não corre o filho`, (t) => {
      if (!b) return t.skip('sem origin/main');
      const f = P.ficheiros.find((x) => x.rel === rel);
      assert.equal(f.erro, null, f.erro);
      const suite = suiteDe(P.dir);
      const S = new Set(Object.values(f.alvos).flat().map(suite).filter(Boolean));
      assert.ok(S.size, `${rel}: os alvos da base (${JSON.stringify(f.alvos)}) não são de nenhuma suíte do manifesto`);
      const r = corre(P.dir, rel, { env: { FORGE_LOTE_RESULTADOS: resultados(P.dir, P.sha, (d) => caso.muda(d, f, S)), FORGE_NESTED: '1' }, titulos: f.titulos });
      const esperado = caso.verde ? 'pass' : 'fail';
      const mal = f.titulos.filter((x) => r.testes[x]?.estado !== esperado)
        .map((x) => `${x}: ${r.testes[x]?.estado ?? 'não correu'}${r.testes[x]?.motivo ? ` (${r.testes[x].motivo})` : ''}`);
      assert.deepEqual(mal, [], `esperava ${esperado} em todos os testes convertidos` + fim(r));
      assert.deepEqual(r.espiao, [], 'a fase 2 correu o filho (spawn de --test) em vez de ler o resultado');
    });
  }
}