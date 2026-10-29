// F-08 com o seguimento #18: o crítico nunca recebe a narrativa nem o raciocínio do dev, e o check.cjs apanha-o.
// Oráculos: (1) a simulação, com o dev a declarar a narrativa em todos os campos de texto livre que o schema tiver e em `summary`,
// `reasoning` e `narrative`; nenhum prompt de crítico a contém, nas rondas todas, nos dois workflows; (2) a mutação do #18, numa
// forma que não depende do texto do prompt: um invólucro de agent() no gauntlet-build.js gerado acrescenta ao prompt do crítico os
// campos de raciocínio da última resposta do dev; o check.cjs tem de sair com 1 e falhar a linha do crítico sem raciocínio do dev;
// (3) o corpus tem a mutação DEV-REASONING (correção sugerida no #18).
// Depende do F-07: sim no teste (1) do gauntlet-build (args com o contrato e `args.attacks`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD, PONY, NARRATIVE, repro, contract, baseArgs, runWf, scenario, roleOf, why, fail, generate, check, linesOf, fails, mutations, corpusAnswers, replaceIn, declared, PROBE, fillSchema } from './helpers.mjs';

// Guarda (já passa na base): o workflow não passa a narrativa do dev ao crítico
test('#18 (guarda): no gauntlet-build, nenhum prompt de crítico traz a narrativa ou o raciocínio do dev, em 3 rondas e nos dois modos', async () => {
  for (const mode of ['rigorous', 'accelerated']) {
    const p = contract('pa', 9101, { central: [1, 2, 3] });
    const run = await runWf(BUILD, baseArgs([p], { mode }), scenario([p], { pa: [fail(1), fail(2), fail(3)] }));
    const crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
    assert.ok(crit.length >= 2, `${mode}: menos de 2 críticos: ${why(run, p.id)}`);
    assert.deepEqual(crit.filter((c) => c.prompt.includes(NARRATIVE)).map((c) => c.prompt.match(new RegExp(NARRATIVE + '\\S*'))[0]), [], mode);
  }
});

test('#18 (guarda): no gauntlet-ponytail, nenhum prompt de crítico traz a narrativa do dev', async () => {
  const impl = (prompt, opts) => {
    const role = roleOf(opts);
    if (role === 'critic') return fillSchema(opts.schema, (k, s, d) => (d !== 1 ? undefined : /^model$/.test(k) ? declared(PROBE.critic) : /winner/.test(k) ? (/^A: .*\.gauntlet/m.test(prompt) ? 'B' : 'A') : s.type === 'boolean' ? true : s.type === 'array' ? [] : undefined));
    if (role === 'developer') return { ...fillSchema(opts.schema, (k, s, d) => (d !== 1 ? undefined : /^model$/.test(k) ? declared(PROBE.developer) : /summary|reason|narrativ|explan|note/i.test(k) && s.type === 'string' ? NARRATIVE + k : undefined)), summary: NARRATIVE + 'summary', reasoning: NARRATIVE + 'reasoning' };
    return 'ok';
  };
  const run = await runWf(PONY, { ...baseArgs([]), testCommand: 'SUITE-CMD', units: [{ id: 'u1', title: 'U1', paths: ['src/a.js'] }] }, impl);
  const crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
  assert.ok(crit.length >= 1, 'sem crítico: ' + (run.err?.message || ''));
  assert.ok(crit.every((c) => !c.prompt.includes(NARRATIVE)));
});

// A mutação do #18, independente do texto: depois do meta, troca agent() por um invólucro que guarda os campos de raciocínio da
// resposta do dev (a que traz filesChanged) e os junta ao prompt seguinte do crítico (models.critic dos args).
const WRAP = `
const __agent = agent; let __devNotes = ''
agent = async (prompt, opts) => {
  const o = opts || {}, c = args && args.models && args.models.critic, d = args && args.models && args.models.developer
  const toCritic = c && o.model === c.model && o.effort === c.effort && !(d && d.model === c.model && d.effort === c.effort)
  const r = await __agent(toCritic && __devNotes ? prompt + '\\nDeveloper notes: ' + __devNotes : prompt, opts)
  if (r && typeof r === 'object' && 'filesChanged' in r) __devNotes = Object.keys(r).filter(k => /summary|reason|narrativ|explan|thought|note/i.test(k)).map(k => String(r[k])).join(' | ')
  return r
}
`;
const injectWrap = (file) => {
  const t = readFileSync(file, 'utf8'), m = t.match(/^export const meta = \{[\s\S]*?^\}\r?\n/m);
  if (!m) return false;
  writeFileSync(file, t.slice(0, m.index + m[0].length) + WRAP + t.slice(m.index + m[0].length));
  return true;
};
const reasoningLine = (l) => /critic/i.test(l.text) && /reasoning|summary|narrative|raciocínio/i.test(l.text);

test('#18: com o raciocínio do dev injetado no prompt do crítico, o check.cjs de um projeto gerado sai com 1 e falha a linha do crítico sem raciocínio do dev', async () => {
  const dest = await generate(corpusAnswers('en-plain-published'));
  const pre = linesOf(check(dest).out).filter(reasoningLine);
  assert.ok(pre.length >= 1, 'não há linha do check.cjs sobre o crítico sem o raciocínio do dev');
  assert.ok(pre.every((l) => l.state === 'ok'), 'sem mutação, a linha já falha: ' + JSON.stringify(pre));
  assert.ok(injectWrap(join(dest, '.claude/workflows/gauntlet-build.js')), 'meta do gauntlet-build.js não encontrado');
  const post = check(dest);
  assert.equal(post.status, 1, 'o check.cjs não apanhou o raciocínio do dev no crítico (saiu com ' + post.status + '): ' + fails(post.out));
  assert.ok(linesOf(post.out).some((l) => l.state === 'FAIL' && reasoningLine(l)), 'a linha do crítico sem raciocínio do dev não falhou: ' + fails(post.out));
});

test('#18: o corpus tem a mutação DEV-REASONING (o raciocínio do dev no prompt do crítico do gauntlet-build) e ela faz falhar essa linha', async () => {
  // resposta 6 da #9: a mutação chama-se critico-recebe-raciocinio-do-dev (substitui a critico-recebe-lacuna-de-rondas-anteriores)
  const ms = mutations().filter((m) => m.name === 'critico-recebe-raciocinio-do-dev');
  assert.ok(ms.every((m) => m.file === '.claude/workflows/gauntlet-build.js' && /summary|reasoning|narrativ/i.test(m.replace || '') && !/summary|reasoning|narrativ/i.test(m.find || '') && reasoningLine({ text: m.line || '' })), 'a mutação tem de pôr conteúdo do dev no prompt do crítico do gauntlet-build e apontar para a linha do crítico: ' + JSON.stringify(ms));
  assert.ok(ms.length >= 1, 'mutações do gauntlet-build: ' + JSON.stringify(mutations().filter((m) => /gauntlet-build/.test(m.file)).map((m) => [m.name, m.replace])));
  for (const m of ms) {
    const dest = await generate(corpusAnswers(m.base));
    assert.ok(replaceIn(join(dest, m.file), m.find, m.replace), `${m.name}: o texto a procurar não existe`);
    const post = check(dest);
    assert.equal(post.status, 1, m.name);
    assert.ok(linesOf(post.out).some((l) => l.state === 'FAIL' && l.text === m.line), `${m.name}: ${fails(post.out)}`);
  }
});

// Resposta 6 da #9: a partir da R2, o crítico RECEBE as falhas da ronda anterior, vindas do veredito do crítico (ids e descrição)
test('#18 (resposta 6): o crítico da R2 recebe as falhas da R1 do veredito do crítico (o critério C2 e o repro), e o da R1 não recebe nada disso', async () => {
  for (const mode of ['rigorous', 'accelerated']) {
    const p = contract('pa', 9101, { central: [2] });
    const run = await runWf(BUILD, baseArgs([p], { mode }), scenario([p], { pa: [fail(2)] }));
    const crit = run.calls.filter((c) => roleOf(c.opts) === 'critic');
    assert.equal(crit.length, 2, `${mode}: ${why(run, p.id)}`);
    assert.ok(!crit[0].prompt.includes(repro(1, 2)), mode + ': o crítico da R1 não tem falhas anteriores');
    assert.ok(crit[1].prompt.includes(repro(1, 2)), `${mode}: o crítico da R2 não recebeu a falha da R1 (${repro(1, 2)})`);
    assert.match(crit[1].prompt, /\bC2\b/, mode + ': o crítico da R2 não recebeu o id do critério que falhou');
    assert.ok(!crit[1].prompt.includes(NARRATIVE), mode + ': com as falhas anteriores veio conteúdo do dev');
  }
});

// Alarme falso («reprova sempre»): pôr no prompt do crítico as falhas que o crítico anterior devolveu não pode fazer falhar a linha
const WRAP_PRIOR = `
const __agent = agent; let __prior = ''
agent = async (prompt, opts) => {
  const o = opts || {}, c = args && args.models && args.models.critic, d = args && args.models && args.models.developer
  const isCritic = c && o.model === c.model && o.effort === c.effort && !(d && d.model === c.model && d.effort === c.effort)
  const r = await __agent(isCritic && __prior ? prompt + '\\nPrior failures from the critic: ' + __prior : prompt, opts)
  if (isCritic && r && typeof r === 'object') __prior = JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => /block|bloq|prior|fail/i.test(k))))
  return r
}
`;
test('#18 (resposta 6, alarme falso): com as falhas do crítico anterior no prompt do crítico, a linha do crítico sem raciocínio do dev continua ok', async () => {
  const dest = await generate(corpusAnswers('en-plain-published'));
  const f = join(dest, '.claude/workflows/gauntlet-build.js'), t = readFileSync(f, 'utf8'), m = t.match(/^export const meta = \{[\s\S]*?^\}\r?\n/m);
  assert.ok(m, 'meta do gauntlet-build.js não encontrado');
  writeFileSync(f, t.slice(0, m.index + m[0].length) + WRAP_PRIOR + t.slice(m.index + m[0].length));
  const ls = linesOf(check(dest).out).filter(reasoningLine);
  assert.ok(ls.length >= 1, 'não há linha do crítico sem raciocínio do dev');
  assert.ok(ls.every((l) => l.state === 'ok'), 'alarme falso: as falhas anteriores do crítico são permitidas: ' + JSON.stringify(ls));
});
