// V-02 (#126) C4: o fecho do doLote (spec §4.3). Numa fixture em que a suíte A tem doLote(t, 'B'), as afetadas de um diff que só toca em A
// incluem B; vale antes do V-03 (a fixture não tem o _comum/lote.mjs). O fecho é das suítes afetadas, venham elas da regra implícita
// (tests/critico/<x>/**) ou de uma regra do mapa, e repete-se nas suítes que entram pelo fecho (A → B → C).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtureLote, SUITES_LOTE, DOLOTE, testeDe, afetadasEm, nomes, limpa } from './helpers.mjs';

after(limpa);

const falta = (s, quer) => quer.filter((x) => !s.has(x));

test('guarda: a fixture tem o doLote(t, ...) na alfa e na beta, nenhum na gama e na delta, e nenhum _comum/lote.mjs (antes do V-03)', () => {
  const d = fixtureLote();
  const le = (s, n) => readFileSync(join(d, testeDe(s, n)), 'utf8');
  assert.match(le('suite-alfa', 'a'), new RegExp(`\\b${DOLOTE}\\(t, 'suite-beta'\\)`));
  assert.match(le('suite-beta', 'b'), new RegExp(`\\b${DOLOTE}\\(t, 'suite-gama', \\{ pass: 1 \\}\\)`));
  assert.ok(!le('suite-gama', 'g').includes(DOLOTE) && !le('suite-delta', 'd').includes(DOLOTE));
  assert.equal(existsSync(join(d, 'tests/critico/_comum/lote.mjs')), false);
});

test('C4: um diff só na suíte A (com doLote(t, B)) tem B nas afetadas', () => {
  const d = fixtureLote();
  const s = nomes(afetadasEm(d, [testeDe('suite-alfa', 'a')]), SUITES_LOTE);
  assert.deepEqual(falta(s, ['suite-alfa', 'suite-beta']), [], `afetadas: ${[...s].join(', ')}`);
});

test('C4: o fecho repete-se — A → B → C: um diff só em A também tem C, o alvo do doLote de B', () => {
  const d = fixtureLote();
  const s = nomes(afetadasEm(d, [testeDe('suite-alfa', 'a')]), SUITES_LOTE);
  assert.deepEqual(falta(s, ['suite-gama']), [], `afetadas: ${[...s].join(', ')}`);
});

test('C4: o fecho vale para uma suíte que entra por uma regra do mapa — lib/x.mjs → alfa traz beta e gama', () => {
  const d = fixtureLote();
  const s = nomes(afetadasEm(d, ['lib/x.mjs']), SUITES_LOTE);
  assert.deepEqual(falta(s, ['suite-alfa', 'suite-beta', 'suite-gama']), [], `afetadas: ${[...s].join(', ')}`);
});