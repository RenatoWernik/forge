// F-22b critério 3: `report` imprime uma linha por classe, por ordem alfabética, `<class>: <n> entries, strongest <camada>, next <camada mais forte
// seguinte | none>, last E-NNN`, e no fim, sempre, `escapes: <n>, noise: <m>` (as contagens dos TRIGGER escape e noise).
// Força das camadas (F-22a): test 1, hook e check 2, contract 3, text 4, memory 5 (1 é a mais forte). As classes da fixture evitam `contract` como
// a mais forte, porque a seguinte (hook ou check, os dois com força 2) não está definida no contrato.
// Oráculo: 3 classes, uma com 3 entradas que sobem de memory para check, 2 escapes e 1 ruído, em dois meses; a saída é igual à golden.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { projeto, apaga, ficheiro, set9, out10, registo, learn } from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));

const REG = {
  '2026-09.md': ficheiro('2026-09', [
    set9(1, 'memory', { CLASS: 'fixed-test-port', TRIGGER: 'escape' }),
    set9(2, 'memory', { CLASS: 'evidence-self-declared', TRIGGER: 'noise' }),
    set9(3, 'text', { CLASS: 'fixed-test-port', TRIGGER: 'user' }),
  ]),
  '2026-10.md': ficheiro('2026-10', [
    out10(4, 'text', { CLASS: 'evidence-self-declared', TRIGGER: 'escape' }),
    out10(5, 'check', { CLASS: 'fixed-test-port', TRIGGER: 'critic-rejected' }),
    out10(6, 'contract', { CLASS: 'missing-lock-file', TRIGGER: 'incident' }),
    out10(7, 'test', { CLASS: 'missing-lock-file', TRIGGER: 'hook-blocked' }),
  ]),
};
const GOLDEN = [
  'evidence-self-declared: 2 entries, strongest text, next contract, last E-004',
  'fixed-test-port: 3 entries, strongest check, next test, last E-005',
  'missing-lock-file: 2 entries, strongest test, next none, last E-007',
  'escapes: 2, noise: 1',
];

test('C3 [ataque]: report com 3 classes (uma sobe de memory para check), 2 escapes e 1 ruído: a saída é a golden', () => {
  registo(P, REG);
  const r = learn(P, ['report']);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.linhas, GOLDEN);
});

test('C3 [ataque]: report de um registo vazio (só o README.md) imprime só `escapes: 0, noise: 0`', () => {
  registo(P, {});
  const r = learn(P, ['report']);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.linhas, ['escapes: 0, noise: 0']);
});

test('C3 [ataque]: memory como a mais forte tem `next text`; text tem `next contract`', () => {
  registo(P, { '2026-10.md': ficheiro('2026-10', [out10(1, 'memory', { CLASS: 'only-memory' }), out10(2, 'text', { CLASS: 'only-text', TRIGGER: 'noise' })]) });
  const r = learn(P, ['report']);
  assert.equal(r.status, 0, r.out);
  // com n = 1 o contrato não fixa o plural: aceita «1 entries» e «1 entry»
  assert.equal(r.linhas.length, 3, r.out);
  assert.match(r.linhas[0], /^only-memory: 1 entr(y|ies), strongest memory, next text, last E-001$/);
  assert.match(r.linhas[1], /^only-text: 1 entr(y|ies), strongest text, next contract, last E-002$/);
  assert.equal(r.linhas[2], 'escapes: 0, noise: 1');
});