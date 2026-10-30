// Ronda −1 do F-18 (#64, resolve #60, #62 e #63): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Reaproveita os helpers do lote do F-16 (tests/critico/f-16-r0/helpers.mjs: `lote`, `partido`, `argsDe`, sobre o runtime falso do F-09).
// O C3 (guarda do formatText) usa a máquina falsa do F-15b através de tests/critico/f-17-r0/helpers.mjs, importada só nesse ficheiro
// (os dois conjuntos de helpers exportam nomes iguais, como ROOT e tmp).
//
// LEITURA DO CONTRATO (corpo da #64, sem comentários à data, 2026-10-30): os textos abaixo são LITERAIS, copiados do corpo da issue.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from '../f-16-r0/helpers.mjs';

export * from '../f-16-r0/helpers.mjs';

export const BASE = '0c1bfae'; // a main antes do F-18

// C1 (#60): skills/new-project/SKILL.md, secção «## 1. Check the machine»
export const C1_FRASE = 'The check exits with `4` when something needs handling and with `0` when every component is `ok`: `4` is not a failure of the command, it is the cue to show the table and ask. Any other non-zero exit is an error of the command: stop and show its output.';
// C2 (#60): templates/BOOTSTRAP.md
export const C2_ANTIGO = '(`update.mjs --check`, or the `/forge:update` skill)';
export const C2_NOVO = '(`update.mjs --check`, which exits with `4` when something needs handling and that is not an error, or the `/forge:update` skill)';
// C3 (#63): skills/update/SKILL.md
export const C3_ANTIGA = 'The output can end with warnings';
export const C3_NOVA = 'Warnings show up in two places, and only some runs have any: a `warning:` line under the row of its component, and global warnings after the table (for example, a line saying that the original gauntlet-loop repository has new commits).';
export const C3_RESTO = 'Warnings are information only: they are never applied for the user. Report only the warnings that appear in the command output; never infer or add a warning that is not there.'; // o resto do parágrafo na base 0c1bfae, byte a byte
export const REGRA_F17 = 'Report only the warnings that appear in the command output; never infer or add a warning that is not there.';
// C4 (#62.1): os caracteres que o .trim() tirava das pontas e que não são separadores para a shell
export const PONTAS = [['NBSP', '\u00A0'], ['LS', '\u2028'], ['BOM', '\uFEFF'], ['CR', '\r'], ['LF', '\n']];
// C6 (#62.4)
export const C6_LIMITE = 'A file whose path has a space cannot be a filter: run the whole command instead.';

export const ler = (rel) => readFileSync(join(ROOT, rel), 'utf8').replaceAll('\r\n', '\n');
export const conta = (texto, frase) => texto.split(frase).length - 1;