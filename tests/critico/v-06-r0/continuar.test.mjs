// V-06 (#130), integração com o V-01/V-02: o pós-merge usa o executor --afetadas real e, quando ele sai com 3 (o motor ainda corre depois do
// orcamento_s), repete com --continuar até 0 ou 1. O teste do PR demora 4 s e o orçamento é de 1 s: sem o ciclo o avancar sairia com 1.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { montaCenario, correAvancar, saida, prMerges, comentariosEm, lerJson, limpa, PR } from './helpers.mjs';

after(limpa);

test('pós-merge lento: o executor sai com 3, o avancar continua até ao verde e comenta PÓS-MERGE VERDE (exit 0)', { timeout: 300000 }, async () => {
  const c = { ...lerJson(fileURLToPath(new URL('./cenarios/tudo-ok.json', import.meta.url))), nome: 'lento', lento: true };
  const m = montaCenario(c);
  const r = await correAvancar(m);
  const diz = saida(r);
  assert.equal(r.pendurado, false, diz);
  assert.equal(r.status, 0, diz);
  assert.match(r.out, /executor incompleto \(saída 3\), --continuar 1/, `o executor não saiu com 3: o cenário não prova o ciclo\n${diz}`);
  assert.equal(prMerges(r).length, 1, diz);
  assert.ok(comentariosEm(r, PR).some((k) => /PÓS-MERGE VERDE [0-9a-f]{40}/.test(k.corpo)), `sem PÓS-MERGE VERDE\n${diz}`);
  assert.deepEqual(JSON.parse(readFileSync(`${m.trab}/.forge/proxima-fase.json`, 'utf8')).proximas.map((p) => p.numero), [9101, 9102], diz);
});
