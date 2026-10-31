// Ponte do F-25 (#81): só adapta a forma do mod do painel para os ataques de tests/critico/f-25-r0 (API no topo de helpers.mjs).
// Cada painel é uma instância de criarRelogio(), como a que o hooks/painel.tsx cria ao carregar, e cada hook chama evento().
import { criarRelogio, evento, ecra } from '../../scripts/mod-painel.mjs';

export function criar() {
  const relogio = criarRelogio();
  return {
    armar: relogio.armar,
    vigiar: relogio.vigiar,
    volta: relogio.volta,
    evento: (nome, $, e, r) => evento($, relogio, nome, e, r),
    ecra: ($, colunas) => ecra($, relogio, colunas),
  };
}
