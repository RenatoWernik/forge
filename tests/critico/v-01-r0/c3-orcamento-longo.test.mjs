// V-01 critério C3 (orçamento por chamada), à letra do ticket: scripts/fixtures/executor/orcamento-longo tem 4 unidades de 200 s
// (limite_s 230, paralelo 2) e orcamento_s 300. Com o motor destacado (REDESENHO, #125): arrancam 2 em t≈0 e as outras 2 em t≈200 s, e a
// 1.ª chamada sai com 3 («incompleto») em ≤ 300 s + 10 s sem matar nada; o motor continua e a 2.ª chamada (--continuar) acaba as 4.
// Este ficheiro leva ≈ 405 s; corre sozinho como unidade.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, tempPrivado, correr, saida, umResultado, inicios, validaResultado, final, vivo, lerJson, limpa } from './helpers.mjs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

after(limpa);

test('C3: 4 unidades de 200 s com orcamento_s 300 saem com o código 3 e a chamada não passa de 300 s + 10 s; o motor continua', { timeout: 460000 }, async () => {
  exigeExecutor();
  const d = repo('orcamento-longo'), env = tempPrivado();
  const r = await correr(d, ['--todas'], { env, limite_ms: 330000 });
  assert.equal(r.pendurado, false, saida(r));
  assert.ok(r.ms <= 310000, `a chamada levou ${Math.round(r.ms / 1000)} s (> 300 s + 10 s)`);
  assert.equal(r.status, 3, saida(r));
  const res = umResultado(d).dados;
  assert.deepEqual(validaResultado(res, { raiz: d }), []);
  assert.equal(res.completo, false);
  assert.ok(inicios(d).length >= 2, 'arrancaram ' + inicios(d).map((e) => e.f).join(', '));
  assert.deepEqual(res.unidades.filter(final).map((u) => u.estado), ['pass', 'pass']);
  const motor = readdirSync(join(d, '.forge', 'motor')).filter((n) => n.endsWith('.json')).map((n) => lerJson(join(d, '.forge', 'motor', n)));
  assert.equal(motor.length, 1);
  assert.equal(vivo(motor[0].pid), true, 'o motor não continua depois da 1.ª chamada');
  const r2 = await correr(d, ['--todas', '--continuar'], { env, limite_ms: 330000 });
  const fim2 = Date.now();
  assert.equal(r2.status, 0, saida(r2));
  const res2 = umResultado(d).dados;
  assert.equal(res2.unidades.length, 4);
  for (const u of res2.unidades) {
    assert.equal(u.estado, 'pass', u.ficheiro);
    assert.ok(Date.parse(u.inicio) < fim2, `${u.ficheiro}: inicio depois do fim da 2.ª chamada`);
  }
  assert.equal(inicios(d).length, 4);
});
