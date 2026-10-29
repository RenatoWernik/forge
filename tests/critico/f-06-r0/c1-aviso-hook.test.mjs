// F-06 critério 1: os 4 briefs gerados abrem, nas primeiras 5 linhas, com o aviso de que os avisos de contexto do hook
// («CONTEXT WARNING/CRITICAL») são da sessão do orquestrador e nunca são motivo para parar.
// Oráculo:
//   - literais (helpers.mjs HOOK), todos dentro das 5 primeiras linhas de cada brief, nas 4 combinações língua × modo;
//   - 8 mutações por modo, duas por brief (o aviso retirado; o aviso passado para depois da linha 5), cada uma a fazer o
//     check.cjs sair com 1 e uma linha cujo nome fala de briefs falhar (o ticket não nomeia a linha: PERGUNTA 3 na #7).
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, ANSWERS, ROLES, HOOK, HOOK_LINES, hookAtTop, generate, briefsByRole, check, fails, briefLineFails } from './helpers.mjs';

for (const [name, answers] of COMBOS) {
  test(`C1 ${name}: os 4 briefs têm o aviso do hook nas primeiras ${HOOK_LINES} linhas`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    assert.deepEqual(ROLES.filter((r) => !hookAtTop(raw[by[r]])).map((r) => by[r]), [], 'briefs sem o aviso no topo');
  });
}

// Linhas do topo que pertencem ao aviso: as das primeiras 5 que casam com algum literal dele
const warningLines = (text) => text.split(/\r?\n/).slice(0, HOOK_LINES).map((l, i) => [l, i]).filter(([l]) => HOOK.some((re) => re.test(l))).map(([, i]) => i);
const removeWarning = (text) => { const idx = new Set(warningLines(text)); return text.split(/\r?\n/).filter((_, i) => !idx.has(i)).join('\n'); };
const moveWarning = (text) => {
  const lines = text.split(/\r?\n/), idx = new Set(warningLines(text));
  const rest = lines.filter((_, i) => !idx.has(i)), moved = lines.filter((_, i) => idx.has(i));
  return [...rest.slice(0, HOOK_LINES + 2), '', ...moved, '', ...rest.slice(HOOK_LINES + 2)].join('\n');
};

for (const mode of ['rigorous', 'accelerated']) {
  test(`C1 mutações (en, ${mode}): o aviso retirado ou passado para depois da linha ${HOOK_LINES}, em cada brief, faz falhar a linha dos briefs`, async () => {
    const { dest } = await generate(ANSWERS({ mode }));
    const by = briefsByRole(dest);
    const before = check(dest);
    assert.equal(before.status, 0, 'pré-condição: o projeto sem mutação passa o check.cjs\n' + fails(before.out));
    const bad = [];
    for (const r of ROLES) {
      const f = join(dest, by[r]), orig = readFileSync(f, 'utf8');
      for (const [kind, mut] of [['retirado', removeWarning], ['passado para baixo', moveWarning]]) {
        const text = mut(orig);
        assert.ok(!hookAtTop(text), `a mutação «${kind}» não tirou o aviso do topo de ${by[r]}`);
        if (kind === 'passado para baixo') assert.ok(HOOK.slice(0, 2).every((re) => re.test(text)), `o aviso perdeu-se ao passar para baixo em ${by[r]}`);
        writeFileSync(f, text);
        const post = check(dest);
        writeFileSync(f, orig);
        if (post.status !== 1 || !briefLineFails(post.out)) bad.push(`${by[r]} (aviso ${kind}): status ${post.status}\n${fails(post.out) || '(nenhuma linha FAIL)'}`);
      }
    }
    assert.deepEqual(bad, [], 'mutações sem verificação');
  });
}
