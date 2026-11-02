// V-01 critério C4 (vagas globais): dois executores lançados em simultâneo, cada um sobre uma cópia de scripts/fixtures/executor/vagas
// (4 unidades de 3 s, paralelo 3, vagas_globais 3), com o mesmo os.tmpdir() (onde vivem as vagas, spec §4.1). Sem vagas partilhadas
// chegariam a 6 ao mesmo tempo. Oráculo: os intervalos [início, fim] que as fixtures registam nunca têm mais de 3 abertos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, tempPrivado, correr, saida, eventos, intervalos, sobreposicaoMax, limpa } from './helpers.mjs';

after(limpa);

test('C4: dois executores em simultâneo nunca têm mais de vagas_globais (3) unidades ao mesmo tempo, pelos intervalos registados', async () => {
  exigeExecutor();
  const a = repo('vagas'), b = repo('vagas'), env = tempPrivado();
  const [ra, rb] = await Promise.all([correr(a, ['--todas'], { env }), correr(b, ['--todas'], { env })]);
  assert.equal(ra.status, 0, 'A: ' + saida(ra));
  assert.equal(rb.status, 0, 'B: ' + saida(rb));
  const ints = [...intervalos(eventos(a), 'A'), ...intervalos(eventos(b), 'B')];
  assert.equal(ints.length, 8, 'faltam intervalos registados');
  const max = sobreposicaoMax(ints);
  assert.ok(max <= 3, `${max} unidades ao mesmo tempo com vagas_globais 3: ${JSON.stringify(ints.map((i) => [i.tag + ':' + i.f, i.ini, i.fim]))}`);
});