// F-30 critério 4: bloco mal formado. Oráculo (corpo da #141): só o marcador `start`, ou só o `end`, dá exit 3, uma mensagem que nomeia o ficheiro
// e nenhum patch («Nunca o leva para o patch»).
// LEITURA (helpers.mjs): o readout escreve o bloco nos dois ficheiros e depois tira-se a linha de um marcador de UM deles; a mensagem tem de
// nomear esse ficheiro numa linha do stderr fora do resumo «forge sync: N file(s) differ ...»; «nenhum patch» = stdout vazio e, com --out, o
// ficheiro inexistente ou vazio. O SYMPTOM não tem dados do projeto, para que nenhum outro aviso dê o 3.
// Reprova: o bloco ainda no patch.
import { test } from 'node:test';
import { join } from 'node:path';
import { novo, registo, crlf, readout, tiraMarcador, sincroniza, esperaRecusa, pasta, INI, FIM } from './helpers.mjs';

const NEUTRO = (n) => `the nightly export dropped a column (case ${n})`;
const caso = async ({ f, falta, eol = 'LF' }) => {
  const P = await novo();
  registo(P, 1, 'en', NEUTRO);
  if (eol === 'CRLF') crlf(P);
  readout(P);
  tiraMarcador(P, f, falta === 'end' ? FIM : INI);
  return P;
};

for (const f of ['CLAUDE.md', 'AGENTS.md']) {
  test(`C4 [ataque]: só o marcador start em ${f} (sem o end): exit 3, mensagem com ${f} e nenhum patch`, async () => {
    const P = await caso({ f, falta: 'end' });
    esperaRecusa(await sincroniza(P), f);
  });
  test(`C4 [ataque]: só o marcador end em ${f} (sem o start): exit 3, mensagem com ${f} e nenhum patch`, async () => {
    const P = await caso({ f, falta: 'start' });
    esperaRecusa(await sincroniza(P), f);
  });
}

test('C4 [ataque]: CRLF, só o marcador start em CLAUDE.md: exit 3, mensagem com CLAUDE.md e nenhum patch', async () => {
  const P = await caso({ f: 'CLAUDE.md', falta: 'end', eol: 'CRLF' });
  esperaRecusa(await sincroniza(P), 'CLAUDE.md');
});

test('C4 [ataque]: com --out, só o marcador end em AGENTS.md: exit 3, mensagem com AGENTS.md e nenhum ficheiro de patch', async () => {
  const P = await caso({ f: 'AGENTS.md', falta: 'start' });
  const saida = join(pasta('critico-f30-out-'), 'sync.patch');
  esperaRecusa(await sincroniza(P, { extra: ['--out', saida] }), 'AGENTS.md', saida);
});