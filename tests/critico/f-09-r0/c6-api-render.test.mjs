// F-09 critério 6: o gauntlet-batch passa as 3 linhas do contrato da API `Workflow` (meta literal puro; opts só da API, com fase,
// modelo e schema certos; retoma determinística) e respeita o --render. Oráculo: as linhas do bloco «Workflow API contract» do
// check.cjs, reescritas aqui e aplicadas ao gauntlet-batch de um projeto gerado; as mesmas 3 linhas com a etiqueta `batch:` na
// saída do check.cjs; e a ida e volta do --render com o tester (mudar models.tester no forge.json → o check falha → --render → o
// meta tem o texto novo do tester e o check volta a «All ok.»).
// Nota de regressão: o tests/critico/f-03-r0/c3-render.test.mjs e a linha «render:» do check.cjs exigem em TODOS os workflows os
// textos do developer e do critic no meta e a fase Panel com o modelo do aux; valem também para o gauntlet-batch.
// Depende do F-08: só as linhas do check.cjs (correm o check inteiro).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { BATCH, MODES, ANSWERS, MODELS, generate, check, fails, lines, readJson, runWf, batchArgs, pieces, fakeImpl, declared, show } from './helpers.mjs';
import { FAIL } from './corpus.mjs';

const WF = '.claude/workflows';
const OPTS = ['label', 'phase', 'schema', 'model', 'effort', 'isolation', 'agentType'];
const EFF = ['low', 'medium', 'high', 'xhigh', 'max'];
const META = /^export const meta = (\{[\s\S]*?^\})/m;
const text = (r) => `${r.label ?? r.model} ${r.effort}`;
const description = (src) => (src.match(/^\s*description:\s*'((?:[^'\\]|\\.)*)'/m) || [])[1] ?? '';

let dest, F, src, runs;
before(async () => {
  ({ dest } = await generate(ANSWERS()));
  F = readJson(join(dest, '.claude/forge.json')).models;
  src = readFileSync(join(dest, WF, BATCH), 'utf8');
  runs = [];
  for (const mode of MODES) for (const fs of [[], [FAIL.aEstavel, FAIL.coreIntermitente]]) runs.push(await runWf(BATCH, batchArgs(pieces(3), { mode, models: F }), fakeImpl({ models: F, answer: () => declared(fs) }), { dir: join(dest, WF) }));
});

test('C6 linha 1: o script começa com um meta literal puro (só textos, objetos e listas), name = nome do ficheiro, descrição numa linha, e meta.phases = as chamadas phase(), cada uma com detail', () => {
  assert.ok(src.startsWith('export const meta = '), 'não começa por «export const meta = »');
  const lit = src.match(META)?.[1];
  assert.ok(lit, 'sem meta literal');
  assert.ok(!/[^\s{}[\],:]/.test(lit.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\w+(?=\s*:)/g, '')), 'o meta não é um literal puro');
  const meta = vm.runInNewContext('(' + lit + ')');
  assert.equal(meta.name, 'gauntlet-batch');
  assert.match(meta.description, /^[^\n]+$/);
  assert.ok(runs.every((r) => !r.err), runs.map((r) => show(r)).join(' | '));
  const used = new Set(runs.flatMap((r) => r.phases));
  assert.ok(used.size > 0, 'nenhuma chamada phase()');
  assert.deepEqual(Array.from(meta.phases, (p) => p.title).sort(), [...used].sort());
  assert.ok(meta.phases.every((p) => p.detail), 'fase sem detail');
});

test('C6 linha 2: cada agent() usa só opts da API (label, fase de meta.phases com o modelo que ela declara, effort válido) e o schema tem raiz objeto e required dentro de properties; só o agente do painel (aux) corre sem schema', () => {
  const meta = vm.runInNewContext('(' + src.match(META)[1] + ')');
  const calls = runs.flatMap((r) => r.calls);
  assert.ok(calls.length > 0);
  const wrong = calls.filter((c) => !(typeof c.prompt === 'string' && Object.keys(c.opts).every((k) => OPTS.includes(k)) && typeof c.opts.label === 'string'
    && meta.phases.some((p) => p.title === c.opts.phase && (!p.model || p.model === c.opts.model)) && (!c.opts.effort || EFF.includes(c.opts.effort))
    && (c.opts.schema ? c.opts.schema.type === 'object' && (c.opts.schema.required || []).every((k) => k in (c.opts.schema.properties || {})) : c.opts.model === F.aux.model)));
  assert.deepEqual(wrong.map((c) => c.opts), []);
});

test('C6 linha 3 (retoma): com Date.now, Math.random e new Date() a falhar, os mesmos args e respostas repetem exatamente as chamadas agent() e o retorno', async () => {
  const go = () => runWf(BATCH, batchArgs(pieces(3), { models: F }), fakeImpl({ models: F, answer: () => declared([FAIL.bEstavel, FAIL.e2eIntermitente]) }), { dir: join(dest, WF) });
  const [a, b] = [await go(), await go()];
  assert.ok(!a.err, show(a));
  assert.ok(a.calls.length >= 1);
  assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
  assert.equal(JSON.stringify(a.out), JSON.stringify(b.out));
});

test('C6 as 3 linhas da API aparecem na saída do check.cjs com a etiqueta «batch:» e estão ok; o check fica em «All ok.»', () => {
  const r = check(dest);
  assert.equal(r.status, 0, fails(r.out));
  for (const p of ['batch: the script starts with a pure literal meta', 'batch: every agent() uses only API opts', 'batch: resume']) assert.deepEqual(lines(r.out, p).map((x) => x[0]), ['ok'], `linha «${p}…»`);
  assert.match(r.out, /All ok\./);
});

test('C6 render: no projeto gerado o meta do gauntlet-batch não tem marcadores por preencher, nomeia o tester do forge.json e a fase Panel (se existir) corre o aux', () => {
  assert.ok(!src.includes('{{'), 'ficaram marcadores {{…}} no gauntlet-batch gerado');
  assert.ok(description(src).includes(text(F.tester)), `o meta não nomeia o tester («${text(F.tester)}»): ${description(src)}`);
  const panel = (src.match(/title:\s*'Panel'[^}]*?model:\s*'([^']*)'/) || [])[1];
  if (panel !== undefined) assert.equal(panel, F.aux.model);
});

test('C6 render (ida e volta): mudar o tester no forge.json faz o check falhar; o --render reescreve o meta do gauntlet-batch com o texto novo e o check volta a «All ok.»; um segundo --render não muda nada', async () => {
  const { dest: d } = await generate(ANSWERS());
  const fjPath = join(d, '.claude/forge.json'), fj = readJson(fjPath);
  const NEW = { model: 'haiku', effort: 'high', label: 'Tester 9.9', reason: 'changed: more effort for the batch' };
  fj.models.tester = NEW;
  writeFileSync(fjPath, JSON.stringify(fj, null, 2) + '\n');
  const stale = check(d);
  assert.equal(stale.status, 1, 'o check não deu pelo meta desatualizado:\n' + stale.out.slice(-1500));
  const r = check(d, ['--render']);
  assert.equal(r.status, 0, r.out);
  const after = readFileSync(join(d, WF, BATCH), 'utf8');
  assert.ok(description(after).includes(text(NEW)), `o --render não pôs «${text(NEW)}» no meta do gauntlet-batch: ${description(after)}`);
  assert.ok(!description(after).includes(text(MODELS().tester)), 'o meta ainda tem o texto antigo do tester');
  const ok = check(d);
  assert.equal(ok.status, 0, fails(ok.out));
  assert.match(check(d, ['--render']).out, /nothing to render/);
});
