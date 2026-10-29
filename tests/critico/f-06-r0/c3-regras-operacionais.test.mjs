// F-06 critério 3: os 4 briefs têm as regras operacionais:
//   - nunca matar processos por nome (`taskkill /IM`, `killall`, `pkill`), só por PID;
//   - testes em primeiro plano, por blocos de até 9 min, e nunca com `run_in_background`;
//   - checkpoint em `.checkpoints/` depois de cada etapa.
// Oráculo: os literais (helpers.mjs OPS) em cada brief, nas 4 combinações língua × modo; e uma mutação por regra e por brief (os
// literais da regra neutralizados) que faz o check.cjs sair com 1 numa linha cujo nome fala de briefs (o ticket não nomeia a
// linha: PERGUNTA 3 na #7).
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, ANSWERS, ROLES, OPS, missing, neutralize, generate, briefsByRole, check, fails, briefLineFails } from './helpers.mjs';

for (const [name, answers] of COMBOS) {
  test(`C3 ${name}: os 4 briefs têm as 3 regras operacionais`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    assert.deepEqual(ROLES.flatMap((r) => missing(raw[by[r]], OPS).map((c) => `${by[r]}: ${c}`)), [], 'regras em falta');
  });
}

test('C3 mutações (en, rigorous): cada regra retirada de cada brief faz falhar a linha dos briefs', async () => {
  const { dest } = await generate(ANSWERS());
  const by = briefsByRole(dest);
  const before = check(dest);
  assert.equal(before.status, 0, 'pré-condição: o projeto sem mutação passa o check.cjs\n' + fails(before.out));
  const bad = [];
  for (const r of ROLES) {
    const f = join(dest, by[r]), orig = readFileSync(f, 'utf8');
    for (const [rule, res] of Object.entries(OPS)) {
      writeFileSync(f, neutralize(orig, res));
      const post = check(dest);
      writeFileSync(f, orig);
      if (post.status !== 1 || !briefLineFails(post.out)) bad.push(`${by[r]} sem «${rule}»: status ${post.status}\n${fails(post.out) || '(nenhuma linha FAIL)'}`);
    }
  }
  assert.deepEqual(bad, [], 'regras sem verificação');
});
