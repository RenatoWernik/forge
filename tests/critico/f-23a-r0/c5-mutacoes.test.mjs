// F-23a, C5: mutações e manual. Oráculos do corpo da #77: cada linha nova da simulação (C1 a C4) tem pelo menos uma mutação em
// scripts/corpus/mutations/ que a faz falhar (`node --test scripts/corpus.test.mjs` verde corre na regressão); o §5 Step 2 do FRAMEWORK
// (o retorno de `results[]`) lista `preExisting` via `followUps`, `contested`, `head` e `sha`; e o FRAMEWORK continua a passar todas as
// linhas do check.cjs.
// Leitura: «linha nova» é uma linha que o check.cjs imprime e que o check.cjs da BASE, corrido no MESMO projeto gerado, não imprime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate, corpusAnswers, check, linesOf, state, fails, replaceIn, mutations, baseFile, step2 } from './helpers.mjs';

const SET = 'en-plain-published';

test('C5 [ataque]: o check.cjs tem linhas novas e cada uma tem no corpus uma mutação que a faz falhar', async () => {
  const dest = await generate(corpusAnswers(SET));
  const now = check(dest);
  assert.equal(now.status, 0, 'o projeto gerado não passa o check.cjs: ' + fails(now.out));
  writeFileSync(join(dest, '.claude/check-base.cjs'), baseFile('templates/.claude/check.cjs'));
  const before = new Set(linesOf(check(dest, '.claude/check-base.cjs').out).map((l) => l.text));
  assert.ok(before.size > 50, 'o check.cjs da BASE não correu');
  const fresh = linesOf(now.out).map((l) => l.text).filter((t) => !before.has(t));
  assert.ok(fresh.length >= 1, 'o check.cjs não tem nenhuma linha nova (as linhas da simulação de C1 a C4)');
  const ms = mutations();
  const orphan = fresh.filter((t) => !ms.some((m) => t === m.line || t.startsWith(m.line + ' (')));
  assert.deepEqual(orphan, [], 'linhas novas sem mutação no corpus');
  // cada mutação dessas linhas faz MESMO falhar a sua linha (como o corpus.test.mjs a verifica)
  for (const m of ms.filter((x) => fresh.some((t) => t === x.line || t.startsWith(x.line + ' (')))) {
    const d = await generate(corpusAnswers(m.base));
    assert.equal(state(check(d).out, m.line), 'ok', `${m.name}: a linha não está ok antes da mutação`);
    assert.ok(replaceIn(join(d, m.file), m.find, m.replace), `${m.name}: o texto a procurar não existe em ${m.file}`);
    const post = check(d);
    assert.equal(state(post.out, m.line), 'FAIL', `${m.name}: a linha «${m.line}» não falhou depois da mutação: ` + fails(post.out));
    assert.equal(post.status, 1, `${m.name}: o check.cjs não saiu com 1`);
  }
});

test('C5 [ataque]: o §5 Step 2 do FRAMEWORK lista preExisting via followUps, contested, head e sha no retorno de results[]', () => {
  const s = step2();
  assert.ok(s.length > 200, 'não encontrei o §5 «### Step 2.» no FRAMEWORK.md');
  assert.match(s, /\bfollowUps\b/, 'Step 2 sem followUps');
  assert.match(s, /\bpreExisting\b|\bpre-existing\b/, 'Step 2 sem preExisting (via followUps)');
  for (const w of ['contested', 'head', 'sha']) assert.match(s, new RegExp(`\\b${w}\\b`), `Step 2 sem ${w}`);
});

test('C5 [guarda]: dois projetos gerados (com e sem plainStyle, painel publicado e pendente) passam todas as linhas do check.cjs, com os exemplos de args do FRAMEWORK', async () => {
  for (const set of [SET, 'en-noplain-pending']) {
    const r = check(await generate(corpusAnswers(set)));
    assert.equal(r.status, 0, `${set}: ` + fails(r.out));
    assert.match(r.out, /All ok\./, set);
  }
});