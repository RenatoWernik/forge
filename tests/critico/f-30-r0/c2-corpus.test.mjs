// F-30 critério 2: o corpus das variantes. Oráculo (corpo da #141): o C1 repete-se com 0, 1 e 3 entradas; fins de linha CRLF e LF; o bloco no
// fim do ficheiro e o bloco a meio (com texto do utilizador depois); EN e PT. Em todas, o patch não leva o bloco.
// O corpus é o produto das quatro variantes: 3 × 2 × 2 × 2 = 24 casos. LEITURA (helpers.mjs): o CRLF vale para o CLAUDE.md e o AGENTS.md (o
// readout mantém o fim de linha de cada ficheiro); «a meio» = depois do readout, um título e uma linha do utilizador no fim dos dois ficheiros;
// PT = projeto em Portuguese (Portugal) e SYMPTOM em português.
// Reprova: o bloco ainda no patch em qualquer caso do corpus.
import { test } from 'node:test';
import { novo, registo, crlf, readout, acrescenta, blocoDoProjeto, sincroniza, esperaSemBloco } from './helpers.mjs';

const DEPOIS = { en: ['## Team notes', '', 'Invoices are reviewed by the finance team every Friday.'], pt: ['## Notas da equipa', '', 'As faturas são revistas pela equipa financeira à sexta-feira.'] };

for (const n of [0, 1, 3]) {
  for (const eol of ['LF', 'CRLF']) {
    for (const pos of ['no fim', 'a meio']) {
      for (const lingua of ['en', 'pt']) {
        test(`C2 [ataque]: ${n} entrada(s), ${eol}, bloco ${pos}, ${lingua.toUpperCase()}: o patch não leva o bloco`, async () => {
          const P = await novo(lingua);
          registo(P, n, lingua);
          if (eol === 'CRLF') crlf(P);
          readout(P);
          if (pos === 'a meio') acrescenta(P, DEPOIS[lingua]);
          const bloco = blocoDoProjeto(P, n);
          esperaSemBloco(await sincroniza(P, { lingua }), bloco);
        });
      }
    }
  }
}