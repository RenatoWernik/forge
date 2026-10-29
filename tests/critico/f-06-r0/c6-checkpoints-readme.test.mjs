// F-06 critério 5: o `.checkpoints/README.md` gerado define o formato do checkpoint, com os campos literais `papel`, `ticket`,
// `fase`, `ronda`, `HEAD`, `próximo passo` e `pendências`, e o nome dos ficheiros `<papel>-<ticket>.md`.
// Oráculo: os literais, no README gerado pelo scaffold, nas 4 combinações língua × modo; o README nasce ao lado do painel.json.
// Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { COMBOS, README, generate } from './helpers.mjs';

const FIELDS = ['papel', 'ticket', 'fase', 'ronda', 'HEAD', 'próximo passo', 'pendências'];
const NAME = '<papel>-<ticket>.md';

for (const [name, answers] of COMBOS) {
  test(`C6 ${name}: o .checkpoints/README.md gerado tem os 7 campos literais e o nome dos ficheiros`, async () => {
    const { dest, raw } = await generate(answers);
    assert.ok(existsSync(join(dest, '.checkpoints/painel.json')), 'o painel.json do F-10 desapareceu');
    assert.equal(typeof raw[README], 'string', `o scaffold não gerou ${README}`);
    assert.ok(raw[README].includes(NAME), `o README não diz o nome dos ficheiros ${NAME}`);
    // os campos contam fora do nome dos ficheiros (senão `papel` e `ticket` passavam só por causa dele)
    const rest = raw[README].replaceAll(NAME, ' ');
    assert.deepEqual(FIELDS.filter((f) => !rest.includes(f)), [], 'campos literais em falta no README');
  });
}
