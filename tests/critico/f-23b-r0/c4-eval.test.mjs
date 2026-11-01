// F-23b, C4 (D5): a medida de recall e de ruído do crítico. `node scripts/eval-critico.mjs --verdicts <ficheiro.json>` lê
// {<caso>: <veredito no schema VERDICT>} e imprime `recall <a>/<b>` (os defect com pelo menos um bloqueante cujo criterion é o do
// expect.json, ou, sem criterion, com qualquer bloqueante) e `noise <c>/<d>` (os clean com pelo menos um bloqueante); sai sempre com 0;
// um caso sem veredito conta como falha de recall (defect) ou como ruído (clean) e é listado em `missing: <casos>`.
// Oráculo do corpo da #78: ficheiros de vereditos falsos com resultados exatos (todos certos; um defect sem bloqueante; um bloqueante com
// o critério errado; um clean com um bloqueante). O corpo dá «4/4» para 4 e 4 casos; o corpus pode ter mais («no mínimo»), por isso os
// denominadores aqui são as contagens reais de defect e clean do corpus. E o README que diz quando se corre com um crítico real.
// Leitura: «O README.md» é o README.md da raiz ou o scripts/corpus/critico/README.md (ver a PERGUNTA na #78).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CRITICO, cases, expectOf, tmp, node, read } from './helpers.mjs';

const SCRIPT = 'scripts/eval-critico.mjs';
const corpus = () => cases().map((c) => ({ name: c, ...expectOf(c) }));
const blocking = (criterion = 'C1') => ({ criterion, materiality: 2, category: 'criterion', class: 'probe-class', description: 'DESC', repro: 'REPRO' });
const verdict = (bs) => ({ winner: 'A', testsPass: true, blocking: bs, minor: [], barQuestions: [], preExisting: [], followUp: [], sha: 'c'.repeat(40), visualBelowReference: false, attacks: [], biggestGap: 'GAP', reasoning: 'R', model: 'probe-critic' });
const right = (e) => verdict(e.kind === 'defect' ? [blocking(e.criterion || 'C1')] : []);
const evalOf = (verdicts) => {
  const f = join(tmp('v'), 'verdicts.json');
  writeFileSync(f, JSON.stringify(verdicts));
  const r = node([SCRIPT, '--verdicts', f]);
  const rec = r.out.match(/^recall (\d+)\/(\d+)\b/m), noi = r.out.match(/^noise (\d+)\/(\d+)\b/m), mis = r.out.match(/^missing: (.*)$/m);
  return { ...r, recall: rec && `${rec[1]}/${rec[2]}`, noise: noi && `${noi[1]}/${noi[2]}`, missing: mis ? mis[1] : null };
};
const setup = () => {
  const cs = corpus(), D = cs.filter((c) => c.kind === 'defect'), C = cs.filter((c) => c.kind === 'clean');
  assert.ok(existsSync(join(ROOT, SCRIPT)), `${SCRIPT} não existe`);
  assert.ok(D.length >= 4 && C.length >= 4, `o corpus tem ${D.length} defect e ${C.length} clean`);
  const all = Object.fromEntries(cs.map((c) => [c.name, right(c)]));
  return { cs, D, C, all };
};

test('C4 [ataque]: vereditos todos certos dão recall <defect>/<defect> e noise 0/<clean>, com saída 0', () => {
  const { D, C, all } = setup();
  const r = evalOf(all);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.recall, `${D.length}/${D.length}`, r.out);
  assert.equal(r.noise, `0/${C.length}`, r.out);
});

test('C4 [ataque]: um defect sem bloqueante baixa o recall em 1', () => {
  const { D, C, all } = setup();
  const r = evalOf({ ...all, [D[0].name]: verdict([]) });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.recall, `${D.length - 1}/${D.length}`, r.out);
  assert.equal(r.noise, `0/${C.length}`, r.out);
});

test('C4 [ataque]: um bloqueante com o critério errado num defect com criterion não conta para o recall', () => {
  const { D, C, all } = setup();
  const d = D.find((x) => x.criterion);
  assert.ok(d, 'nenhum caso defect tem criterion no expect.json: o oráculo do «critério errado» não se pode correr');
  const wrong = d.criterion === 'C1' ? 'C2' : 'C1';
  const r = evalOf({ ...all, [d.name]: verdict([blocking(wrong)]) });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.recall, `${D.length - 1}/${D.length}`, r.out);
  assert.equal(r.noise, `0/${C.length}`, r.out);
});

test('C4 [ataque]: um defect sem criterion conta com qualquer bloqueante', () => {
  const { D, all } = setup();
  const d = D.find((x) => !x.criterion);
  if (!d) return; // todos os defect têm criterion: o caso não se aplica a este corpus
  const r = evalOf({ ...all, [d.name]: verdict([blocking('C9')]) });
  assert.equal(r.recall, `${D.length}/${D.length}`, r.out);
});

test('C4 [ataque]: um clean com um bloqueante sobe o noise em 1', () => {
  const { D, C, all } = setup();
  const r = evalOf({ ...all, [C[0].name]: verdict([blocking('C1')]) });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.recall, `${D.length}/${D.length}`, r.out);
  assert.equal(r.noise, `1/${C.length}`, r.out);
});

test('C4 [ataque]: um caso sem veredito conta como falha de recall (defect) ou como ruído (clean) e é listado em missing:, e a saída é 0', () => {
  const { D, C, all } = setup();
  const v = { ...all };
  delete v[D[0].name]; delete v[C[0].name];
  const r = evalOf(v);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.recall, `${D.length - 1}/${D.length}`, r.out);
  assert.equal(r.noise, `1/${C.length}`, r.out);
  assert.ok(r.missing !== null, 'sem a linha missing: ' + r.out);
  for (const n of [D[0].name, C[0].name]) assert.ok(r.missing.split(/[\s,]+/).includes(n), `missing: sem ${n}: ` + r.out);
});

test('C4 [ataque]: um ficheiro de vereditos vazio sai com 0: recall 0/<defect>, noise <clean>/<clean>, todos em missing:', () => {
  const { cs, D, C } = setup();
  const r = evalOf({});
  assert.equal(r.status, 0, r.out);
  assert.equal(r.recall, `0/${D.length}`, r.out);
  assert.equal(r.noise, `${C.length}/${C.length}`, r.out);
  for (const c of cs) assert.ok((r.missing || '').split(/[\s,]+/).includes(c.name), `missing: sem ${c.name}: ` + r.out);
});

test('C4 [ataque]: o README diz quando se corre a avaliação com um crítico real (muda o critic.md, o prompt do crítico, as ferramentas ou o modelo), que custa quota e precisa do sim do utilizador, e que nada é agendado', () => {
  const cands = ['README.md', 'scripts/corpus/critico/README.md'].filter((f) => existsSync(join(ROOT, f))).map((f) => [f, read(f)]);
  const ok = cands.find(([, t]) => /eval-critico/.test(t));
  assert.ok(ok, 'nenhum README (raiz ou scripts/corpus/critico/) fala do eval-critico');
  const t = ok[1];
  for (const [what, re] of [['critic.md', /critic\.md/], ['o prompt do crítico', /prompt/i], ['as ferramentas', /\btools?\b|ferramentas?/i], ['o modelo', /\bmodel\b|modelo/i], ['a quota', /quota/i], ['o sim do utilizador', /\byes\b|approv|\bsim\b/i], ['nada é agendado', /schedul|agend/i]]) assert.match(t, re, `${ok[0]}: não diz ${what}`);
});

test('C4 [guarda]: o eval-critico.mjs não agenda nada', () => {
  if (!existsSync(join(ROOT, SCRIPT))) return;
  assert.doesNotMatch(readFileSync(join(ROOT, SCRIPT), 'utf8'), /CronCreate|schtasks|crontab|setInterval/, `${SCRIPT} agenda trabalho`);
});