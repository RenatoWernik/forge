// F-22b critério 5: `classes --ref <branch>` lê learnings/*.md SÓ com `git show <ref>:<caminho>` (a lista vem de `git ls-tree --name-only <ref>
// learnings/`, só os nomes AAAA-MM.md) e imprime JSON `[{"class":..., "entries":n, "strongest":<camada>}]`, por ordem alfabética; uma ref
// inexistente sai com 1.
// Oráculo: um repositório git temporário (o projeto gerado, git sem config de sistema nem global). Uma classe só commitada noutra branch, só na
// árvore de trabalho (alterada, no índice ou por seguir) nunca aparece; a classe commitada na ref aparece. O README.md e um nome que não é
// AAAA-MM.md, commitados na ref, também não contam.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projeto, apaga, ficheiro, out10, registo, learn, git } from './helpers.mjs';

let P;
const NA_REF = [
  { class: 'a-first', entries: 1, strongest: 'test' },
  { class: 'committed-on-ref', entries: 2, strongest: 'check' },
];
const json = (r) => { assert.equal(r.status, 0, r.out); try { return JSON.parse(r.stdout); } catch (e) { assert.fail('a saída do classes não é JSON: ' + r.stdout.slice(0, 300)); } };

before(async () => {
  P = await projeto();
  registo(P, {});
  git(P, 'init', '-q');
  git(P, 'checkout', '-q', '-b', 'integracao');
  git(P, 'add', '-A');
  git(P, 'commit', '-q', '-m', 'base');
  // na ref: committed-on-ref (memory e depois check) e a-first (test); o README armadilha e notes.md (nome que não é AAAA-MM.md)
  writeFileSync(join(P, 'learnings', '2026-10.md'), ficheiro('2026-10', [
    out10(1, 'memory', { CLASS: 'committed-on-ref' }), out10(2, 'check', { CLASS: 'committed-on-ref' }), out10(3, 'test', { CLASS: 'a-first' }),
  ]));
  writeFileSync(join(P, 'learnings', 'notes.md'), ficheiro('2026-10', [out10(9, 'memory', { CLASS: 'not-a-month-file' })]));
  git(P, 'add', '-A');
  git(P, 'commit', '-q', '-m', 'learnings na ref');
  // só noutra branch
  git(P, 'checkout', '-q', '-b', 'outra');
  appendFileSync(join(P, 'learnings', '2026-10.md'), '\n' + out10(4, 'memory', { CLASS: 'only-other-branch' }));
  git(P, 'commit', '-q', '-am', 'outra');
  git(P, 'checkout', '-q', 'integracao');
  // só na árvore de trabalho: alterado sem commit, no índice sem commit e por seguir
  appendFileSync(join(P, 'learnings', '2026-10.md'), '\n' + out10(4, 'memory', { CLASS: 'only-worktree' }));
  writeFileSync(join(P, 'learnings', '2026-11.md'), ficheiro('2026-11', [out10(5, 'memory', { CLASS: 'only-staged', DATE: '2026-11-02', 'REVIEW-BY': '2026-11-16' })]));
  git(P, 'add', 'learnings/2026-11.md');
  writeFileSync(join(P, 'learnings', '2026-12.md'), ficheiro('2026-12', [out10(6, 'memory', { CLASS: 'only-untracked', DATE: '2026-12-02', 'REVIEW-BY': '2026-12-16' })]));
});
after(() => apaga(P));

test('C5 [ataque]: só as classes commitadas na ref, por ordem alfabética; nunca as da árvore de trabalho, do índice, de outra branch, do README ou de notes.md', () => {
  assert.deepEqual(json(learn(P, ['classes', '--ref', 'integracao'])), NA_REF);
});

test('C5 [ataque]: a outra branch, como ref, mostra a sua classe (o mesmo comando lê mesmo a ref dada)', () => {
  assert.deepEqual(json(learn(P, ['classes', '--ref', 'outra'])), [
    { class: 'a-first', entries: 1, strongest: 'test' },
    { class: 'committed-on-ref', entries: 2, strongest: 'check' },
    { class: 'only-other-branch', entries: 1, strongest: 'memory' },
  ]);
});

test('C5 [ataque]: sem learnings/ no disco, as classes vêm na mesma da ref (nada é lido da árvore de trabalho)', () => {
  apaga(join(P, 'learnings'));
  assert.deepEqual(json(learn(P, ['classes', '--ref', 'integracao'])), NA_REF);
});

test('C5 [ataque]: uma ref inexistente sai com 1', () => {
  const r = learn(P, ['classes', '--ref', 'nao-existe-esta-ref']);
  assert.equal(r.status, 1, r.out);
});