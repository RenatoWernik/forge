// F-22b critério 2, a linha nova do check.cjs `learnings: the Learned rules block matches the register`: FAIL quando o bloco difere do que o readout
// produziria, passa das 12 linhas ou difere entre o CLAUDE.md e o AGENTS.md; sem learnings/ (ou só com o README.md) e sem o bloco, ok.
// A linha nova tem uma mutação em scripts/corpus/mutations/ que a passa de ok a FAIL (exige-o o c5 do f-23a-r0; o corpus.test.mjs corre-a).
// Oráculos: mudar à mão uma linha do bloco dá FAIL e repor com o readout dá ok; o registo que avança sem readout dá FAIL; sem alarme falso.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, projeto, check, linha, apaga, ficheiro, out10, registo, learn, ler, esperaOk, esperaLinha, blocoDe, L_BLOCO, INI, FIM, CAB, ROD, SECAO } from './helpers.mjs';
import { R3, G3, EXTRA } from './registos.mjs';

let P;
const ORIG = {};
before(async () => { P = await projeto(); for (const f of ['CLAUDE.md', 'AGENTS.md']) ORIG[f] = ler(P, f); });
after(() => apaga(P));
const limpo = (ficheiros, opts) => { for (const [f, t] of Object.entries(ORIG)) writeFileSync(join(P, f), t); registo(P, ficheiros, opts); };
const readout = () => { const r = learn(P, ['readout']); assert.equal(r.status, 0, 'readout:\n' + r.out); };
const troca = (f, de, para) => { const t = ler(P, f); assert.ok(t.includes(de), `${f} não tem «${de}»`); writeFileSync(join(P, f), t.replace(de, () => para)); };
const LINHA4 = G3[2];

test('C2 [ataque]: sem learnings/ e sem bloco, a linha existe e fica ok (sem alarme falso)', () => {
  limpo(null);
  esperaOk(check(P), L_BLOCO);
});

test('C2 [ataque]: só com o learnings/README.md e sem bloco, a linha fica ok', () => {
  limpo({});
  esperaOk(check(P), L_BLOCO);
});

// RESPOSTA 6554223028, ponto 2: a linha só se aplica a projetos com .claude/learn.mjs; nesses, regras ativas sem bloco dão FAIL; sem learn.mjs, ok com «n/a»
test('C2 [ataque]: com .claude/learn.mjs, um registo com regras ativas e sem bloco em nenhum dos dois ficheiros dá FAIL', () => {
  limpo(R3);
  assert.ok(existsSync(join(P, '.claude/learn.mjs')), 'o projeto gerado não tem .claude/learn.mjs');
  esperaLinha(check(P), L_BLOCO, 'FAIL');
});

test('C2 [ataque]: sem .claude/learn.mjs (um projeto de antes do F-22b), o mesmo registo sem bloco dá ok com «n/a»', async () => {
  const Q = await projeto();
  try {
    registo(Q, R3);
    rmSync(join(Q, '.claude/learn.mjs'), { force: true });
    const r = check(Q);
    esperaLinha(r, L_BLOCO, 'ok');
    assert.ok(linha(r, L_BLOCO).includes('n/a'), 'a linha não diz «n/a»:\n' + linha(r, L_BLOCO));
  } finally { apaga(Q); }
});
test('C2 [ataque]: mudar à mão uma linha do bloco (nos dois ficheiros) dá FAIL; repor com o readout dá ok', () => {
  limpo(R3);
  readout();
  esperaOk(check(P), L_BLOCO);
  for (const f of ['CLAUDE.md', 'AGENTS.md']) troca(f, LINHA4, LINHA4.replace('the graph was built', 'the graph was rebuilt'));
  esperaLinha(check(P), L_BLOCO, 'FAIL');
  readout();
  esperaOk(check(P), L_BLOCO);
});

test('C2 [ataque]: o bloco do AGENTS.md diferente do do CLAUDE.md dá FAIL (uma linha mudada, ou o bloco ausente num deles)', () => {
  limpo(R3);
  readout();
  troca('AGENTS.md', LINHA4, LINHA4.replace('last commit', 'first commit'));
  esperaLinha(check(P), L_BLOCO, 'FAIL');
  readout();
  const t = ler(P, 'AGENTS.md'), b = blocoDe(t);
  writeFileSync(join(P, 'AGENTS.md'), ORIG['AGENTS.md']); // o AGENTS.md sem o bloco, o CLAUDE.md com o bloco certo
  assert.ok(b && blocoDe(ler(P, 'CLAUDE.md')));
  esperaLinha(check(P), L_BLOCO, 'FAIL');
});

test('C2 [ataque]: o registo ganha uma regra ativa sem novo readout: o bloco ficou antigo e dá FAIL; o readout repõe o ok', () => {
  limpo(R3);
  readout();
  appendFileSync(join(P, 'learnings', '2026-10.md'), '\n' + EXTRA(8));
  esperaLinha(check(P), L_BLOCO, 'FAIL');
  readout();
  esperaOk(check(P), L_BLOCO);
});

test('C2 [ataque]: uma regra que deixa de estar ativa (STATUS prevented) sem novo readout dá FAIL', () => {
  limpo(R3);
  readout();
  const f = join(P, 'learnings', '2026-10.md'), t = readFileSync(f, 'utf8');
  writeFileSync(f, t.replace('- STATUS: recurred', '- STATUS: prevented'));
  esperaLinha(check(P), L_BLOCO, 'FAIL');
});

test('C2 [ataque]: um bloco com 13 linhas (11 regras sem o corte) nos dois ficheiros dá FAIL; o readout deixa 12, a última `+1 more`', () => {
  const regras = Array.from({ length: 11 }, (_, i) => out10(i + 1, 'text', { CLASS: 'r-' + (i + 1), SYMPTOM: 'rule ' + (i + 1), STATUS: 'open' }));
  limpo({ '2026-10.md': ficheiro('2026-10', regras) });
  const treze = [CAB, ...regras.map((_, i) => `- E-${String(i + 1).padStart(3, '0')} \`r-${i + 1}\`: rule ${i + 1} (learnings/2026-10.md)`), ROD];
  assert.equal(treze.length, 13);
  for (const f of ['CLAUDE.md', 'AGENTS.md']) writeFileSync(join(P, f), ORIG[f].replace(/\s+$/, '') + '\n\n' + SECAO + '\n\n' + INI + '\n' + treze.join('\n') + '\n' + FIM + '\n');
  esperaLinha(check(P), L_BLOCO, 'FAIL');
  readout();
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    const b = blocoDe(ler(P, f));
    assert.equal(b.linhas.length, 12, f + ': o readout não cortou a 12 linhas');
    assert.equal(b.linhas[11], '+1 more in learnings/; register and counts: `node .claude/learn.mjs report`.');
    assert.equal(b.linhas[1], '- E-002 `r-2`: rule 2 (learnings/2026-10.md)', f + ': ficaram as mais antigas em vez das mais recentes');
  }
  esperaOk(check(P), L_BLOCO);
});

test('C2 [ataque]: a linha nova tem no corpus (scripts/corpus/mutations/) uma mutação com `line` igual ao seu nome', () => {
  const dir = join(ROOT, 'scripts/corpus/mutations');
  const ms = readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => ({ n, ...JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^\uFEFF/, '')) }));
  const minhas = ms.filter((m) => m.line === L_BLOCO);
  assert.ok(minhas.length >= 1, 'nenhuma mutação do corpus tem line = «' + L_BLOCO + '»');
  for (const m of minhas) for (const k of ['base', 'file', 'find', 'replace']) assert.equal(typeof m[k], 'string', `${m.n}: falta ${k}`);
});