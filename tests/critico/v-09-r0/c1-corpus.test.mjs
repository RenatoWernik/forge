// V-09 C1 (#133): «com uma mutação cada no corpus». Cada literal tem em scripts/corpus/mutations/ uma mutação (file, find com o literal, replace
// sem ele) que, aplicada como no f-02-r0 C2, põe a sua linha a FAIL. A secção 10.5 do FRAMEWORK em inglês leva o literal do avancar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGRAS, AVANCAR, EN, loadCorpus, gerar, conjunto, aplicaMutacao } from './helpers.mjs';

const muts = await loadCorpus('mutations');

for (const { file, lit } of REGRAS) {
  test(`C1: scripts/corpus/mutations/ tem uma mutação de \`${lit}\` em ${file}, que põe a sua linha a FAIL`, async () => {
    const delas = muts.filter(({ value: m }) => m?.file === file && typeof m.find === 'string' && m.find.includes(lit) && !String(m.replace).includes(lit));
    assert.ok(delas.length, `nenhuma mutação com file ${file} e find com o literal`);
    for (const m of delas) await aplicaMutacao(m);
  });
}

test('C1: no projeto em inglês, o literal do avancar está na secção 10.5 do FRAMEWORK.md', async () => {
  const t = readFileSync(join(await gerar(await conjunto(EN)), 'FRAMEWORK.md'), 'utf8');
  const i = t.indexOf('### 10.5 '), j = t.indexOf('### 10.6 ');
  assert.ok(i >= 0 && j > i, 'o FRAMEWORK.md perdeu as secções 10.5 e 10.6');
  assert.ok(t.slice(i, j).includes('`' + AVANCAR), `a secção 10.5 não tem \`${AVANCAR}\` num code span`);
});