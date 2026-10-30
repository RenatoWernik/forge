// F-06, adenda do orquestrador 6499805500 (2026-10-29): a regra das sessões Claude reais aparece em cada brief gerado (dev,
// crítico, Ronda −1, lote), nos dois modos e nas duas línguas:
//   - o trabalho é só por subagentes lançados pelo orquestrador; nenhum agente delega trabalho numa janela ou sessão `claude` nova;
//   - os ataques e os testes usam sempre o `claude` falso ou o runtime falso;
//   - uma sessão real só serve de objeto de teste, na verificação final, uma vez por ticket, e só a fazem o crítico ou o tester;
//   - é sempre headless e curta (`claude -p` ou `claude plugin validate`), com `DISABLE_AUTOUPDATER=1`, Haiku, no máximo 3 chamadas,
//     nunca bypass, nunca morta a meio, e fica registada no checkpoint.
// Oráculo:
//   - os literais (helpers.mjs SESSIONS) em cada um dos 4 briefs, nas 4 combinações língua × modo (saída do scaffold, antes da
//     tradução: resposta 1 na #7);
//   - resposta 4 na #7: a regra está coberta pela linha `briefs`; a mutação tira a regra inteira de um brief (todos os literais de
//     SESSIONS neutralizados) e faz o check.cjs sair com 1 e a linha `briefs` falhar a dizer qual o brief e que falta a regra
//     das sessões. Corre em cada um dos 4 briefs.
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, ANSWERS, ROLES, SESSIONS, missing, neutralize, generate, briefsByRole, check, fails, oneBriefsLine, briefsFailNames } from './helpers.mjs';

for (const [name, answers] of COMBOS) {
  test(`C5 ${name}: os 4 briefs têm a regra das sessões Claude reais, com todas as guardas`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    assert.deepEqual(ROLES.flatMap((r) => missing(raw[by[r]], SESSIONS).map((c) => `${by[r]}: ${c}`)), [], 'partes da regra em falta');
  });
}

test('C5 mutação (en, rigorous): sem a regra das sessões reais, cada brief faz falhar a linha `briefs`, que diz o brief e a regra', async () => {
  const { dest } = await generate(ANSWERS());
  const by = briefsByRole(dest);
  const before = check(dest);
  assert.equal(before.status, 0, 'pré-condição: o projeto sem mutação passa o check.cjs\n' + fails(before.out));
  assert.ok(oneBriefsLine(before.out), 'pré-condição: há uma e uma só linha `briefs` no check.cjs');
  const all = Object.values(SESSIONS).flat();
  const bad = [];
  for (const r of ROLES) {
    const f = join(dest, by[r]), orig = readFileSync(f, 'utf8');
    const text = neutralize(orig, all);
    assert.equal(missing(text, SESSIONS).length, Object.keys(SESSIONS).length, `a mutação não tirou a regra toda de ${by[r]}`);
    writeFileSync(f, text);
    const post = check(dest);
    writeFileSync(f, orig);
    if (!briefsFailNames(post, by[r], 'sessions')) bad.push(`${by[r]}: status ${post.status}\n${fails(post.out) || '(nenhuma linha FAIL)'}`);
  }
  assert.deepEqual(bad, [], 'briefs sem verificação da regra das sessões (ou a linha `briefs` não diz o brief e a regra)');
});
