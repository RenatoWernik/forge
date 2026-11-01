// F-22a critério 5: relógio e avisos. Uma entrada com STATUS: open e REVIEW-BY < hoje produz
// `warn  learnings: open entries past their REVIEW-BY (today <AAAA-MM-DD>): E-002 (2026-11-01), ...`, que não conta como FAIL (exit 0).
// O hoje é a data UTC, ou a de `--today AAAA-MM-DD`; um --today fora de AAAA-MM-DD dá FAIL na linha learnings.
// Oráculo: a mesma fixture com --today 2026-11-01 (sem aviso) e com --today 2026-11-02 (aviso de E-002, exit 0); os lineNames de f-01 não leem warn.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { L_FORMA, AVISO, entrada, ficheiro, projeto, caso, check, esperaOk, esperaFailLearnings, lineNames, apaga } from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));
// E-001 aberta até 2026-11-05, E-002 aberta até 2026-11-01, E-003 já prevented com prazo passado (nunca entra no aviso)
const FIX = { '2026-10.md': ficheiro('2026-10', [
  entrada(1, 'test', { CLASS: 'a-a', STATUS: 'open', FAILS: 'open', 'REVIEW-BY': '2026-11-05' }),
  entrada(2, 'test', { CLASS: 'b-b', STATUS: 'open', FAILS: 'open', 'REVIEW-BY': '2026-11-01' }),
  entrada(3, 'test', { CLASS: 'c-c', STATUS: 'prevented', 'REVIEW-BY': '2026-10-25' }),
]) };
const avisos = (r) => r.linhas.filter((l) => l.startsWith('warn  learnings:'));

test('C5 --today 2026-11-01: REVIEW-BY 2026-11-01 não é < hoje, nenhum aviso learnings, linha ok, exit 0', () => {
  const r = caso(P, FIX, ['--today', '2026-11-01']);
  esperaOk(r, L_FORMA);
  assert.deepEqual(avisos(r), []);
});
test('C5 --today 2026-11-02: a linha literal do aviso só com E-002 (a prevented fica de fora), não conta como FAIL e o exit é 0', () => {
  const r = caso(P, FIX, ['--today', '2026-11-02']);
  assert.deepEqual(avisos(r), [AVISO('2026-11-02') + 'E-002 (2026-11-01)'], r.out.slice(-1500));
  esperaOk(r, L_FORMA);
});
test('C5 --today 2026-11-10: as duas abertas no aviso, cada uma «E-NNN (REVIEW-BY)», separadas por «, »', () => {
  const r = caso(P, FIX, ['--today', '2026-11-10']);
  const ls = avisos(r);
  assert.equal(ls.length, 1, 'esperava 1 linha de aviso:\n' + r.out.slice(-1500));
  assert.ok(ls[0].startsWith(AVISO('2026-11-10')), ls[0]);
  assert.deepEqual(ls[0].slice(AVISO('2026-11-10').length).split(', ').sort(), ['E-001 (2026-11-05)', 'E-002 (2026-11-01)']);
  esperaOk(r, L_FORMA);
});
test('C5 sem --today o hoje é a data UTC: um prazo de 2000 aparece no aviso com o hoje UTC', () => {
  const antes = new Date().toISOString().slice(0, 10);
  const r = caso(P, { '2000-01.md': ficheiro('2000-01', [entrada(1, 'test', { DATE: '2000-01-01', 'REVIEW-BY': '2000-01-02', STATUS: 'open' })]) }, []);
  const depois = new Date().toISOString().slice(0, 10);
  const ls = avisos(r);
  assert.ok([antes, depois].some((h) => ls.length === 1 && ls[0] === AVISO(h) + 'E-001 (2000-01-02)'), 'aviso esperado com o hoje UTC ' + antes + ':\n' + r.out.slice(-1500));
  esperaOk(r, L_FORMA);
});
for (const v of ['01-11-2026', '2026-11-1', '2026/11/01', 'today']) {
  test(`C5 --today fora de AAAA-MM-DD («${v}»): FAIL na linha learnings`, () => {
    esperaFailLearnings(caso(P, FIX, ['--today', v]));
  });
}
test('C5 GUARDA: os lineNames de f-01 só leem ok e FAIL, nunca uma linha warn', () => {
  assert.deepEqual(lineNames('ok    a\nwarn  learnings: open entries past their REVIEW-BY (today 2026-11-02): E-002 (2026-11-01)\nFAIL  b\ninfo  c'), ['a', 'b']);
});
test('C5 GUARDA: num projeto acabado de gerar, sem --today, não há nenhuma linha warn', async () => {
  const R = await projeto();
  try { const r = check(R, []); assert.deepEqual(r.linhas.filter((l) => l.startsWith('warn')), []); assert.equal(r.status, 0, r.out.slice(-1500)); } finally { apaga(R); }
});