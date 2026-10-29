// F-06 critério 5: o `.checkpoints/README.md` gerado define o formato do checkpoint, com os campos literais `papel`, `ticket`,
// `fase`, `ronda`, `HEAD`, `próximo passo` e `pendências`, e o nome dos ficheiros `<papel>-<ticket>.md`.
// Resposta 5 na #7: o README fica na língua do projeto; um projeto em inglês tem os campos em inglês. Resposta 1: os literais
// verificam-se na saída do scaffold, antes da tradução, contra o template em inglês.
// Oráculo: no README gerado pelo scaffold (o template em inglês), nas 4 combinações língua × modo:
//   - os 7 campos com o nome inglês (a tradução palavra a palavra dos do critério: role, ticket, phase, round, HEAD, next step,
//     pending), contados fora do nome dos ficheiros;
//   - o nome dos ficheiros `<role>-<ticket>.md` (ou `<papel>-<ticket>.md`, o literal do critério);
//   - nenhum dos campos em português que não são também palavras inglesas (papel, fase, ronda, próximo passo, pendências);
//   - o README nasce ao lado do painel.json.
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, README, generate } from './helpers.mjs';

const FIELDS = { role: /\brole\b/i, ticket: /\bticket\b/i, phase: /\bphase\b/i, round: /\bround\b/i, HEAD: /\bHEAD\b/, 'next step': /\bnext step\b/i, pending: /\bpending\b/i };
const NAME = /<(role|papel)>-<ticket>\.md/g;
const PT = [/\bpapel\b/i, /\bfase\b/i, /\bronda\b/i, /pr[óo]ximo passo/i, /pend[êe]ncias/i];

for (const [name, answers] of COMBOS) {
  test(`C6 ${name}: o .checkpoints/README.md gerado tem os 7 campos em inglês e o nome dos ficheiros`, async () => {
    const { dest, raw } = await generate(answers);
    assert.ok(existsSync(join(dest, '.checkpoints/painel.json')), 'o painel.json do F-10 desapareceu');
    assert.equal(typeof raw[README], 'string', `o scaffold não gerou ${README}`);
    assert.ok(new RegExp(NAME.source).test(raw[README]), `o README não diz o nome dos ficheiros <role>-<ticket>.md`);
    // os campos contam fora do nome dos ficheiros (senão role e ticket passavam só por causa dele)
    const rest = raw[README].replace(NAME, ' ');
    assert.deepEqual(Object.entries(FIELDS).filter(([, re]) => !re.test(rest)).map(([k]) => k), [], 'campos em falta no README');
    assert.deepEqual(PT.filter((re) => re.test(raw[README])).map(String), [], 'campos em português no README do template em inglês');
  });
}
