// F-22b critério 1: `add --json <ficheiro>`. Lê um objeto com os campos do formato (sem E-NNN), dá-lhe o id a seguir ao maior de todos os
// learnings/AAAA-MM.md, acrescenta-o a learnings/<AAAA-MM do DATE>.md (um ficheiro novo nasce com `# Learnings AAAA-MM`, em LF) e imprime
// `added E-NNN to learnings/<ficheiro>`. Recusa (saída 1, sem escrever nada) o que o validate do F-22a recusa e uma regra `PREVENTION: text`
// cujo SYMPTOM contém um dos 12 títulos de invariantes. Lock exclusivo learnings/.lock: com ele presente, saída 3 e `learnings: busy, try again`.
// RESPOSTA 6552729846: o add só ACRESCENTA (os bytes existentes, BOM incluído, ficam) e usa o fim de linha do ficheiro; aceita `--today`.
// Oráculos: golden do texto escrito; E-001..E-004 em dois meses dão E-005; inválida = mesmos sha256; 8 processos em paralelo nunca repetem um id.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projeto, check, apaga, entrada, ficheiro, set9, out10, registo, learn, learnAsync, jsonDe, fotografia, ler, bytes,
  L_FORMA, BUSY, REPETE, esperaLinha,
} from './helpers.mjs';

let P;
before(async () => { P = await projeto(); });
after(() => apaga(P));

// O registo de partida: o maior id (E-004) está no mês mais antigo, para que «o maior do ficheiro de destino» dê um id repetido
const OUT = ficheiro('2026-10', [out10(1, 'test', { CLASS: 'a-a' }), out10(2, 'memory', { CLASS: 'b-b' })]);
const SET = ficheiro('2026-09', [set9(3, 'memory', { CLASS: 'c-c' }), set9(4, 'memory', { CLASS: 'd-d' })]);
const partida = (extra = {}) => registo(P, { '2026-09.md': SET, '2026-10.md': OUT, ...extra });

// A entrada nova, literal (camada test: os caminhos existem na árvore falsa do projeto)
const NOVA = {
  DATE: '2026-10-25', TRIGGER: 'critic-rejected', 'DETECTED-BY': 'critic, round 1 of ticket 9', SYMPTOM: 'the lock file stayed behind after a crash',
  CLASS: 'lock-left-behind', CAUSE: 'the writer had no finally', 'CAUSE-OWNER': 'harness', 'FAILED-LAYER': 'tdd', 'MISSING-CONTEXT': 'none',
  PREVENTION: 'test', 'PREVENTION-PATH': 'tests/learn/porta.test.mjs', FAILS: 'closed', REGRESSION: 'tests/learn/porta-regressao.test.mjs',
  'CLEAN-CASE': 'tests/learn/porta-limpo.test.mjs', AREA: 'src/learn/**', SCOPE: 'project', 'REVIEW-BY': '2026-11-08', STATUS: 'open',
};
const GOLDEN = (id) => `## ${id}
- DATE: 2026-10-25
- TRIGGER: critic-rejected
- DETECTED-BY: critic, round 1 of ticket 9
- SYMPTOM: the lock file stayed behind after a crash
- CLASS: lock-left-behind
- CAUSE: the writer had no finally
- CAUSE-OWNER: harness
- FAILED-LAYER: tdd
- MISSING-CONTEXT: none
- PREVENTION: test
- PREVENTION-PATH: tests/learn/porta.test.mjs
- FAILS: closed
- REGRESSION: tests/learn/porta-regressao.test.mjs
- CLEAN-CASE: tests/learn/porta-limpo.test.mjs
- AREA: src/learn/**
- SCOPE: project
- REVIEW-BY: 2026-11-08
- STATUS: open
`;
const NOV_GOLDEN = `# Learnings 2026-11

## E-005
- DATE: 2026-11-02
- TRIGGER: escape
- DETECTED-BY: user, after the release
- SYMPTOM: the readout block went stale after a manual edit
- CLASS: stale-readout
- CAUSE: nobody ran the readout
- CAUSE-OWNER: instruction
- FAILED-LAYER: orchestrator
- MISSING-CONTEXT: none
- PREVENTION: memory
- PREVENTION-PATH: ai-memory:gotchas/stale-readout.md
- FAILS: open
- REGRESSION: none
- CLEAN-CASE: none
- AREA: CLAUDE.md, AGENTS.md
- SCOPE: project
- REVIEW-BY: 2026-11-16
- STATUS: open
`;
const NOV = {
  DATE: '2026-11-02', TRIGGER: 'escape', 'DETECTED-BY': 'user, after the release', SYMPTOM: 'the readout block went stale after a manual edit', CLASS: 'stale-readout',
  CAUSE: 'nobody ran the readout', 'CAUSE-OWNER': 'instruction', 'FAILED-LAYER': 'orchestrator', 'MISSING-CONTEXT': 'none', PREVENTION: 'memory',
  'PREVENTION-PATH': 'ai-memory:gotchas/stale-readout.md', FAILS: 'open', REGRESSION: 'none', 'CLEAN-CASE': 'none', AREA: 'CLAUDE.md, AGENTS.md', SCOPE: 'project',
  'REVIEW-BY': '2026-11-16', STATUS: 'open',
};
// Uma regra de texto válida (APPROVED e PREVENTION-PATH CLAUDE.md), com o SYMPTOM dado
const TEXTO = (SYMPTOM, over = {}) => ({
  ...NOV, DATE: '2026-10-26', 'REVIEW-BY': '2026-11-09', TRIGGER: 'user', SYMPTOM, CLASS: 'rule-' + Math.abs([...SYMPTOM].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)),
  PREVENTION: 'text', 'PREVENTION-PATH': 'CLAUDE.md', APPROVED: 'yes, 2026-10-26T09:00:00Z', ...over,
});
const semLock = () => assert.ok(!existsSync(join(P, 'learnings', '.lock')), 'learnings/.lock ficou para trás (tem de ser apagado no fim, mesmo em erro)');
// Uma recusa: saída 1, as falhas na saída, os mesmos sha256 em learnings/, CLAUDE.md e AGENTS.md, e sem lock
const esperaRecusa = (obj, ...trechos) => {
  const antes = fotografia(P);
  const r = learn(P, ['add', '--json', jsonDe(obj)]);
  assert.equal(r.status, 1, 'uma entrada recusada sai com 1:\n' + r.out);
  for (const t of trechos) assert.ok(r.out.includes(t), `a saída não nomeia «${t}»:\n${r.out}`);
  assert.deepEqual(fotografia(P), antes, 'a recusa escreveu no registo (os sha256 mudaram)');
  semLock();
  return r;
};

test('C1 [ataque]: acrescenta ao mês do DATE com o id a seguir ao maior de TODOS os AAAA-MM.md (E-005) e escreve exatamente a golden', () => {
  partida();
  const antes = ler(P, 'learnings/2026-10.md'), set = fotografia(P)['learnings/2026-09.md'];
  const r = learn(P, ['add', '--json', jsonDe(NOVA)]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.linhas, ['added E-005 to learnings/2026-10.md'], 'a saída do add');
  assert.equal(ler(P, 'learnings/2026-10.md'), antes + '\n' + GOLDEN('E-005'), 'o texto escrito não é a golden (ou mexeu no que já lá estava)');
  assert.equal(fotografia(P)['learnings/2026-09.md'], set, 'o add mexeu noutro mês');
  semLock();
  esperaLinha(check(P), L_FORMA, 'ok');
});

test('C1 [ataque]: o README.md não é registo (a armadilha `## E-099` não conta para o id)', () => {
  partida();
  const r = learn(P, ['add', '--json', jsonDe(NOVA)]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /added E-005 to learnings\/2026-10\.md/, 'o id veio do README.md (E-100) ou não é E-005');
});

test('C1 [ataque]: um mês sem ficheiro: cria learnings/2026-11.md com `# Learnings 2026-11`, em LF, igual à golden', () => {
  partida();
  const r = learn(P, ['add', '--json', jsonDe(NOV)]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.linhas, ['added E-005 to learnings/2026-11.md']);
  assert.equal(bytes(P, 'learnings/2026-11.md').toString('utf8'), NOV_GOLDEN, 'o ficheiro novo não é a golden (cabeçalho, LF, sem BOM)');
  semLock();
  esperaLinha(check(P), L_FORMA, 'ok');
});

test('C1 [ataque]: um registo só com o README.md dá E-001', () => {
  registo(P, {});
  const r = learn(P, ['add', '--json', jsonDe(NOV)]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.linhas, ['added E-001 to learnings/2026-11.md']);
  assert.equal(ler(P, 'learnings/2026-11.md'), NOV_GOLDEN.replace('## E-005', '## E-001'));
});

test('C1 [ataque]: uma entrada que o validate recusa (enum, APPROVED, caminho, escada) sai com 1, com as falhas, e nada muda', () => {
  partida();
  esperaRecusa({ ...NOVA, TRIGGER: 'bogus' }, 'TRIGGER', '"bogus"');
  esperaRecusa({ ...NOV, TRIGGER: 'bogus' }, 'TRIGGER'); // o mês novo: o ficheiro 2026-11.md não pode nascer
  assert.ok(!existsSync(join(P, 'learnings', '2026-11.md')), 'a recusa criou learnings/2026-11.md');
  esperaRecusa(TEXTO('a rule without the approval of the user', { APPROVED: undefined }), 'APPROVED');
  esperaRecusa({ ...NOVA, 'PREVENTION-PATH': 'tests/learn/nao-existe.test.mjs' }, 'PREVENTION-PATH', 'does not exist');
  esperaRecusa({ ...NOV, CLASS: 'a-a' }, 'recurred'); // a-a já tem test (E-001): a recorrência tem de ficar em test, e memory desceria
  esperaRecusa({ ...NOV, CLASS: 'b-b', PREVENTION: 'memory' }, 'recurred'); // b-b já tem memory: a mesma camada não sobe
});

test('C1 [ataque]: uma regra text cujo SYMPTOM contém um título de invariante sai com 1 e «the rule repeats invariant <n>», sem escrever', () => {
  partida();
  esperaRecusa(TEXTO('The spec rules were skipped by the developer'), REPETE(1));
  esperaRecusa(TEXTO('the agent left the Live panel without an end event'), REPETE(8));
  esperaRecusa(TEXTO('Operating rules ignored: a test ran in the background'), REPETE(12));
});

test('C1 [ataque]: o mesmo SYMPTOM com outra camada (memory) não é uma regra de texto: é acrescentado (sem alarme falso)', () => {
  partida();
  const r = learn(P, ['add', '--json', jsonDe({ ...NOV, DATE: '2026-10-27', 'REVIEW-BY': '2026-11-10', SYMPTOM: 'The spec rules were skipped by the developer' })]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /added E-005 to learnings\/2026-10\.md/);
});

test('C1 [ataque]: com learnings/.lock presente sai com 3 e «learnings: busy, try again», sem escrever e sem apagar o lock alheio', () => {
  partida();
  writeFileSync(join(P, 'learnings', '.lock'), 'outro processo\n');
  const antes = fotografia(P);
  try {
    const r = learn(P, ['add', '--json', jsonDe(NOVA)]);
    assert.equal(r.status, 3, r.out);
    assert.ok(r.out.includes(BUSY), r.out);
    assert.deepEqual(fotografia(P), antes, 'com o lock presente o add escreveu (ou apagou o lock de outro processo)');
  } finally { apaga(join(P, 'learnings', '.lock')); }
});

test('C1 [ataque]: 8 processos `add` em paralelo dão ids distintos ou saídas 3, nunca um id repetido, e o check fica ok', async () => {
  for (let ronda = 0; ronda < 2; ronda++) {
    registo(P, { '2026-10.md': ficheiro('2026-10', [out10(1, 'memory', { CLASS: 'a-a' }), out10(2, 'memory', { CLASS: 'b-b' })]) });
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => learnAsync(P, ['add', '--json', jsonDe({ ...NOV, DATE: '2026-10-20', 'REVIEW-BY': '2026-11-03', CLASS: 'race-' + i })])));
    const ids = [];
    for (const r of rs) {
      assert.ok(r.status === 0 || r.status === 3, `saída ${r.status} (só 0 ou 3):\n${r.out}`);
      if (r.status === 3) { assert.ok(r.out.includes(BUSY), r.out); continue; }
      const m = r.out.match(/added (E-\d{3,}) to learnings\/2026-10\.md/);
      assert.ok(m, r.out);
      ids.push(m[1]);
    }
    assert.ok(ids.length >= 1, 'nenhum dos 8 conseguiu acrescentar');
    assert.equal(new Set(ids).size, ids.length, 'id repetido entre os add: ' + ids.join(', '));
    const heads = ler(P, 'learnings/2026-10.md').split(/\r?\n/).filter((l) => l.startsWith('## '));
    assert.deepEqual([...heads].sort(), ['E-001', 'E-002', ...ids].map((x) => '## ' + x).sort(), 'o ficheiro não tem exatamente as entradas antigas e as que o add anunciou');
    semLock();
    esperaLinha(check(P), L_FORMA, 'ok');
  }
});

test('C1 [ataque]: num ficheiro com BOM e CRLF, os bytes antigos ficam como prefixo e o que se acrescenta usa CRLF', () => {
  const crlf = Buffer.from('\uFEFF' + OUT.replace(/\n/g, '\r\n'), 'utf8');
  registo(P, { '2026-09.md': SET, '2026-10.md': crlf });
  const r = learn(P, ['add', '--json', jsonDe(NOVA)]);
  assert.equal(r.status, 0, r.out);
  const novo = bytes(P, 'learnings/2026-10.md');
  assert.ok(novo.subarray(0, crlf.length).equals(crlf), 'o add reescreveu os bytes que já existiam (o BOM ou os CRLF)');
  const resto = novo.subarray(crlf.length).toString('utf8');
  assert.ok(!/(^|[^\r])\n/.test(resto), 'o texto acrescentado num ficheiro CRLF tem LF sozinhos:\n' + JSON.stringify(resto.slice(0, 120)));
  assert.equal(resto.replace(/\r\n/g, '\n'), '\n' + GOLDEN('E-005'), 'o texto acrescentado não é a golden');
  esperaLinha(check(P), L_FORMA, 'ok');
});

test('C1 [ataque]: num ficheiro sem fim de linha final, a última entrada não é corrompida (o STATUS dela fica igual)', () => {
  const semFim = OUT.replace(/\n$/, '');
  registo(P, { '2026-09.md': SET, '2026-10.md': semFim });
  const r = learn(P, ['add', '--json', jsonDe(NOVA)]);
  assert.equal(r.status, 0, r.out);
  const novo = ler(P, 'learnings/2026-10.md');
  assert.ok(novo.startsWith(semFim), 'o add reescreveu os bytes que já existiam');
  assert.ok(novo.split('\n').includes('- STATUS: prevented'), 'a linha STATUS de E-002 foi colada à entrada nova');
  assert.ok(novo.split('\n').includes('## E-005'), 'o cabeçalho da entrada nova não ficou numa linha própria');
  esperaLinha(check(P), L_FORMA, 'ok');
});

test('C1 [ataque]: aceita `--today X` e `--today=X` (o mesmo relógio do check)', () => {
  partida();
  const a = learn(P, ['add', '--json', jsonDe(NOVA), '--today', '2026-10-31']);
  assert.equal(a.status, 0, a.out);
  assert.match(a.out, /added E-005 to learnings\/2026-10\.md/);
  const b = learn(P, ['add', '--today=2026-10-31', '--json', jsonDe({ ...NOVA, CLASS: 'lock-left-again' })]);
  assert.equal(b.status, 0, b.out);
  assert.match(b.out, /added E-006 to learnings\/2026-10\.md/);
});