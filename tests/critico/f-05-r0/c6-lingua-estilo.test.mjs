// F-05 critérios 6 do ticket (e 5 do recorte) e «todo o corpus em All ok.»: as verificações de língua e de estilo cobrem o AGENTS.md.
// Oráculo:
//   - mutação do ticket: num projeto em português, um AGENTS.md por traduzir faz falhar a linha «language» (rigorous e accelerated);
//   - a mesma regra no sentido inverso: num projeto em inglês, um AGENTS.md que não está em inglês faz falhar a linha «language»;
//   - com plainStyle, um travessão no AGENTS.md faz falhar a linha «style» (en e pt);
//   - cada conjunto de respostas do corpus gera um AGENTS.md e, com os 4 documentos «traduzidos» nos projetos em português, passa o
//     check.cjs com «All ok.».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ANSWERS, ANSWERS_PT, generate, check, lineState, fails, edit, translatePt, loadCorpus } from './helpers.mjs';

for (const mode of ['rigorous', 'accelerated']) {
  test(`C6 mutação (pt, ${mode}): um AGENTS.md por traduzir num projeto em português faz falhar a linha «language»`, async () => {
    const { dest, raw } = await generate(ANSWERS_PT({ mode }));
    assert.equal(typeof raw['AGENTS.md'], 'string', 'o scaffold não gerou AGENTS.md');
    const before = check(dest);
    assert.equal(lineState(before.out, 'language'), 'ok', 'pré-condição: a linha «language» está ok no projeto traduzido\n' + fails(before.out));
    edit(dest, 'AGENTS.md', () => raw['AGENTS.md']);
    const r = check(dest);
    assert.equal(lineState(r.out, 'language'), 'FAIL', fails(r.out));
    assert.equal(r.status, 1);
  });
}

test('C6 mutação (en): um AGENTS.md que não está em inglês num projeto em inglês faz falhar a linha «language»', async () => {
  const { dest, raw } = await generate(ANSWERS());
  assert.equal(typeof raw['AGENTS.md'], 'string', 'o scaffold não gerou AGENTS.md');
  edit(dest, 'AGENTS.md', (t) => translatePt(t));
  const r = check(dest);
  assert.equal(lineState(r.out, 'language'), 'FAIL', fails(r.out));
  assert.equal(r.status, 1);
});

for (const [name, answers] of [['en', ANSWERS({ plainStyle: true })], ['pt', ANSWERS_PT({ plainStyle: true })]]) {
  test(`C6 mutação (${name}, plainStyle): um travessão no AGENTS.md faz falhar a linha «style»`, async () => {
    const { dest } = await generate(answers);
    assert.ok(existsSync(join(dest, 'AGENTS.md')), 'o scaffold não gerou AGENTS.md');
    const before = check(dest);
    assert.equal(lineState(before.out, 'style'), 'ok', 'pré-condição: a linha «style» está ok\n' + fails(before.out));
    edit(dest, 'AGENTS.md', (t) => t.replace(/\s*$/, '\n') + '\nOne more rule — with a dash.\n');
    const r = check(dest);
    assert.equal(lineState(r.out, 'style'), 'FAIL', fails(r.out));
    assert.equal(r.status, 1);
  });
}

test('C6: cada conjunto de respostas do corpus gera um AGENTS.md e passa o check.cjs com «All ok.»', async () => {
  const sets = loadCorpus('answers');
  assert.ok(sets.length >= 8, 'conjuntos: ' + sets.length);
  const bad = [];
  for (const s of sets) {
    let g;
    try { g = await generate(s.value); } catch (e) { bad.push(`${s.name}: o scaffold recusou (${String(e.message).split('\n').slice(0, 3).join(' ')})`); continue; }
    if (g.raw['AGENTS.md'] === undefined) bad.push(`${s.name}: sem AGENTS.md`);
    const r = check(g.dest);
    if (r.status !== 0 || !/All ok\./.test(r.out)) bad.push(`${s.name}:\n${fails(r.out)}`);
  }
  assert.deepEqual(bad, []);
});
