// Ronda −1 do F-16 (#57, resolve #56): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Reaproveita o runtime falso do F-09 (tests/critico/f-09-r0/helpers.mjs: vm só com args, agent, parallel, phase e log; pasta
// temporária própria; HOME, USERPROFILE e CLAUDE_CONFIG_DIR em tmp). Nenhum ataque abre uma sessão `claude`.
//
// LEITURA DO CONTRATO (corpo da #57; sem comentários à data, 2026-10-30). Cada ponto ajusta-se AQUI, num só sítio:
//   - com 2 ou mais blocos distintos numa passagem (`pass`), cada bloco tem de ser o testCommand (suite) ou o e2eCommand (e2e) seguido
//     de um filtro que é um ficheiro ou uma pasta que EXISTE no projeto; um bloco que não o é dá `batch.verdict: 'fail'` com
//     `reason: 'runs'` (critério 2);
//   - um bloco único continua a ser exatamente o testCommand ou o e2eCommand (A4d, critério 3);
//   - SEAM PROVISÓRIO (PERGUNTA P1 na #57): o workflow corre numa vm sem sistema de ficheiros («scripts cannot read files»), por isso
//     só sabe que um filtro existe se os args lho disserem. Os ataques passam a lista dos ficheiros do projeto, relativos à raiz e com
//     «/», em `args[EXISTE]`, e criam os mesmos ficheiros no disco, numa pasta temporária que é o `root`. Uma pasta existe quando um
//     ficheiro da lista está dentro dela. Se o orquestrador fixar outro nome ou outra forma, só `EXISTE` e `argsDe()` mudam.
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmp, batchArgs, pieces, runWf, fakeImpl, BATCH, CMD } from '../f-09-r0/helpers.mjs';

export * from '../f-09-r0/helpers.mjs';

export const EXISTE = 'projectFiles'; // PERGUNTA P1
export const BASE = '712b690'; // a main antes do F-16

// O projeto falso: ficheiros reais numa pasta temporária (o root dos args) e a mesma lista nos args
export const FICHEIROS = ['tests/unit/a.test.mjs', 'tests/unit/b.test.mjs', 'tests/integ/c.test.mjs', 'e2e/login.spec.ts', 'e2e/flows/cart.spec.ts', 'src/x.js', 'package.json'];
export const projeto = (files = FICHEIROS) => {
  const root = tmp('proj16-');
  for (const f of files) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), '// critico f-16\n'); }
  return root;
};
export const argsDe = (over = {}, files = FICHEIROS) => batchArgs(pieces(2), { root: projeto(files), [EXISTE]: [...files], ...over });

// Uma entrada de `runs` com o número da passagem
export const ent = (kind, command, pass, failures = []) => ({ kind, command, pass, failures });
// Um tipo partido em blocos: cada passagem 1..n tem todos os blocos
export const partido = (kind, blocks, n) => Array.from({ length: n }, (_, i) => blocks.map((b) => ent(kind, b, i + 1))).flat();
export const SUITE2 = (cmd = CMD.test) => [ent('suite', cmd, 1), ent('suite', cmd, 2)];
export const E2E3 = (cmd = CMD.e2e) => [1, 2, 3].map((p) => ent('e2e', cmd, p));
export const declaracao = (runs) => ({ runs, isolated: [], main: [] });
export const lote = (runs, over = {}) => runWf(BATCH, argsDe(over), fakeImpl({ answer: () => declaracao(runs) }));
