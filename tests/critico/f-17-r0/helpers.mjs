// Ronda −1 do F-17 (#58): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Reaproveita a máquina falsa do F-15b (tests/critico/f-15b-r0/helpers.mjs): `main(argv, sys, write)` de scripts/update.mjs com um sys
// espião sobre uma pasta temporária; as versões vêm de uma fonte fixa (sem rede: o fetch global e o http(s) lançam e contam); HOME,
// USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma isca temporária. Nenhum ataque abre uma sessão `claude` nem corre um comando real.
//
// LEITURA DO CONTRATO (corpo da #58; sem comentários à data, 2026-10-30):
//   - o --check (também sem flags e com --json) sai com 4 quando há componentes `missing`, `outdated` ou `unverified`, e com 0 quando
//     está tudo `ok`; o 1 fica só para erros reais; o 2 e o 3 não mudam;
//   - `customized` sozinho: o contrato não diz se é 0 ou 4, mas não é um erro real, por isso nunca 1 (PERGUNTA P1 na #58);
//   - `unknown` sozinho: o contrato não diz se é 1 ou 4, mas não é «tudo ok», por isso nunca 0 (PERGUNTA P2 na #58);
//   - o alvo `forge` é uma linha do array `components` do --check, por isso conta como componente.
export * from '../f-15b-r0/helpers.mjs';
export const BASE = '712b690'; // a main antes do F-17
export const REGRA = 'Report only the warnings that appear in the command output; never infer or add a warning that is not there.';
export const CHECKS = [['--check'], ['--check', '--json'], []]; // as três formas do --check: o código é o mesmo nas três
