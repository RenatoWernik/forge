// F-06 critério 4: os 4 briefs dizem que o contrato é o corpo da issue mais os comentários do orquestrador, lidos com
// `gh issue view <n> --json body,comments`; os comentários dos críticos são só contexto; uma dúvida vira um comentário «PERGUNTA»
// na issue.
// Oráculo: os literais (helpers.mjs CONTRACT) em cada brief, nas 4 combinações língua × modo; mais uma mutação: em cada brief, o
// literal `gh issue view ... --json body,comments` neutralizado faz o check.cjs sair com 1 e a linha `briefs` falhar a dizer qual
// o brief e que falta o contrato (resposta 3 na #7).
// Não depende do F-05 (o mesmo literal é do F-05 no FRAMEWORK.md, mas aqui só se lê o brief).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, ANSWERS, ROLES, CONTRACT, missing, neutralize, generate, briefsByRole, check, fails, oneBriefsLine, briefsFailNames } from './helpers.mjs';

for (const [name, answers] of COMBOS) {
  test(`C4 ${name}: os 4 briefs dizem que o contrato é a issue GitHub, lida com gh`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    assert.deepEqual(ROLES.flatMap((r) => missing(raw[by[r]], CONTRACT).map((c) => `${by[r]}: ${c}`)), [], 'literais do contrato em falta');
  });
}

test('C4 mutação (en, rigorous): sem o `gh issue view <n> --json body,comments`, cada brief faz falhar a linha `briefs`, que diz o brief e o contrato', async () => {
  const { dest } = await generate(ANSWERS());
  const by = briefsByRole(dest);
  const before = check(dest);
  assert.equal(before.status, 0, 'pré-condição: o projeto sem mutação passa o check.cjs\n' + fails(before.out));
  assert.ok(oneBriefsLine(before.out), 'pré-condição: há uma e uma só linha `briefs` no check.cjs');
  const gh = CONTRACT['lido com gh issue view <n> --json body,comments'];
  const bad = [];
  for (const r of ROLES) {
    const f = join(dest, by[r]), orig = readFileSync(f, 'utf8');
    writeFileSync(f, neutralize(orig, gh));
    const post = check(dest);
    writeFileSync(f, orig);
    if (!briefsFailNames(post, by[r], 'contract')) bad.push(`${by[r]}: status ${post.status}\n${fails(post.out) || '(nenhuma linha FAIL)'}`);
  }
  assert.deepEqual(bad, [], 'briefs sem verificação do contrato (ou a linha `briefs` não diz o brief e a regra)');
});
