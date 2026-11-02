// V-01 critério C4 (exclusiva): dois executores em simultâneo, cada um sobre uma cópia de scripts/fixtures/executor/exclusiva (a suíte
// `sozinha` é exclusiva; a `outras` tem 3 unidades), com o mesmo os.tmpdir(). Oráculo: o intervalo registado de cada unidade exclusiva não se
// cruza com nenhum outro, dos dois executores, e o concorrentes_max dela é 1.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, tempPrivado, correr, saida, umResultado, eventos, intervalos, limpa } from './helpers.mjs';

after(limpa);

test('C4: durante uma exclusiva não corre nenhuma outra unidade na máquina (dois executores) e o concorrentes_max dela é 1', async () => {
  exigeExecutor();
  const a = repo('exclusiva'), b = repo('exclusiva'), env = tempPrivado();
  const [ra, rb] = await Promise.all([correr(a, ['--todas'], { env }), correr(b, ['--todas'], { env })]);
  assert.equal(ra.status, 0, 'A: ' + saida(ra));
  assert.equal(rb.status, 0, 'B: ' + saida(rb));
  const ints = [...intervalos(eventos(a), 'A'), ...intervalos(eventos(b), 'B')];
  assert.equal(ints.length, 8, 'faltam intervalos registados');
  for (const x of ints.filter((i) => i.f.startsWith('sozinha/'))) {
    const cruza = ints.filter((o) => o !== x && o.ini < x.fim && o.fim > x.ini).map((o) => `${o.tag}:${o.f}`);
    assert.deepEqual(cruza, [], `a exclusiva ${x.tag}:${x.f} correu ao mesmo tempo que outras unidades`);
  }
  for (const [nome, d] of [['A', a], ['B', b]]) {
    const u = umResultado(d).dados.unidades.find((y) => y.suite === 'sozinha');
    assert.equal(u?.concorrentes_max, 1, `${nome}: concorrentes_max da exclusiva = ${u?.concorrentes_max}`);
  }
});