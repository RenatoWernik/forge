// F-30 critério 3: sem perder o que é legítimo. Oráculo (corpo da #141): uma linha nova do utilizador no CLAUDE.md, fora do bloco, continua a
// aparecer no patch («Com o bloco retirado, o resto do ficheiro compara-se como hoje»).
// LEITURA: «aparece no patch» = a linha está entre as acrescentadas do diff de templates/CLAUDE.md. Fora do bloco = antes do título
// `## Learned rules` (escrita antes do readout) ou depois do marcador de fim (escrita depois do readout: o bloco fica a meio).
// GUARDAS: na base o sync já leva a linha (e o bloco); ficam verdes na base e têm de continuar verdes com a correção.
// Reprova: perder uma alteração legítima fora do bloco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, registo, crlf, readout, acrescenta, blocoDoProjeto, sincroniza, correu, acrescentadas, ficheirosDoPatch } from './helpers.mjs';

const LINHA = 'Invoices are reviewed by the finance team every Friday.';
const esperaLinha = (r) => {
  correu(r);
  assert.ok(ficheirosDoPatch(r.patch).includes('templates/CLAUDE.md'), 'o patch não tem templates/CLAUDE.md: a linha do utilizador perdeu-se');
  const doClaude = r.patch.replace(/\r\n/g, '\n').split(/^(?=diff --git )/m).find((s) => s.startsWith('diff --git a/templates/CLAUDE.md '));
  assert.ok(acrescentadas(doClaude).includes(LINHA), `a linha do utilizador «${LINHA}» não está entre as acrescentadas de templates/CLAUDE.md`);
};

for (const eol of ['LF', 'CRLF']) {
  test(`C3 [guarda]: ${eol}, uma linha nova do utilizador ANTES do bloco continua no patch`, async () => {
    const P = await novo();
    registo(P, 1);
    if (eol === 'CRLF') crlf(P);
    acrescenta(P, [LINHA], ['CLAUDE.md']);
    readout(P);
    blocoDoProjeto(P, 1);
    esperaLinha(await sincroniza(P));
  });

  test(`C3 [guarda]: ${eol}, uma linha nova do utilizador DEPOIS do bloco (bloco a meio) continua no patch`, async () => {
    const P = await novo();
    registo(P, 1);
    if (eol === 'CRLF') crlf(P);
    readout(P);
    acrescenta(P, [LINHA], ['CLAUDE.md']);
    blocoDoProjeto(P, 1);
    esperaLinha(await sincroniza(P));
  });
}