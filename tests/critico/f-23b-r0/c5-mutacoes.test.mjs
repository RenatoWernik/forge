// F-23b, barra de regressão do corpo da #78: «cada linha nova da simulação (C1 e C2) tem uma mutação que a faz falhar» e o pacote continua
// a passar todas as linhas do check.cjs.
// Leitura (a do F-23a): «linha nova» é uma linha que o check.cjs imprime e que o check.cjs da BASE (merge-base com a origin/main), corrido
// no MESMO projeto gerado, não imprime. Teste de âmbito do ticket (regra 9 do brief): faz skip quando a base já contém o F-23b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate, corpusAnswers, check, linesOf, state, fails, replaceIn, mutations, baseFile, baseHasF23b, SKIP_SCOPE } from './helpers.mjs';

const SET = 'en-plain-published';

test('barra [ataque]: o check.cjs tem linhas novas (as da simulação de C1 e C2) e cada uma tem no corpus uma mutação que a faz falhar', { skip: baseHasF23b() && SKIP_SCOPE }, async () => {
  const dest = await generate(corpusAnswers(SET));
  const now = check(dest);
  assert.equal(now.status, 0, 'o projeto gerado não passa o check.cjs: ' + fails(now.out));
  writeFileSync(join(dest, '.claude/check-base.cjs'), baseFile('templates/.claude/check.cjs'));
  const before = new Set(linesOf(check(dest, '.claude/check-base.cjs').out).map((l) => l.text));
  assert.ok(before.size > 50, 'o check.cjs da BASE não correu');
  const fresh = linesOf(now.out).map((l) => l.text).filter((t) => !before.has(t));
  assert.ok(fresh.length >= 2, `o check.cjs tem ${fresh.length} linha(s) nova(s); o C1 e o C2 pedem linhas novas na simulação: ` + JSON.stringify(fresh));
  const ms = mutations();
  const orphan = fresh.filter((t) => !ms.some((m) => t === m.line || t.startsWith(m.line + ' (')));
  assert.deepEqual(orphan, [], 'linhas novas sem mutação no corpus');
  for (const m of ms.filter((x) => fresh.some((t) => t === x.line || t.startsWith(x.line + ' (')))) {
    const d = await generate(corpusAnswers(m.base));
    assert.equal(state(check(d).out, m.line), 'ok', `${m.name}: a linha não está ok antes da mutação`);
    assert.ok(replaceIn(join(d, m.file), m.find, m.replace), `${m.name}: o texto a procurar não existe em ${m.file}`);
    const post = check(d);
    assert.equal(state(post.out, m.line), 'FAIL', `${m.name}: a linha «${m.line}» não falhou depois da mutação: ` + fails(post.out));
    assert.equal(post.status, 1, `${m.name}: o check.cjs não saiu com 1`);
  }
});

test('barra [guarda]: dois projetos gerados (com e sem plainStyle, painel publicado e pendente) passam todas as linhas do check.cjs', async () => {
  for (const set of [SET, 'en-noplain-pending']) {
    const r = check(await generate(corpusAnswers(set)));
    assert.equal(r.status, 0, `${set}: ` + fails(r.out));
    assert.match(r.out, /All ok\./, set);
  }
});