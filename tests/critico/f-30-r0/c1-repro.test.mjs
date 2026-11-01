// F-30 critério 1: o repro do #136. Oráculo (corpo da #141): scaffold num tmp; uma entrada E-001 com PREVENTION: text, SCOPE: project e um
// SYMPTOM com o nome «ACME»; `node .claude/learn.mjs readout`; `sync.main(['--project', dir])`. Nenhum ficheiro do patch contém «ACME»,
// `## Learned rules` nem os marcadores.
// Reprova: o bloco ainda no patch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, registo, readout, blocoDoProjeto, sincroniza, esperaSemBloco, ler } from './helpers.mjs';

test('C1 [ataque]: E-001 text/project com «ACME» no SYMPTOM, readout e sync.main: o patch não tem «ACME», «## Learned rules» nem os marcadores', async () => {
  const P = await novo();
  registo(P, 1);
  readout(P);
  assert.match(ler(P, 'CLAUDE.md'), /ACME/, 'pré-condição: o readout pôs a regra com «ACME» no CLAUDE.md');
  const bloco = blocoDoProjeto(P, 1);
  esperaSemBloco(await sincroniza(P), bloco);
});