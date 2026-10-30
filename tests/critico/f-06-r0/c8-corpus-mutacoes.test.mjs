// F-06: «as mutações no corpus» (âmbito do ticket), com a resposta 6 na #7: entram NO MÁXIMO 10 mutações novas no corpus
// partilhado, UMA POR CLASSE; os outros casos de cada classe ficam nos testes do F-06 (c1 a c5 e c7). O
// `node --test scripts/corpus.test.mjs` prova que cada mutação faz falhar a sua linha; aqui verifica-se que cada classe tem a sua
// mutação no corpus versionado (scripts/corpus/mutations) e que ela, aplicada ao projeto gerado da sua base, tira de facto o que
// diz tirar, medido com a tabela literal do helpers.mjs. As classes:
//   aviso retirado; aviso abaixo da linha 5 (critério 1); uma cláusula (critério 2); uma regra operacional (critério 3); o
//   contrato (critério 4); a regra das sessões reais (resposta 4); um brief por traduzir num projeto em português (critério 6).
// As mutações das classes do aviso, das cláusulas, das regras, do contrato e das sessões declaram a linha `briefs` (resposta 3).
// «Nova» = uma mutação cujo ficheiro é um brief ou o .checkpoints/README.md.
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, HOOK, CLAUSES, OPS, CONTRACT, SESSIONS, BRIEFS_DIR, README, hookAtTop, missing, generate, briefsByRole, loadCorpus } from './helpers.mjs';

const starts = (line, p) => line === p || line.startsWith(p + ':') || line.startsWith(p + ' (');
const MAX_NEW = 10;

test(`C8: o corpus tem no máximo ${MAX_NEW} mutações novas e uma por classe, e cada uma tira o que diz tirar`, async () => {
  const answers = new Map(loadCorpus('answers').map((a) => [a.name, a.value]));
  const ms = loadCorpus('mutations').map((m) => ({ name: m.name, ...m.value })).filter((m) => String(m.file).startsWith(BRIEFS_DIR + '/') || m.file === README);
  assert.ok(ms.length <= MAX_NEW, `mutações novas no corpus: ${ms.length} (${ms.map((m) => m.name).join(', ')}); o máximo é ${MAX_NEW}`);
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
  const B = (x) => starts(x.m.line, 'briefs');
  const lost = (x, table) => missing(x.before, table).length === 0 && missing(x.after, table).length > 0;
  const want = [
    ['critério 1: aviso retirado', (x) => B(x) && hookAtTop(x.before) && !HOOK.slice(0, 2).every((re) => re.test(x.after))],
    ['critério 1: aviso abaixo da linha 5', (x) => B(x) && hookAtTop(x.before) && !hookAtTop(x.after) && HOOK.slice(0, 2).every((re) => re.test(x.after))],
    ['critério 2: uma cláusula', (x) => B(x) && lost(x, CLAUSES[x.role])],
    ['critério 3: uma regra operacional', (x) => B(x) && lost(x, OPS)],
    ['critério 4: o contrato', (x) => B(x) && lost(x, CONTRACT)],
    ['resposta 4: a regra das sessões reais', (x) => B(x) && lost(x, SESSIONS)],
    ['critério 6: language, brief, base pt', (x) => starts(x.m.line, 'language') && /^pt/.test(x.m.base)],
  ];
  assert.deepEqual(want.filter(([, ok]) => !applied.some(ok)).map(([k]) => k), [], 'classes sem mutação no corpus (ou com uma que não tira o que diz)');
});
