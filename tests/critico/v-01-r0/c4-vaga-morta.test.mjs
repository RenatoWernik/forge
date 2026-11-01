// V-01 critério C4 (vaga com o PID morto): o executor A (scripts/fixtures/executor/presa: 2 unidades de 120 s, vagas_globais 2) ocupa as duas
// vagas de os.tmpdir()/forge-vagas/ e é morto pelo PID (a árvore dele, que este teste lançou), sem largar as vagas. Oráculo: as vagas estão
// em <TEMP>/forge-vagas/ e o executor B (rapida, vagas_globais 2, o mesmo TEMP) recupera-as e acaba verde, sem ficar à espera.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { exigeExecutor, repo, tempPrivado, lanca, correr, saida, umResultado, inicios, esperaAte, vivo, registaPid, mataArvore, limpa } from './helpers.mjs';

after(limpa);

test('C4: uma vaga com o PID morto é recuperada: um executor morto com as vagas cheias não prende o seguinte', async () => {
  exigeExecutor();
  const a = repo('presa'), b = repo('rapida'), env = tempPrivado();
  const A = lanca(a, ['--todas'], { env, limite_ms: 200000 });
  const cheias = await esperaAte(() => inicios(a).length === 2, 60000);
  const vagas = join(env.TEMP, 'forge-vagas');
  const ocupadas = existsSync(vagas) ? readdirSync(vagas).length : 0;
  mataArvore(A.pid);
  const ra = await A.fim;
  for (const e of inicios(a)) { registaPid(e.pid); registaPid(e.ppid); }
  for (const e of inicios(a)) for (const pid of [e.pid, e.ppid]) mataArvore(pid);
  await esperaAte(() => inicios(a).every((e) => !vivo(e.pid) && !vivo(e.ppid)), 10000);
  assert.ok(cheias, 'as duas unidades presas não arrancaram em 60 s\n' + saida(ra));
  assert.ok(ocupadas >= 1, `as vagas globais não estão em os.tmpdir()/forge-vagas/ (${vagas})`);
  const rb = await correr(b, ['--todas'], { env, limite_ms: 60000 });
  assert.equal(rb.pendurado, false, 'o executor seguinte ficou à espera das vagas de um PID morto\n' + saida(rb));
  assert.equal(rb.status, 0, saida(rb));
  assert.deepEqual(umResultado(b).dados.unidades.map((u) => u.estado), ['pass', 'pass']);
});