// F-23b, C3 (D5): o corpus comportamental do crítico em scripts/corpus/critico/<caso>/ (contract.json, piece/, expect.json,
// proof.test.mjs). Oráculo do corpo da #78: cada proof.test.mjs corre contra o piece/ do seu caso; nos casos defect a prova FALHA, nos
// clean PASSA; cada expect.json valida contra o formato; há pelo menos 4 e 4. Os defect citam a issue de origem em expect.json › source.
// Leituras (confirmadas na resposta 8 do orquestrador na #78, salvo a do contract.json):
//   - a prova corre com `node --test proof.test.mjs` numa cópia da pasta do caso (cwd = a cópia), por isso só pode chegar ao piece/ por
//     caminhos relativos ao próprio caso; o corpus do repositório nunca é escrito;
//   - «a prova falha» pelo motivo certo: uma asserção que falha, nunca um módulo em falta nem um erro de sintaxe;
//   - contract.json valida com o bloco contract:begin/contract:end do gauntlet-build.js (os campos «como nos args de uma peça»), e o
//     criterion C<n> de expect.json aponta para um critério que existe nesse contrato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CRITICO, cases, expectOf, readJson, runProof, contractProblems, KEBAB } from './helpers.mjs';

const kinds = () => cases().map((c) => [c, existsSync(join(CRITICO, c, 'expect.json')) ? expectOf(c) : null]);

test('C3 [ataque]: scripts/corpus/critico/ tem pelo menos 4 casos defect e 4 casos clean', () => {
  const ks = kinds();
  const d = ks.filter(([, e]) => e?.kind === 'defect').length, c = ks.filter(([, e]) => e?.kind === 'clean').length;
  assert.ok(d >= 4, `${d} casos defect em ${CRITICO}`);
  assert.ok(c >= 4, `${c} casos clean em ${CRITICO}`);
});

test('C3 [ataque]: cada caso tem contract.json, piece/ (com ficheiros), expect.json e proof.test.mjs', () => {
  const cs = cases();
  assert.ok(cs.length >= 8, `${cs.length} casos em ${CRITICO}`);
  for (const c of cs) {
    const d = join(CRITICO, c);
    for (const f of ['contract.json', 'expect.json', 'proof.test.mjs']) assert.ok(existsSync(join(d, f)) && statSync(join(d, f)).isFile(), `${c}: falta ${f}`);
    assert.ok(existsSync(join(d, 'piece')) && statSync(join(d, 'piece')).isDirectory() && readdirSync(join(d, 'piece')).length > 0, `${c}: piece/ em falta ou vazio`);
  }
});

test('C3 [ataque]: cada expect.json valida contra o formato {kind: defect | clean, criterion?: C<n>, class?: kebab}, e cada defect cita a issue em source', () => {
  const cs = cases();
  assert.ok(cs.length >= 8, `${cs.length} casos`);
  for (const c of cs) {
    const e = expectOf(c), at = `${c}/expect.json`;
    assert.ok(e && typeof e === 'object' && !Array.isArray(e), `${at}: não é um objeto`);
    assert.ok(['defect', 'clean'].includes(e.kind), `${at}: kind ${JSON.stringify(e.kind)}`);
    if (e.criterion !== undefined) assert.match(String(e.criterion), /^C[1-9]\d*$/, `${at}: criterion`);
    if (e.class !== undefined) assert.match(String(e.class), KEBAB, `${at}: class não é kebab-case`);
    if (e.kind === 'defect') assert.match(String(e.source ?? ''), /^#?[1-9]\d*$/, `${at}: um caso defect cita a issue de origem em source (o número da issue)`);
  }
});

test('C3 [ataque]: cada contract.json tem os campos do contrato como nos args de uma peça (valida com o bloco contract do gauntlet-build.js) e o criterion do expect.json existe nele', () => {
  const cs = cases();
  assert.ok(cs.length >= 8, `${cs.length} casos`);
  for (const c of cs) {
    const k = readJson(join(CRITICO, c, 'contract.json'));
    const errs = contractProblems({ id: c, ...k });
    assert.deepEqual(errs, [], `${c}/contract.json`);
    const e = expectOf(c), m = /^C([1-9]\d*)$/.exec(String(e.criterion ?? ''));
    if (m) assert.ok(Number(m[1]) <= k.criteria.length, `${c}: expect.json › criterion ${e.criterion} não existe no contract.json (${k.criteria.length} critérios)`);
  }
});

test('C3 [ataque]: cada prova comporta-se como declara: nos casos defect falha por uma asserção, nos clean passa', () => {
  const ks = kinds();
  assert.ok(ks.filter(([, e]) => e?.kind === 'defect').length >= 4 && ks.filter(([, e]) => e?.kind === 'clean').length >= 4, 'menos de 4 e 4 casos');
  for (const [c, e] of ks) {
    const r = runProof(c), tail = r.out.slice(-1500);
    if (e.kind === 'defect') {
      assert.notEqual(r.status, 0, `${c} (defect): a prova passa contra o piece/ do caso:\n${tail}`);
      assert.doesNotMatch(r.out, /ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/, `${c} (defect): a prova falha por um módulo em falta ou um erro de sintaxe, não pelo defeito:\n${tail}`);
      assert.match(r.out, /ERR_ASSERTION|AssertionError/, `${c} (defect): a prova não falha numa asserção:\n${tail}`);
    } else {
      assert.equal(r.status, 0, `${c} (clean): a prova falha contra o piece/ do caso:\n${tail}`);
      assert.match(r.out, /^# pass [1-9]\d*$/m, `${c} (clean): nenhum teste passou (prova vazia?):\n${tail}`);
      assert.match(r.out, /^# fail 0$/m, `${c} (clean):\n${tail}`);
    }
  }
});