// F-06, adenda do orquestrador 6499805500 (2026-10-29): a regra das sessões Claude reais aparece em cada brief gerado (dev,
// crítico, Ronda −1, lote), nos dois modos e nas duas línguas:
//   - o trabalho é só por subagentes lançados pelo orquestrador; nenhum agente delega trabalho numa janela ou sessão `claude` nova;
//   - os ataques e os testes usam sempre o `claude` falso ou o runtime falso;
//   - uma sessão real só serve de objeto de teste, na verificação final, uma vez por ticket, e só a fazem o crítico ou o tester;
//   - é sempre headless e curta (`claude -p` ou `claude plugin validate`), com `DISABLE_AUTOUPDATER=1`, Haiku, no máximo 3 chamadas,
//     nunca bypass, nunca morta a meio, e fica registada no checkpoint.
// Oráculo: os literais (helpers.mjs SESSIONS) em cada um dos 4 briefs, nas 4 combinações língua × modo (saída do scaffold, antes
// da tradução: PERGUNTA 1 na #7). A adenda não pede uma linha do check.cjs para esta regra (PERGUNTA 4 na #7).
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBOS, ROLES, SESSIONS, missing, generate, briefsByRole } from './helpers.mjs';

for (const [name, answers] of COMBOS) {
  test(`C5 ${name}: os 4 briefs têm a regra das sessões Claude reais, com todas as guardas`, async () => {
    const { dest, raw } = await generate(answers);
    const by = briefsByRole(dest);
    assert.deepEqual(ROLES.flatMap((r) => missing(raw[by[r]], SESSIONS).map((c) => `${by[r]}: ${c}`)), [], 'partes da regra em falta');
  });
}
