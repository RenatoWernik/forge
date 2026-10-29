// F-05: regressões do pacote. Corre à parte dos ataques c*.test.mjs, um comando de cada vez (cada um fica abaixo de 540 s):
//   node --test tests/critico/f-05-r0/regressao.test.mjs
//   node --test tests/critico/f-05-r0/regressao-ataques-a.test.mjs
//   node --test tests/critico/f-05-r0/regressao-ataques-b.test.mjs
//   node --test tests/critico/f-05-r0/regressao-ataques-c.test.mjs
// Aqui: a suíte do pacote continua verde (com o corpus do F-02, que agora corre as mutações do F-05), nenhum ficheiro de teste perde
// testes (referência: e083b6a, a main com o F-01, o F-02, o F-03 e o F-10) e, dos ataques já fundidos, só os helpers.mjs podem
// mudar (PERGUNTA 5 na #6). Os filhos correm com o HOME e o TMP falsos do helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { runTests, failures, PRIOR } from './regressao-comum.mjs';

// Número de test() de topo por ficheiro em e083b6a
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

test('regressão: nenhum ficheiro de teste do pacote perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const file = join(ROOT, 'scripts', f);
    assert.ok(existsSync(file), f + ' desapareceu');
    const count = [...readFileSync(file, 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].length;
    assert.ok(count >= n, `${f}: ${count} testes, eram ${n}`);
  }
});

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os 139 testes de e083b6a', () => {
  const r = runTests(['scripts/*.test.mjs']);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 139, 'passaram ' + r.pass);
});

test('âmbito: em relação à origin/main, dos ataques já fundidos só os helpers.mjs podem mudar', () => {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(mb.status, 0, 'sem merge-base com origin/main: ' + mb.stderr);
  const changed = git('diff', '--name-only', mb.stdout.trim(), '--', ...PRIOR.map((d) => 'tests/critico/' + d)).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter((f) => !f.endsWith('/helpers.mjs')), [], 'ficheiros dos ataques anteriores alterados');
});
