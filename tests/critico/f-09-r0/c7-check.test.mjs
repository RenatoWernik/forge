// F-09, a verificação `node .claude/check.cjs` dos critérios 1 a 4: os projetos gerados (2 línguas × 2 modos) têm o gauntlet-batch e
// ficam em «All ok.», e a simulação do check DÁ POR um lote que quebra o contrato (uma mutação que passa é um invariante sem
// verificação). Oráculo: mutações num projeto gerado. Cada uma acrescenta, logo a seguir ao meta do gauntlet-batch, um prelúdio que
// muda o comportamento sem tocar no código do dev (reescreve os args, ou embrulha o agent() e mexe no prompt ou na resposta do
// tester); o check tem de sair com 1. Um prelúdio neutro (controlo) tem de deixar o check em «All ok.».
// As mutações das respostas usam os nomes dos campos do tester de helpers.mjs (T; PERGUNTA 1).
// Depende do F-08: sim, no sentido do risco 2 da spec: o check.cjs inteiro tem de ficar verde com as linhas do build do F-08.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BATCH, MODES, T, ANSWERS, generate, check, fails, withPrelude, wrap } from './helpers.mjs';

for (const language of ['English', 'Portuguese']) {
  for (const mode of MODES) {
    test(`C7 corpus: um projeto gerado (${language}, ${mode}) tem o gauntlet-batch e fica em «All ok.»`, async () => {
      const { dest } = await generate(ANSWERS({ language, mode }));
      assert.ok(existsSync(join(dest, '.claude/workflows', BATCH)), 'o projeto gerado não tem .claude/workflows/gauntlet-batch.js');
      const r = check(dest);
      assert.equal(r.status, 0, fails(r.out));
      assert.match(r.out, /All ok\./);
    });
  }
}

const isTester = 'o && args && args.models && args.models.tester && o.model === args.models.tester.model && o.effort === args.models.tester.effort';
const onPrompt = (expr) => wrap(`(p, o) => __a(${isTester} ? ${expr} : p, o)`);
const onOpts = (expr) => wrap(`(p, o) => __a(p, ${isTester} ? ${expr} : o)`);
// a resposta do tester passa por f antes de chegar ao lote
const onAnswer = (f) => wrap(`async (p, o) => { const r = await __a(p, o); if (!(${isTester}) || !r || typeof r !== 'object') return r; const f = ${f}; return f(r) }`);
const mapFailures = (g) => `r => ({ ...r, ${T.runs}: (r.${T.runs} || []).map(x => ({ ...x, ${T.failures}: (x.${T.failures} || []).map(${g}) })) })`;
const PAD = `r => { const runs = [...(r.${T.runs} || [])]; for (const [k, n, c] of [['${T.suite}', 2, args.testCommand], ['${T.e2e}', args.e2eCommand ? 3 : 0, args.e2eCommand]]) while (runs.filter(x => x.${T.kind} === k).length < n) runs.push({ ${T.kind}: k, ${T.command}: c, ${T.failures}: [] }); return { ...r, ${T.runs}: runs } }`;

const MUTANTS = [
  ['controlo: prelúdio neutro no gauntlet-batch', wrap('(p, o) => __a(p, o)'), 0],
  ['C1: o lote corta as peças a 3 em vez de recusar', "if (args && Array.isArray(args.pieces)) args = { ...args, pieces: args.pieces.slice(0, 3) }", 1],
  ['C1: o lote ignora o mode (usa sempre o limite do accelerated)', "if (args) args = { ...args, mode: 'accelerated' }", 1],
  ['C1: o lote ignora o mode (usa sempre o limite do rigorous)', "if (args) args = { ...args, mode: 'rigorous' }", 1],
  ['C2: o tester corre com outro modelo', onOpts("{ ...o, model: 'zz-mutant' }"), 1],
  ['C2: o tester corre com outro esforço', onOpts("{ ...o, effort: o.effort === 'low' ? 'max' : 'low' }"), 1],
  ['C2: o testCommand sai do prompt do tester', onPrompt("String(p).split(String(args.testCommand)).join('')"), 1],
  ['C2: o e2eCommand sai do prompt do tester', onPrompt("args.e2eCommand ? String(p).split(String(args.e2eCommand)).join('') : p"), 1],
  ['C2: o lote deixa de contar as execuções (as que faltam são preenchidas sem falhas)', onAnswer(PAD), 1],
  ['C3: a atribuição perde os ficheiros do teste (files vazio)', onAnswer(mapFailures(`f => ({ ...f, ${T.files}: [] })`)), 1],
  ['C3: a atribuição troca a peça (os ficheiros do teste passam a ser os da 1.ª peça)', onAnswer(mapFailures(`f => ({ ...f, ${T.files}: [...((args.pieces[0] || {}).owns || [])] })`)), 1],
  ['C4: a repetição isolada é ignorada (todas passam)', onAnswer(`r => ({ ...r, ${T.isolated}: (r.${T.isolated} || []).map(x => ({ ...x, ${T.passed}: true })) })`), 1],
  ['C4: a repetição isolada é ignorada (nenhuma passa)', onAnswer(`r => ({ ...r, ${T.isolated}: (r.${T.isolated} || []).map(x => ({ ...x, ${T.passed}: false })) })`), 1],
  ['C4 (R3, R6): a prova na main é ignorada (o lote apaga-a)', onAnswer(`r => ({ ...r, ${T.main}: [] })`), 1],
  ['C4 (R3, R6): a prova na main é lida ao contrário (cada resultado invertido)', onAnswer(`r => ({ ...r, ${T.main}: (r.${T.main} || []).map(x => ({ ...x, ${T.results}: (x.${T.results} || []).map(y => !y) })) })`), 1],
  ['C4: o diff é ignorado (todos os testes passam a tocar só fora do lote)', onAnswer(mapFailures(`f => ({ ...f, ${T.files}: ['zz-outside/x.test.mjs'] })`)), 1],
];

for (const [label, prelude, code] of MUTANTS) {
  test(`C7 mutação → check ${code ? 'falha' : '«All ok.»'}: ${label}`, async () => {
    const { dest } = await generate(ANSWERS());
    withPrelude(dest, BATCH, prelude);
    const r = check(dest);
    assert.equal(r.status, code, code ? 'o check não deu pela mutação:\n' + r.out.slice(-1200) : fails(r.out));
  });
}
