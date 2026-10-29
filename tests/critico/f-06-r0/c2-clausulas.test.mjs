// F-06 critério 2: cada brief tem as suas cláusulas obrigatórias.
//   Crítico: o teste de materialidade com os 3 critérios; a lista do que é MENOR; o formato do veredito (VEREDITO, BLOQUEANTES,
//            MENORES, PERGUNTAS À BARRA, SEGUIMENTO); R1 exaustiva e rondas seguintes curtas.
//   Ronda −1: «exatamente o oráculo, sem acrescentar exigências»; LACUNAS DA BARRA; provar que os ataques falham na base; não
//            editar código do produto.
//   Dev: correção por classe com um teste da classe; `/ponytail-review` com os «Must fix» e os «Should fix» corrigidos antes de
//        entregar; os ataques da Ronda −1 a verde; «o contrato ganha ao ataque»; a Ronda 0.
//   Lote: fusão aditiva; a regra dos flaky; a regressão volta à peça que a causou; nenhum push, PR ou merge sem o sim do utilizador.
// Oráculo: a tabela literal das cláusulas (helpers.mjs CLAUSES; a lista do MENOR vem da história 28 da spec: cosmética, leitura
// literal, ambiguidade, erro do próprio ataque), nas 4 combinações língua × modo; e uma mutação por cláusula (os literais dela
// neutralizados no brief), em cada modo, que faz falhar a linha `briefs` do check.cjs. Estas mutações por cláusula correm aqui e
// não no corpus partilhado, que leva uma só por classe (resposta 6 na #7).
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, ANSWERS, ROLES, CLAUSES, missing, neutralize, generate, briefsByRole, check, lineState, fails, oneBriefsLine } from './helpers.mjs';

for (const [name, answers] of COMBOS) {
  test(`C2 ${name}: cada brief tem as suas cláusulas obrigatórias`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    assert.deepEqual(ROLES.flatMap((r) => missing(raw[by[r]], CLAUSES[r]).map((c) => `${by[r]}: ${c}`)), [], 'cláusulas em falta');
  });
}

for (const mode of ['rigorous', 'accelerated']) {
  test(`C2 mutações (en, ${mode}): cada cláusula retirada do seu brief faz falhar a linha «briefs»`, async () => {
    const { dest } = await generate(ANSWERS({ mode }));
    const by = briefsByRole(dest);
    const before = check(dest);
    assert.equal(lineState(before.out, 'briefs'), 'ok', 'pré-condição: a linha «briefs» existe e está ok no projeto sem mutação\n' + fails(before.out));
    assert.ok(oneBriefsLine(before.out), 'pré-condição: há uma e uma só linha `briefs` no check.cjs');
    const bad = [];
    for (const r of ROLES) {
      const f = join(dest, by[r]), orig = readFileSync(f, 'utf8');
      for (const [clause, res] of Object.entries(CLAUSES[r])) {
        const text = neutralize(orig, res);
        assert.ok(missing(text, { [clause]: res }).length === 1, `a mutação não retirou «${clause}» de ${by[r]}`);
        writeFileSync(f, text);
        const post = check(dest);
        writeFileSync(f, orig);
        if (post.status !== 1 || lineState(post.out, 'briefs') !== 'FAIL') bad.push(`${by[r]} sem «${clause}»: status ${post.status}, briefs ${lineState(post.out, 'briefs')}`);
      }
    }
    assert.deepEqual(bad, [], 'cláusulas sem verificação');
  });
}
