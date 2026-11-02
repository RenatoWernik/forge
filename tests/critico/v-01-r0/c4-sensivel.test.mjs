// V-01 critério C4 (faixa sensível ao tempo): scripts/fixtures/executor/sensivel tem a suíte `fina` (2 unidades, sensivel_ao_tempo) e a
// `rapidas` (4 unidades), com paralelo 6, vagas_globais 6 e carga_sensivel 2. Oráculo: cada unidade da `fina` tem concorrentes_max ≤ 2, e
// pelos intervalos registados nunca há mais de 2 abertos durante ela; o concorrentes_max não é menor do que essa sobreposição registada.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, tempPrivado, correr, saida, umResultado, eventos, intervalos, sobreposicaoMax, limpa } from './helpers.mjs';

after(limpa);

test('C4: uma unidade sensivel_ao_tempo nunca tem concorrentes_max > carga_sensivel (2), nem mais de 2 unidades abertas durante ela', async () => {
  exigeExecutor();
  const d = repo('sensivel');
  const r = await correr(d, ['--todas'], { env: tempPrivado() });
  assert.equal(r.status, 0, saida(r));
  const res = umResultado(d).dados, ints = intervalos(eventos(d));
  assert.equal(ints.length, 6, 'faltam intervalos registados');
  const finas = res.unidades.filter((u) => u.suite === 'fina');
  assert.equal(finas.length, 2);
  for (const u of finas) {
    const i = ints.find((x) => x.f === u.ficheiro);
    assert.ok(i, `${u.ficheiro} sem intervalo registado`);
    const durante = sobreposicaoMax(ints, i.ini, i.fim);
    assert.ok(u.concorrentes_max <= 2, `${u.ficheiro}: concorrentes_max ${u.concorrentes_max} > carga_sensivel 2`);
    assert.ok(durante <= 2, `${u.ficheiro}: ${durante} unidades abertas ao mesmo tempo durante ela`);
    assert.ok(u.concorrentes_max >= durante, `${u.ficheiro}: concorrentes_max ${u.concorrentes_max} menor do que as ${durante} registadas`);
  }
});