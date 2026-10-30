// Ronda −1 do F-17 (#58): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Reaproveita a máquina falsa do F-15b (tests/critico/f-15b-r0/helpers.mjs): `main(argv, sys, write)` de scripts/update.mjs com um sys
// espião sobre uma pasta temporária; as versões vêm de uma fonte fixa (sem rede: o fetch global e o http(s) lançam e contam); HOME,
// USERPROFILE e CLAUDE_CONFIG_DIR apontam para uma isca temporária. Nenhum ataque abre uma sessão `claude` nem corre um comando real.
//
// LEITURA DO CONTRATO (corpo da #58 mais as respostas do orquestrador às P1–P6, comentário de 2026-10-30):
//   - o --check (também sem flags e com --json) sai com 4 quando há componentes `missing`, `outdated`, `unverified`, `customized` ou
//     `unknown` (também misturados), e com 0 quando está tudo `ok`; o 1 fica só para erros do comando; o 2 e o 3 não mudam;
//   - o alvo `forge` conta como componente; o --apply mantém os seus códigos (P6).
export * from '../f-15b-r0/helpers.mjs';
export const BASE = '712b690'; // a main antes do F-17
export const REGRA = 'Report only the warnings that appear in the command output; never infer or add a warning that is not there.';
export const CHECKS = [['--check'], ['--check', '--json'], []]; // as três formas do --check: o código é o mesmo nas três
