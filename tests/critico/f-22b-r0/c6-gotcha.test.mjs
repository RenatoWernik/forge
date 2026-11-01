// F-22b critério 6: `gotcha <E-NNN>` imprime exatamente o corpo que o orquestrador grava em gotchas/<class>.md:
//   # <class>
//   Index only: the lesson is entry E-NNN of learnings/<AAAA-MM>.md (node .claude/learn.mjs report).
// Um id inexistente sai com 1. Oráculo: uma golden (em cada um dos dois meses) e o id inexistente.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { projeto, apaga, ficheiro, set9, out10, registo, learn } from './helpers.mjs';

let P;
before(async () => {
  P = await projeto();
  registo(P, {
    '2026-09.md': ficheiro('2026-09', [set9(1, 'memory', { CLASS: 'fixed-test-port' })]),
    '2026-10.md': ficheiro('2026-10', [out10(2, 'text', { CLASS: 'evidence-self-declared' }), out10(3, 'test', { CLASS: 'stale-graph' })]),
  });
});
after(() => apaga(P));

const corpo = (r) => { assert.equal(r.status, 0, r.out); return r.stdout.replace(/\r\n/g, '\n').replace(/\n+$/, ''); };

test('C6 [ataque]: gotcha E-003 imprime exatamente o corpo da página (learnings/2026-10.md)', () => {
  assert.equal(corpo(learn(P, ['gotcha', 'E-003'])), '# stale-graph\nIndex only: the lesson is entry E-003 of learnings/2026-10.md (node .claude/learn.mjs report).');
});

test('C6 [ataque]: gotcha E-001 aponta para o ficheiro do seu mês (learnings/2026-09.md)', () => {
  assert.equal(corpo(learn(P, ['gotcha', 'E-001'])), '# fixed-test-port\nIndex only: the lesson is entry E-001 of learnings/2026-09.md (node .claude/learn.mjs report).');
});

test('C6 [ataque]: um id inexistente sai com 1 (também o E-099 do README.md, que não é registo)', () => {
  assert.equal(learn(P, ['gotcha', 'E-004']).status, 1);
  assert.equal(learn(P, ['gotcha', 'E-099']).status, 1);
});