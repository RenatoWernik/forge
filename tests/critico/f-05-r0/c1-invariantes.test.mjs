// F-05 critério 1: o CLAUDE.md gerado tem os 12 invariantes v3, com os títulos literais, cada um com a sua linha «Verifies:».
// Oráculo: a lista literal dos títulos (helpers.mjs TITLES), lida no CLAUDE.md que o scaffold escreve nas 4 combinações língua ×
// modo; mais a mutação «invariante sem Verifies:», feita a CADA um dos 12 (no CLAUDE.md e no AGENTS.md, para que a falha não venha
// do espelho), que tem de fazer falhar a linha `invariants` do check.cjs.
// Frases proibidas no CLAUDE.md (contradizem o v3 de forma direta): o loop «sem saída por número de rondas» e o claude-mem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TITLES, COMBOS, ANSWERS, generate, check, lineState, fails, edit, invariantBlock } from './helpers.mjs';

const FORBIDDEN = [/no exit by number of rounds/i, /claude-mem/i];

for (const [name, answers] of COMBOS) {
  test(`C1 ${name}: o CLAUDE.md gerado tem os 12 títulos literais como itens numerados, cada um com «Verifies:» no seu bloco`, async () => {
    const { raw } = await generate(answers);
    const problems = [];
    for (const t of TITLES) {
      const b = invariantBlock(raw['CLAUDE.md'], t);
      if (!b) problems.push(`«${t}»: não há item numerado «N. **${t}**»`);
      else if (!b.text.includes('Verifies:')) problems.push(`«${t}»: o bloco não tem «Verifies:»`);
    }
    assert.deepEqual(problems, []);
  });

  test(`C1 ${name}: o CLAUDE.md gerado não diz «no exit by number of rounds» nem fala do claude-mem`, async () => {
    const { raw } = await generate(answers);
    assert.deepEqual(FORBIDDEN.filter((re) => re.test(raw['CLAUDE.md'])).map(String), []);
  });

  test(`C1 ${name}: a linha «invariants» do check.cjs existe e está ok no projeto sem mutação`, async () => {
    const { dest } = await generate(answers);
    const r = check(dest);
    assert.equal(lineState(r.out, 'invariants'), 'ok', fails(r.out) || 'não há linha «invariants»');
  });
}

test('C1 mutação «invariante sem Verifies:»: tirar o «Verifies:» de qualquer um dos 12 invariantes faz falhar a linha «invariants»', async () => {
  const silent = [];
  for (const t of TITLES) {
    const { dest } = await generate(ANSWERS());
    for (const rel of ['CLAUDE.md', 'AGENTS.md']) {
      if (rel === 'AGENTS.md' && !existsSync(join(dest, rel))) continue;
      edit(dest, rel, (text) => {
        const b = invariantBlock(text, t);
        if (!b || !b.text.includes('Verifies:')) throw new Error(`${rel}: «${t}» sem bloco com «Verifies:» (pré-condição)`);
        const lines = text.split(/\r?\n/);
        lines.splice(b.start, b.end - b.start, ...b.text.replaceAll('Verifies:', 'Seen in:').split('\n'));
        return lines.join('\n');
      });
    }
    const r = check(dest);
    if (lineState(r.out, 'invariants') !== 'FAIL' || r.status !== 1) silent.push(`«${t}»: a linha «invariants» está ${lineState(r.out, 'invariants')}`);
  }
  assert.deepEqual(silent, []);
});
