// F-30 critério 5: o fim do problema. Oráculo (corpo da #141): um projeto gerado a partir do pacote com o patch do C1 aplicado passa na linha
// `learnings: the Learned rules block matches the register`.
// LEITURA (helpers.mjs): o pacote é uma cópia de scripts/ e templates/ numa pasta nova com git; o patch do C1 aplica-se com `git apply` (um patch
// vazio não se aplica: nada a mudar); o projeto novo sai do scaffold dessa cópia e o check corre com --today. Só a linha do oráculo conta.
// Reprova: o bloco ainda no patch (o projeto novo nasce com as regras de outro projeto e o registo vazio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, registo, readout, sincroniza, correu, pacoteCom, geraDe, check, linha, L_BLOCO } from './helpers.mjs';

test(`C5 [ataque]: o projeto gerado do pacote com o patch do C1 aplicado tem «ok» na linha «${L_BLOCO}»`, async () => {
  const P = await novo();
  registo(P, 1);
  readout(P);
  const r = await sincroniza(P);
  correu(r);
  const N = await geraDe(pacoteCom(r.patch));
  const c = check(N);
  const l = linha(c, L_BLOCO);
  assert.ok(l, `pré-condição: o check do projeto novo não tem a linha «${L_BLOCO}»:\n` + c.out.slice(-1800));
  assert.ok(l.startsWith('ok    '), `o projeto novo falha a linha do bloco:\n${l}`);
});