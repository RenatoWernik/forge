// Ronda −1 do F-26 (#101), C5: o custo do lint. Oráculo: o limiar da #101 (menos de 5 s) em cada uma de 3 corridas seguidas na cópia do repo,
// e uma sentinela posta no f-14-r0 da cópia que escreve um ficheiro se alguém a correr ou importar (o lint não toca no f-14).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { temLint, copia, corre, resumo, escreve, commit, apaga } from './helpers.mjs';

const SENTINELA = 'tests/critico/f-14-r0/zz-sentinela-f26.test.mjs';
const MARCA = 'tests/critico/f-14-r0/SENTINELA-F26-DISPAROU';

let d = null;
before(() => {
  if (!temLint()) return;
  d = copia();
  escreve(d, SENTINELA, "import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('./SENTINELA-F26-DISPAROU', import.meta.url), 'x');\n");
  commit(d, 'sentinela no f-14');
});
after(() => { if (d) apaga(d); });

test('C5 o lint corre em menos de 5 s em cada uma de 3 corridas, e não corre nem importa nada do f-14-r0', () => {
  assert.ok(temLint(), 'falta scripts/guardas-critico.test.mjs');
  const ms = [];
  for (let i = 0; i < 3; i++) {
    const r = corre(d);
    assert.equal(r.code, 0, 'o lint falhou na cópia limpa:\n' + resumo(r));
    ms.push(Math.round(r.ms));
  }
  assert.ok(Math.max(...ms) < 5000, 'tempos (ms): ' + ms.join(', '));
  assert.ok(!existsSync(join(d, MARCA)), 'a sentinela do f-14-r0 disparou: o lint correu ou importou o f-14');
});