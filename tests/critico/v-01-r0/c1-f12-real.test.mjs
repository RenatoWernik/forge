// V-01 critério C1, ponta real: tests/critico/f-12-r0 (o Chrome, que precisa do USERPROFILE real por `@real`) corre pelo executor até ao
// fim, sem ficar pendurado. Corre num clone partilhado do HEAD (com a origin/main), com o scripts/suites.json da worktree, para não escrever
// no .forge/resultados/ da worktree (o mesmo nome <sha>-<arvore>-p1.json de uma corrida --todas que esteja a decorrer).
// Nota para o manifesto: se esta pasta correr pelo executor, a suíte v-01-r0 precisa do USERPROFILE real para o f-12 (o @real copia o do pai).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MANIFESTO, exigeExecutor, tmp, tempPrivado, correr, saida, resultados, validaResultado, gitOk, limpa } from './helpers.mjs';

after(limpa);

test('C1 ponta real: tests/critico/f-12-r0 corre pelo executor até ao fim (com --continuar se for preciso), sem ficar pendurado e verde', { timeout: 560000 }, async () => {
  exigeExecutor();
  assert.ok(existsSync(MANIFESTO), 'falta scripts/suites.json');
  const d = join(tmp('v01-f12-'), 'repo');
  const head = gitOk(ROOT, 'rev-parse', 'HEAD').trim();
  gitOk(ROOT, 'clone', '-q', '--shared', '--no-checkout', ROOT, d);
  gitOk(d, 'config', 'core.autocrlf', 'false');
  gitOk(d, 'checkout', '-q', '--detach', head);
  gitOk(d, 'fetch', '-q', ROOT, '+refs/remotes/origin/main:refs/remotes/origin/main');
  copyFileSync(MANIFESTO, join(d, 'scripts/suites.json'));
  const fim = Date.now() + 540000;
  let r, n = 0;
  do r = await correr(d, ['--suites', 'f-12-r0', ...(n++ ? ['--continuar'] : [])], { env: tempPrivado(), limite_ms: Math.max(10000, fim - Date.now()) });
  while (r.status === 3 && !r.pendurado && n < 3);
  assert.equal(r.pendurado, false, saida(r));
  assert.equal(r.status, 0, saida(r));
  const rs = resultados(d);
  assert.equal(rs.length, 1, rs.map((x) => x.nome).join(', '));
  const res = rs[0].dados;
  assert.deepEqual(validaResultado(res, { raiz: d }), []);
  assert.equal(res.completo, true);
  assert.deepEqual(Object.keys(res.suites), ['f-12-r0']);
  const mas = res.unidades.filter((u) => u.estado !== 'pass').map((u) => `${u.ficheiro}${u.bloco ? ` [${u.bloco}]` : ''}: ${u.estado}`);
  assert.deepEqual(mas, []);
});