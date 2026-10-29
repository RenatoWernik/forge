// F-06 critério 6 (e «todo o corpus em All ok.» do recorte): as verificações de língua e de estilo cobrem os briefs e o
// `.checkpoints/README.md`.
// Oráculo:
//   - mutação do ticket: num projeto em português, cada brief por traduzir faz falhar a linha «language» (rigorous e accelerated);
//     o mesmo para o .checkpoints/README.md por traduzir;
//   - a mesma regra no sentido inverso: num projeto em inglês, um brief ou o README que não está em inglês faz falhar «language»;
//   - com plainStyle, um travessão num brief ou no README faz falhar a linha «style» (en e pt);
//   - cada conjunto de respostas do corpus gera os 4 briefs e o README e, com os documentos, os briefs e o README «traduzidos» nos
//     projetos em português, passa o check.cjs com «All ok.».
// DEPENDE DO F-05 só no último teste: o AGENTS.md do F-05 também é «traduzido» quando existe (antes do F-05 não existe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ANSWERS, ANSWERS_PT, ROLES, README, generate, briefsByRole, check, lineState, fails, translatePt, loadCorpus } from './helpers.mjs';

// Troca o ficheiro, corre o check.cjs e repõe o original; devolve o estado da linha e o status
const mutate = (dest, rel, fn, line) => {
  const f = join(dest, rel), orig = readFileSync(f, 'utf8');
  const text = fn(orig);
  assert.notEqual(text, orig, `a mutação não mudou ${rel}`);
  writeFileSync(f, text);
  const r = check(dest);
  writeFileSync(f, orig);
  return { state: lineState(r.out, line), status: r.status, out: r.out };
};
const targets = (dest) => { const by = briefsByRole(dest); return [...ROLES.map((r) => by[r]), README]; };

for (const mode of ['rigorous', 'accelerated']) {
  test(`C7 mutação (pt, ${mode}): cada brief e o README por traduzir num projeto em português fazem falhar a linha «language»`, async () => {
    const { dest, raw } = await generate(ANSWERS_PT({ mode }));
    const all = targets(dest);
    const before = check(dest);
    assert.equal(lineState(before.out, 'language'), 'ok', 'pré-condição: a linha «language» está ok no projeto traduzido\n' + fails(before.out));
    const bad = all.map((rel) => [rel, mutate(dest, rel, () => raw[rel], 'language')]).filter(([, r]) => r.state !== 'FAIL' || r.status !== 1).map(([rel, r]) => `${rel}: language ${r.state}, status ${r.status}`);
    assert.deepEqual(bad, [], 'ficheiros por traduzir que a linha «language» não apanha');
  });
}

test('C7 mutação (en): um brief ou o README que não está em inglês num projeto em inglês faz falhar a linha «language»', async () => {
  const { dest } = await generate(ANSWERS());
  const bad = targets(dest).map((rel) => [rel, mutate(dest, rel, translatePt, 'language')]).filter(([, r]) => r.state !== 'FAIL' || r.status !== 1).map(([rel, r]) => `${rel}: language ${r.state}, status ${r.status}`);
  assert.deepEqual(bad, [], 'ficheiros fora da língua que a linha «language» não apanha');
});

for (const [name, answers] of [['en', ANSWERS({ plainStyle: true })], ['pt', ANSWERS_PT({ plainStyle: true })]]) {
  test(`C7 mutação (${name}, plainStyle): um travessão num brief ou no README faz falhar a linha «style»`, async () => {
    const { dest } = await generate(answers);
    const before = check(dest);
    assert.equal(lineState(before.out, 'style'), 'ok', 'pré-condição: a linha «style» está ok\n' + fails(before.out));
    const bad = targets(dest).map((rel) => [rel, mutate(dest, rel, (t) => t.replace(/\s*$/, '\n') + '\nOne more rule — with a dash.\n', 'style')]).filter(([, r]) => r.state !== 'FAIL' || r.status !== 1).map(([rel, r]) => `${rel}: style ${r.state}, status ${r.status}`);
    assert.deepEqual(bad, [], 'travessões que a linha «style» não apanha');
  });
}

test('C7: cada conjunto de respostas do corpus gera os 4 briefs e o README e passa o check.cjs com «All ok.»', async () => {
  const sets = loadCorpus('answers');
  assert.ok(sets.length >= 8, 'conjuntos: ' + sets.length);
  const bad = [];
  for (const s of sets) {
    let g;
    try { g = await generate(s.value); } catch (e) { bad.push(`${s.name}: o scaffold recusou (${String(e.message).split('\n').slice(0, 3).join(' ')})`); continue; }
    try { briefsByRole(g.dest); } catch (e) { bad.push(`${s.name}: ${e.message}`); }
    if (!existsSync(join(g.dest, README))) bad.push(`${s.name}: sem ${README}`);
    const r = check(g.dest);
    if (r.status !== 0 || !/All ok\./.test(r.out)) bad.push(`${s.name}:\n${fails(r.out)}`);
  }
  assert.deepEqual(bad, []);
});
