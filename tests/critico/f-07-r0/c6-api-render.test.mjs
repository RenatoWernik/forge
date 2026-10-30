// F-07 critério 6: o gauntlet-attacks passa as 3 linhas do contrato da API `Workflow` que o check.cjs já aplica aos workflows
// existentes (meta literal puro; opts só da API, com fase, modelo e schema certos; retoma determinística), e o seu meta respeita
// o --render.
// Oráculo: as linhas existentes do check.cjs (o bloco «Workflow API contract»), reescritas aqui e aplicadas ao workflow novo de um
// projeto gerado, mais a ida e volta do --render (mudar o crítico no forge.json → o check falha → --render → «All ok.» e o meta
// tem o texto novo do crítico). Os papéis do projeto têm pares modelo/esforço distintos, para se reconhecerem sem etiquetas.
// Nota de regressão: o tests/critico/f-03-r0/c3-render.test.mjs (C3a) exige, em TODOS os workflows, os textos do developer e do
// critic no meta e a fase Panel com o modelo do aux; vale também para o gauntlet-attacks.
// Depende do F-06: não.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ATTACKS, MODES, ANSWERS, MODELS, generate, check, fails, readJson, contract, baseArgs, runWf, fakeImpl } from './helpers.mjs';

const WF = '.claude/workflows';
const DISTINCT = () => ({ ...MODELS(), critic: { model: 'opus', effort: 'max', label: 'Judge 3.0', match: 'opus', reason: 'the critic stays on Opus' }, tester: { model: 'haiku', effort: 'medium', label: 'Tester 4.0', reason: 'mechanical' }, aux: { model: 'sonnet', effort: 'low', reason: 'panel records only' } });
const OPTS = ['label', 'phase', 'schema', 'model', 'effort', 'isolation', 'agentType'];
const EFF = ['low', 'medium', 'high', 'xhigh', 'max'];
const META = /^export const meta = (\{[\s\S]*?^\})/m;
const text = (r) => `${r.label ?? r.model} ${r.effort}`;
const description = (src) => (src.match(/^\s*description:\s*'((?:[^'\\]|\\.)*)'/m) || [])[1] ?? '';

let dest, F, src, runs;
before(async () => {
  ({ dest } = await generate(ANSWERS({ models: DISTINCT() })));
  F = readJson(join(dest, '.claude/forge.json')).models;
  src = readFileSync(join(dest, WF, ATTACKS), 'utf8');
  const pieces = [contract('pa', 9101), contract('pb', 9102)];
  runs = [];
  for (const mode of MODES) for (const ps of [pieces, [pieces[0]]]) runs.push(await runWf(ATTACKS, baseArgs(ps, { mode, models: F }), fakeImpl({ pieces: ps, gapsOf: { pb: ['g'] }, models: F }), { dir: join(dest, WF) }));
});

test('C6 linha 1: o script começa com um meta literal puro (só textos, objetos e listas), name = nome do ficheiro, descrição numa linha, e meta.phases = as chamadas phase(), cada uma com detail', () => {
  assert.ok(src.startsWith('export const meta = '), 'não começa por «export const meta = »');
  const lit = src.match(META)?.[1];
  assert.ok(lit, 'sem meta literal');
  assert.ok(!/[^\s{}[\],:]/.test(lit.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\w+(?=\s*:)/g, '')), 'o meta não é um literal puro');
  const meta = vm.runInNewContext('(' + lit + ')');
  assert.equal(meta.name, 'gauntlet-attacks');
  assert.match(meta.description, /^[^\n]+$/);
  assert.ok(runs.every((r) => !r.err), runs.map((r) => r.err?.message).join(' | '));
  const used = new Set(runs.flatMap((r) => r.phases));
  assert.ok(used.size > 0, 'nenhuma chamada phase()');
  assert.deepEqual(Array.from(meta.phases, (p) => p.title).sort(), [...used].sort()); // Array.from: o meta vem de outro realm (vm)
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

test('C6 linha 3 (retoma): com Date.now, Math.random e new Date() a falhar, os mesmos args e respostas repetem exatamente as chamadas agent() (prompt e opts)', async () => {
  const ps = [contract('pa', 9101), contract('pb', 9102)];
  const go = () => runWf(ATTACKS, baseArgs(ps, { models: F }), fakeImpl({ pieces: ps, models: F }), { dir: join(dest, WF) });
  const [a, b] = [await go(), await go()];
  assert.ok(!a.err, String(a.err?.message));
  assert.ok(a.calls.length >= 2);
  assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
});

test('C6 render: no projeto gerado o meta não tem marcadores por preencher, nomeia o crítico do forge.json e a fase Panel (se existir) corre o aux; o check fica em «All ok.»', () => {
  assert.ok(!src.includes('{{'), 'ficaram marcadores {{…}} no gauntlet-attacks gerado');
  assert.ok(description(src).includes(text(F.critic)), `o meta não nomeia o crítico («${text(F.critic)}»): ${description(src)}`);
  const panel = (src.match(/title:\s*'Panel'[^}]*?model:\s*'([^']*)'/) || [])[1];
  if (panel !== undefined) assert.equal(panel, F.aux.model);
  const r = check(dest);
  assert.equal(r.status, 0, fails(r.out));
  assert.match(r.out, /All ok\./);
});

test('C6 render (ida e volta): mudar o crítico no forge.json faz o check falhar; o --render reescreve o meta do gauntlet-attacks com o texto novo e o check volta a «All ok.»; um segundo --render não muda nada', async () => {
  const { dest: d } = await generate(ANSWERS({ models: DISTINCT() }));
  const fjPath = join(d, '.claude/forge.json'), fj = readJson(fjPath);
  const NEW = { model: 'opus', effort: 'low', label: 'Judge 9.9', match: 'opus', reason: 'changed: cheaper critic' };
  fj.models.critic = NEW;
  writeFileSync(fjPath, JSON.stringify(fj, null, 2) + '\n');
  const stale = check(d);
  assert.equal(stale.status, 1, 'o check não deu pelo meta desatualizado:\n' + stale.out.slice(-1500));
  const r = check(d, ['--render']);
  assert.equal(r.status, 0, r.out);
  const after = readFileSync(join(d, WF, ATTACKS), 'utf8');
  assert.ok(description(after).includes(text(NEW)), `o --render não pôs «${text(NEW)}» no meta do gauntlet-attacks: ${description(after)}`);
  assert.ok(!description(after).includes(text(DISTINCT().critic)), 'o meta ainda tem o texto antigo do crítico');
  const ok = check(d);
  assert.equal(ok.status, 0, fails(ok.out));
  assert.match(check(d, ['--render']).out, /nothing to render/);
  // só o gauntlet-attacks com o texto antigo do crítico: o check tem de dar por ele (os outros workflows estão certos)
  writeFileSync(join(d, WF, ATTACKS), after.replace(text(NEW), text(DISTINCT().critic)));
  const only = check(d);
  assert.equal(only.status, 1, 'o check não deu pelo meta desatualizado só no gauntlet-attacks:\n' + only.out.slice(-1500));
});
