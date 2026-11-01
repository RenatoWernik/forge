// V-01 critério C3 (orçamento por chamada), à letra do ticket: scripts/fixtures/executor/orcamento-longo tem 4 unidades de 200 s
// (limite_s 230, paralelo 2) e orcamento_s 300. Pela regra da spec §4.1 (só lança se decorrido + limite_s ≤ orcamento_s), arrancam 2 em t≈0
// e nenhuma em t≈200 s: a chamada espera pelas que correm e sai com 3 («incompleto»), sem passar de 300 s + 10 s de folga.
// Este ficheiro leva ≈ 205 s; corre sozinho como unidade.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, tempPrivado, correr, saida, umResultado, inicios, validaResultado, limpa } from './helpers.mjs';

after(limpa);

test('C3: 4 unidades de 200 s com orcamento_s 300 saem com o código 3 e a chamada não passa de 300 s + 10 s', { timeout: 400000 }, async () => {
  exigeExecutor();
  const d = repo('orcamento-longo');
  const r = await correr(d, ['--todas'], { env: tempPrivado(), limite_ms: 330000 });
  assert.equal(r.pendurado, false, saida(r));
  assert.ok(r.ms <= 310000, `a chamada levou ${Math.round(r.ms / 1000)} s (> 300 s + 10 s)`);
  assert.equal(r.status, 3, saida(r));
  const res = umResultado(d).dados;
  assert.deepEqual(validaResultado(res, { raiz: d }), []);
  assert.equal(res.completo, false);
  assert.equal(inicios(d).length, 2, 'arrancaram ' + inicios(d).map((e) => e.f).join(', '));
  assert.deepEqual(res.unidades.map((u) => u.estado), ['pass', 'pass']);
});