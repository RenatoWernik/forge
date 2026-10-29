// F-06: «as mutações no corpus» (âmbito do ticket). Os oráculos dos critérios 1, 2, 3, 4 e 6 são mutações corridas pelo
// `node --test scripts/corpus.test.mjs` (que prova que cada uma faz falhar a sua linha); aqui verifica-se que elas existem no corpus
// versionado (scripts/corpus/mutations) e que cada uma, aplicada ao projeto gerado da sua base, tira de facto o que diz tirar,
// medido com a tabela literal do helpers.mjs:
//   critério 1: por brief, duas mutações: uma que retira o aviso do hook do ficheiro e outra que o deixa no ficheiro mas abaixo
//               da linha 5 (8 no total);
//   critério 2: por cláusula de cada brief, uma mutação com a linha «briefs» que retira essa cláusula;
//   critério 3: por regra operacional, uma mutação num brief que a retira;
//   critério 4: uma mutação num brief que retira um literal do contrato;
//   critério 6: uma mutação da linha «language» com o ficheiro num brief e a base em português.
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, HOOK, CLAUSES, OPS, CONTRACT, BRIEFS_DIR, hookAtTop, missing, generate, briefsByRole, loadCorpus } from './helpers.mjs';

const starts = (line, p) => line === p || [' ', ':', '('].some((c) => line.startsWith(p + c));

test('C8: o corpus de mutações tem as mutações dos critérios 1, 2, 3, 4 e 6 e cada uma tira o que diz tirar', async () => {
  const answers = new Map(loadCorpus('answers').map((a) => [a.name, a.value]));
  const ms = loadCorpus('mutations').map((m) => ({ name: m.name, ...m.value })).filter((m) => String(m.file).startsWith(BRIEFS_DIR + '/'));
  // o projeto gerado (e «traduzido», se for português) de cada base, uma vez por base
  const bases = new Map();
  const project = async (base) => {
    if (!bases.has(base)) bases.set(base, answers.has(base) ? generate(answers.get(base)).then((g) => ({ ...g, by: briefsByRole(g.dest) })) : Promise.resolve(null));
    return bases.get(base);
  };
  // cada mutação de brief: papel do ficheiro, texto antes e depois
  const applied = [];
  for (const m of ms) {
    const p = await project(m.base);
    if (!p) continue;
    const role = ROLES.find((r) => p.by[r] === m.file);
    const f = join(p.dest, m.file);
    if (!role || !existsSync(f)) continue;
    const before = readFileSync(f, 'utf8');
    if (!before.includes(m.find)) continue;
    applied.push({ m, role, before, after: before.replaceAll(m.find, m.replace) });
  }
  const want = [];
  for (const r of ROLES) {
    want.push([`critério 1: ${r}, aviso retirado`, (x) => x.role === r && hookAtTop(x.before) && !HOOK.slice(0, 2).every((re) => re.test(x.after))]);
    want.push([`critério 1: ${r}, aviso abaixo da linha 5`, (x) => x.role === r && hookAtTop(x.before) && !hookAtTop(x.after) && HOOK.slice(0, 2).every((re) => re.test(x.after))]);
    for (const [c, res] of Object.entries(CLAUSES[r])) {
      want.push([`critério 2: ${r}, ${c}`, (x) => x.role === r && starts(x.m.line, 'briefs') && missing(x.before, { c: res }).length === 0 && missing(x.after, { c: res }).length === 1]);
    }
  }
  for (const [rule, res] of Object.entries(OPS)) {
    want.push([`critério 3: ${rule}`, (x) => missing(x.before, { rule: res }).length === 0 && missing(x.after, { rule: res }).length === 1]);
  }
  want.push(['critério 4: um literal do contrato', (x) => missing(x.before, CONTRACT).length === 0 && missing(x.after, CONTRACT).length > 0]);
  want.push(['critério 6: language, brief, base pt', (x) => starts(x.m.line, 'language') && /^pt/.test(x.m.base)]);
  assert.deepEqual(want.filter(([, ok]) => !applied.some(ok)).map(([k]) => k), [], 'mutações em falta no corpus (ou que não tiram o que dizem)');
});
