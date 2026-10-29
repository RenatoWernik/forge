// F-03 critério 4: a escalation gerada tem as 4 condições com os limiares literais (sameCriterionFailures: 2, attacksRedOnDelivery: true,
// minutesWithoutProgress: 30, visualBelowReference: true), e cada condição tem uma descrição de uma linha.
// Forma (resposta à PERGUNTA 2 na #4): um objeto com uma chave por condição, cada uma { value, description }.
// Oráculo: as chaves são exatamente as 4; igualdade profunda dos `value` com o literal ESCALATION (helpers.mjs); cada description é
// texto não vazio, de uma linha. Vale para os dois modos e para as duas línguas: a issue não faz a escalation depender deles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ANSWERS, ESCALATION, loadScaffold, readJson, tmp } from './helpers.mjs';

for (const [mode, language] of [['rigorous', 'English'], ['accelerated', 'English'], ['rigorous', 'Portuguese (Brazil)'], ['accelerated', 'Portuguese (Brazil)']]) {
  test(`C4 escalation gerada (${mode}, ${language}): um objeto com exatamente as 4 condições, cada uma { value, description }, com os limiares literais e uma descrição de uma linha`, async () => {
    const { scaffold } = await loadScaffold();
    const dest = tmp('c4-');
    await scaffold(ANSWERS({ mode, language }), { dest });
    const esc = readJson(join(dest, '.claude/forge.json')).escalation;
    assert.ok(esc && typeof esc === 'object' && !Array.isArray(esc), 'a escalation não é um objeto: ' + JSON.stringify(esc));
    assert.deepEqual(Object.keys(esc).sort(), Object.keys(ESCALATION).sort());
    assert.deepEqual(Object.fromEntries(Object.entries(esc).map(([k, c]) => [k, c?.value])), ESCALATION);
    for (const [k, c] of Object.entries(esc)) {
      assert.equal(typeof c.description, 'string', `${k}: sem description`);
      assert.ok(c.description.trim().length > 0, `${k}: description vazia`);
      assert.ok(!/[\r\n]/.test(c.description), `${k}: a description tem mais de uma linha`);
    }
  });
}
