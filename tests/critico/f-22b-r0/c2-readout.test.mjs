// F-22b critério 2: `readout` escreve no fim do CLAUDE.md e do AGENTS.md (na zona de blocos gerados) a secção `## Learned rules` com o bloco entre
// `<!-- forge:learnings:start -->` e `<!-- forge:learnings:end -->`: o cabeçalho literal, uma linha por regra ativa (PREVENTION text, STATUS open ou
// recurred, por ordem de id, SYMPTOM cortado a 100 caracteres), `- none` sem nenhuma, e a linha do relatório; no máximo 12 linhas (registos.mjs).
// Um segundo readout dá os mesmos bytes e o resto dos dois ficheiros não muda. RESPOSTA 6552729846: aceita `--today=X` e `--today X`.
// Oráculos: goldens com 0, 3 e 14 regras ativas; o texto fora do bloco byte a byte; SYMPTOMs hostis (padrões de replace e o marcador de fim).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projeto, check, apaga, ficheiro, out10, registo, learn, fotografia, ler, blocoDe, esperaBloco, esperaOk, L_BLOCO, INI, FIM, CAB, ROD } from './helpers.mjs';
import { R0, G0, R3, G3, R14, G14, EXTRA } from './registos.mjs';

let P;
const ORIG = {};
before(async () => { P = await projeto(); for (const f of ['CLAUDE.md', 'AGENTS.md']) ORIG[f] = ler(P, f); });
after(() => apaga(P));
// cada teste parte dos dois ficheiros como o scaffold os gerou
const limpo = (ficheiros) => { for (const [f, t] of Object.entries(ORIG)) writeFileSync(join(P, f), t); registo(P, ficheiros); };
const readout = (...extra) => { const r = learn(P, ['readout', ...extra]); assert.equal(r.status, 0, 'readout:\n' + r.out); return r; };

for (const [nome, reg, gold] of [['0 regras ativas: a única linha do meio é `- none`', R0, G0], ['3 regras ativas entre 4 que não o são, em dois meses, com o corte a 100', R3, G3], ['14 regras ativas: 12 linhas, as 10 mais recentes e `+4 more`', R14, G14]]) {
  test(`C2 [ataque]: readout com ${nome}: o bloco é a golden, igual nos dois ficheiros, e o check fica ok`, () => {
    limpo(reg);
    readout();
    esperaBloco(P, gold);
    assert.ok(gold.length <= 12);
    esperaOk(check(P), L_BLOCO);
  });
}

test('C2 [ataque]: o resto dos dois ficheiros não muda: o texto do scaffold fica como prefixo e depois do bloco só há o fim de linha', () => {
  limpo(R3);
  readout();
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    const t = ler(P, f), b = blocoDe(t);
    assert.ok(b, f + ' sem bloco');
    assert.ok(t.startsWith(ORIG[f].replace(/\s+$/, '')), f + ': o readout mexeu no texto que já existia');
    assert.match(b.antes.slice(ORIG[f].replace(/\s+$/, '').length), /^\s*## Learned rules\s*$/, f + ': entre o texto antigo e o bloco só pode estar o cabeçalho da secção');
    assert.match(b.depois, /^\s*$/, f + ': há texto depois do marcador de fim');
  }
});

test('C2 [ataque]: um segundo readout dá os mesmos bytes e o readout nunca escreve em learnings/', () => {
  limpo(R14);
  const reg = fotografia(P);
  readout();
  const um = fotografia(P);
  readout();
  assert.deepEqual(fotografia(P), um, 'o segundo readout mudou os bytes');
  for (const k of Object.keys(reg).filter((k) => k.startsWith('learnings/'))) assert.equal(um[k], reg[k], 'o readout escreveu em ' + k);
});

test('C2 [ataque]: com o bloco já escrito e texto DEPOIS dele (um instalador acrescentou), o readout troca só o bloco, no sítio', () => {
  limpo(R3);
  readout();
  const tail = '\n## graphify\n\nThis block was appended by the graphify installer after the learned rules, and it stays exactly as it is.\n';
  for (const f of ['CLAUDE.md', 'AGENTS.md']) appendFileSync(join(P, f), tail);
  const antes = Object.fromEntries(['CLAUDE.md', 'AGENTS.md'].map((f) => [f, blocoDe(ler(P, f))]));
  appendFileSync(join(P, 'learnings', '2026-10.md'), '\n' + EXTRA(8));
  readout();
  esperaBloco(P, [...G3.slice(0, -1), '- E-008 `extra-8`: an extra rule 8 (learnings/2026-10.md)', ROD]);
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    const b = blocoDe(ler(P, f));
    assert.equal(b.antes, antes[f].antes, f + ': o texto antes do bloco mudou');
    assert.equal(b.depois, antes[f].depois, f + ': o texto depois do bloco (o do instalador) mudou ou foi apagado');
  }
});

test('C2 [ataque]: um SYMPTOM com `$&`, `$\'`, `$1` e `$$` aparece literal no bloco', () => {
  const S = "price $& and $' and $1 and $$ stay literal";
  limpo({ '2026-10.md': ficheiro('2026-10', [out10(1, 'text', { CLASS: 'dollar-signs', SYMPTOM: S, STATUS: 'open' })]) });
  readout();
  esperaBloco(P, [CAB, '- E-001 `dollar-signs`: ' + S + ' (learnings/2026-10.md)', ROD]);
});

test('C2 [ataque]: um SYMPTOM com o marcador de fim não parte o bloco: o segundo readout dá os mesmos bytes, nada fora muda e o check fica ok', () => {
  limpo({ '2026-10.md': ficheiro('2026-10', [out10(1, 'text', { CLASS: 'marker-in-text', SYMPTOM: 'the text ' + FIM + ' then ' + INI + ' ended the block early', STATUS: 'open' })]) });
  readout();
  const um = fotografia(P);
  readout();
  readout();
  assert.deepEqual(fotografia(P), um, 'o readout não é idempotente com o marcador no SYMPTOM (o bloco cresce ou parte-se)');
  for (const f of ['CLAUDE.md', 'AGENTS.md']) assert.ok(ler(P, f).startsWith(ORIG[f].replace(/\s+$/, '')), f + ': o texto antigo mudou');
  esperaOk(check(P), L_BLOCO);
});

test('C2 [ataque]: aceita `--today X` e `--today=X` e escreve os mesmos bytes que sem ele', () => {
  limpo(R3);
  readout();
  const um = fotografia(P);
  readout('--today', '2026-10-31');
  assert.deepEqual(fotografia(P), um, '--today X mudou o bloco');
  readout('--today=2026-10-31');
  assert.deepEqual(fotografia(P), um, '--today=X mudou o bloco');
});