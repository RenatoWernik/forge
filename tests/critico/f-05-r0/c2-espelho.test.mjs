// F-05 critério 2: existe um AGENTS.md gerado, espelho do CLAUDE.md (o mesmo texto de invariantes), e a linha
// «AGENTS.md mirrors CLAUDE.md» do check.cjs falha quando um invariante muda só num dos dois ficheiros.
// Oráculo:
//   - nas 4 combinações língua × modo, o bloco de cada um dos 12 invariantes é igual, byte a byte, no CLAUDE.md e no AGENTS.md;
//   - as duas mutações do ticket (alteração só no CLAUDE.md, alteração só no AGENTS.md), feitas a CADA um dos 12 invariantes em
//     inglês e a um invariante em português (projeto já «traduzido»), fazem falhar a linha;
//   - sem alarme falso: os blocos que os instaladores acrescentam no fim do CLAUDE.md («## graphify», «## Agent skills», passo 6 do
//     BOOTSTRAP e graphify) não fazem falhar a linha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITLES, COMBOS, ANSWERS, ANSWERS_PT, generate, check, lineState, fails, edit, invariantBlock } from './helpers.mjs';

const MIRROR = 'AGENTS.md mirrors CLAUDE.md';

for (const [name, answers] of COMBOS) {
  test(`C2 ${name}: o AGENTS.md é gerado e cada um dos 12 invariantes tem o mesmo bloco no CLAUDE.md e no AGENTS.md`, async () => {
    const { raw } = await generate(answers);
    assert.equal(typeof raw['AGENTS.md'], 'string', 'o scaffold não gerou AGENTS.md');
    const diff = [];
    for (const t of TITLES) {
      const [c, a] = [invariantBlock(raw['CLAUDE.md'], t), invariantBlock(raw['AGENTS.md'], t)];
      if (!c || !a) diff.push(`«${t}»: falta no ${!c ? 'CLAUDE.md' : 'AGENTS.md'}`);
      else if (c.text !== a.text) diff.push(`«${t}»: blocos diferentes`);
    }
    assert.deepEqual(diff, []);
  });

  test(`C2 ${name}: a linha «${MIRROR}» existe e está ok no projeto sem mutação`, async () => {
    const { dest } = await generate(answers);
    const r = check(dest);
    assert.equal(lineState(r.out, MIRROR), 'ok', fails(r.out) || `não há linha «${MIRROR}»`);
  });
}

// Muda o bloco do invariante `title` só em `rel`: acrescenta « x» à primeira linha. Em português, a linha é localizada no texto do
// scaffold (`raw`), porque o substituto da tradução mantém o número de linhas e apaga o título.
const touch = (dest, rel, raw, title) => edit(dest, rel, (text) => {
  const b = invariantBlock(raw[rel], title);
  if (!b) throw new Error(`${rel}: sem o invariante «${title}» (pré-condição)`);
  const lines = text.split(/\r?\n/);
  lines[b.start] += ' x';
  return lines.join('\n');
});

for (const rel of ['CLAUDE.md', 'AGENTS.md']) {
  test(`C2 mutação «só no ${rel}» (inglês): mudar qualquer um dos 12 invariantes só no ${rel} faz falhar a linha «${MIRROR}»`, async () => {
    const silent = [];
    for (const t of TITLES) {
      const { dest, raw } = await generate(ANSWERS());
      touch(dest, rel, raw, t);
      const r = check(dest);
      if (lineState(r.out, MIRROR) !== 'FAIL' || r.status !== 1) silent.push(`«${t}»: a linha está ${lineState(r.out, MIRROR)}`);
    }
    assert.deepEqual(silent, []);
  });

  for (const mode of ['rigorous', 'accelerated']) {
    test(`C2 mutação «só no ${rel}» (português, ${mode}): mudar «The ticket is the contract» só no ${rel} faz falhar a linha`, async () => {
      const { dest, raw } = await generate(ANSWERS_PT({ mode }));
      touch(dest, rel, raw, 'The ticket is the contract');
      const r = check(dest);
      assert.equal(lineState(r.out, MIRROR), 'FAIL', fails(r.out));
      assert.equal(r.status, 1);
    });
  }
}

const GENERATED = '\n## graphify\n\nThis project has a graphify knowledge graph at `graphify-out/`.\n\n## Agent skills\n\n### Issue tracker\n\nIssues live in GitHub Issues. See `docs/agents/issue-tracker.md`.\n';
for (const [name, answers] of [['en', ANSWERS()], ['pt', ANSWERS_PT()]]) {
  test(`C2 sem alarme falso (${name}): os blocos dos instaladores no fim do CLAUDE.md não fazem falhar a linha «${MIRROR}»`, async () => {
    const { dest } = await generate(answers);
    edit(dest, 'CLAUDE.md', (t) => t.replace(/\s*$/, '\n') + GENERATED);
    const r = check(dest);
    assert.equal(lineState(r.out, MIRROR), 'ok', fails(r.out) || `não há linha «${MIRROR}»`);
  });
}
