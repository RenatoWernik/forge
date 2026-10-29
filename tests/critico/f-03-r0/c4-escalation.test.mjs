// F-03 critério 4: a escalation gerada tem as 4 condições com os limiares literais (sameCriterionFailures: 2, attacksRedOnDelivery: true,
// minutesWithoutProgress: 30, visualBelowReference: true), e cada condição tem uma descrição de uma linha.
// Oráculo: igualdade profunda com o literal ESCALATION (helpers.mjs), depois de ler a escalation com normalizeEscalation, que aceita
// uma lista de condições ou um objeto indexado pela condição (a issue não fixa a forma interna; ver PERGUNTA). Exatamente 4 condições.
// Vale para os dois modos e para as duas línguas: a issue não faz a escalation depender de nenhum deles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ANSWERS, ESCALATION, loadScaffold, readJson, tmp, normalizeEscalation } from './helpers.mjs';

for (const [mode, language] of [['rigorous', 'English'], ['accelerated', 'English'], ['rigorous', 'Portuguese (Brazil)'], ['accelerated', 'Portuguese (Brazil)']]) {
  test(`C4 escalation gerada (${mode}, ${language}): exatamente as 4 condições com os limiares literais, cada uma com uma descrição de uma linha`, async () => {
    const { scaffold } = await loadScaffold();
    const dest = tmp('c4-');
    await scaffold(ANSWERS({ mode, language }), { dest });
    const fj = readJson(join(dest, '.claude/forge.json'));
    assert.ok(fj.escalation !== undefined, 'o forge.json gerado não tem escalation');
    const { count, map, descriptions } = normalizeEscalation(fj.escalation);
    assert.equal(count, 4, 'número de condições: ' + JSON.stringify(fj.escalation));
    assert.deepEqual(map, ESCALATION);
    for (const [k, d] of Object.entries(descriptions)) {
      assert.equal(typeof d, 'string', `${k}: sem descrição (um único texto na condição)`);
      assert.ok(d.trim().length > 0, `${k}: descrição vazia`);
      assert.ok(!/[\r\n]/.test(d), `${k}: a descrição tem mais de uma linha`);
    }
  });
}
