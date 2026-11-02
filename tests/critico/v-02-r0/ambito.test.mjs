// V-02 (#126), «Reprova: ataque enfraquecido ou apagado»: nenhum ficheiro de tests/critico/ que já existia na merge-base com a origin/main
// (regra 8 dos briefs) muda, é apagado ou renomeado; ficheiros novos são permitidos (os ataques desta pasta, e os do V-01 enquanto ele não
// estiver na main). Só corre na branch do ticket (regra 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base } from '../_comum/base.mjs';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, PASTA_CRITICO, gitOk, linhas } from './helpers.mjs';

test('ÂMBITO: o V-02 não muda, não apaga nem renomeia nenhum ficheiro de tests/critico/ que existia na base', (t) => {
  if (soNoTicket(t, 'v-02')) return;
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const mexidos = linhas(gitOk(ROOT, 'diff', '--name-only', '--no-renames', '--diff-filter=DMT', b)).filter((f) => f.startsWith(PASTA_CRITICO));
  assert.deepEqual(mexidos, []);
});