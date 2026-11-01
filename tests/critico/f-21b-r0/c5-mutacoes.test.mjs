// F-21b, C5: mutações. Oráculo do corpo da #74: cada linha nova da simulação (C1, C2 e C3) tem pelo menos uma mutação em
// scripts/corpus/mutations/ que a faz falhar; ficam no mínimo 3 ficheiros novos (`node --test scripts/corpus.test.mjs` verde corre na
// regressão, no seu próprio comando).
// Leitura: «linha nova» é uma linha que o check.cjs imprime e que o check.cjs da BASE (merge-base com origin/main), corrido no MESMO
// projeto gerado, não imprime. Âmbito do ticket: depois do merge a BASE já tem as linhas e os ficheiros, e os dois testes fazem skip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { git, MB, generate, corpusAnswers, check, fails, freshLines, mutations, state, replaceIn, SCOPE_SKIP } from './helpers.mjs';

const DIR = 'scripts/corpus/mutations/';
const baseNames = () => new Set(git('ls-tree', '--name-only', MB, DIR).split(/\r?\n/).filter(Boolean).map((f) => f.slice(DIR.length).replace(/\.json$/, '')));
const hits = (t, m) => t === m.line || t.startsWith(m.line + ' (');

test('C5 [ataque]: ficam no mínimo 3 ficheiros novos em scripts/corpus/mutations/ (em relação à BASE)', { skip: SCOPE_SKIP }, () => {
  const old = baseNames();
  assert.ok(old.size >= 40, 'controlo: mutações na BASE ' + old.size);
  const novas = mutations().filter((m) => !old.has(m.name));
  assert.ok(novas.length >= 3, 'mutações novas: ' + JSON.stringify(novas.map((m) => m.name)));
  for (const n of old) assert.ok(mutations().some((m) => m.name === n), `a mutação da BASE ${n} foi apagada`);
});

test('C5 [ataque]: o check.cjs tem pelo menos 3 linhas novas e cada uma tem uma mutação no corpus que a faz MESMO falhar', { skip: SCOPE_SKIP }, async () => {
  const dest = await generate(corpusAnswers('en-plain-published'));
  const now = check(dest);
  assert.equal(now.status, 0, 'o projeto gerado não passa o check.cjs: ' + fails(now.out));
  const fresh = freshLines(dest, now.out);
  assert.ok(fresh.length >= 3, 'linhas novas do check.cjs (uma por C1, C2 e C3, no mínimo): ' + JSON.stringify(fresh));
  const ms = mutations();
  const orphan = fresh.filter((t) => !ms.some((m) => hits(t, m)));
  assert.deepEqual(orphan, [], 'linhas novas sem mutação no corpus');
  for (const m of ms.filter((x) => fresh.some((t) => hits(t, x)))) {
    const d = await generate(corpusAnswers(m.base));
    assert.equal(state(check(d).out, m.line), 'ok', `${m.name}: a linha não está ok antes da mutação`);
    assert.ok(replaceIn(join(d, m.file), m.find, m.replace), `${m.name}: o texto a procurar não existe em ${m.file}`);
    const post = check(d);
    assert.equal(state(post.out, m.line), 'FAIL', `${m.name}: a linha «${m.line}» não falhou depois da mutação: ` + fails(post.out));
    assert.equal(post.status, 1, `${m.name}: o check.cjs não saiu com 1`);
  }
});