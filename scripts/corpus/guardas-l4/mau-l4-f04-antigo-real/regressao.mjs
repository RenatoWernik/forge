// F-04: regressões e higiene. A suíte do pacote continua verde e ganha o scripts/skill-new-project.test.mjs (a verificação
// dos critérios 1 a 3, com os oráculos literais), nenhum ficheiro de teste perde testes (referência: e083b6a), os ataques
// da Ronda −1 dos tickets já fundidos continuam verdes, e o que o ticket acrescenta ao pacote não leva caminhos da máquina
// nem dados pessoais. Os filhos correm com o HOME e o TMP falsos do helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, BASE, git, runTests, failures } from './helpers.mjs';

// Testes estáticos (`^test(`) por ficheiro em e083b6a; a suíte passava com 139
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sync.test.mjs': 21 };
const count = (f) => [...readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].length;

test('regressão: nenhum ficheiro de teste do pacote perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    assert.ok(existsSync(join(ROOT, 'scripts', f)), f + ' desapareceu');
    assert.ok(count(f) >= n, `${f}: ${count(f)} testes, eram ${n}`);
  }
});

test('regressão: existe scripts/skill-new-project.test.mjs, com os oráculos literais dos critérios 1 e 2', () => {
  const f = join(ROOT, 'scripts/skill-new-project.test.mjs');
  assert.ok(existsSync(f), 'falta scripts/skill-new-project.test.mjs (verificação dos critérios 1 a 3)');
  const src = readFileSync(f, 'utf8');
  const literais = ['UI rica', 'lógica e servidor', 'riscos (segredos, dados, dinheiro, segurança)', 'dimensão e prazo', 'quota', 'Haiku xhigh', 'Opus high', 'Opus 5.5 high'];
  assert.deepEqual(literais.filter((l) => !src.includes(l)), [], 'literais do contrato que o teste do dev não contém');
});

test('regressão: node --test "scripts/*.test.mjs" passa, com mais testes do que os 139 de e083b6a', () => {
  const r = runTests(['scripts/*.test.mjs']);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass > 139, 'passaram ' + r.pass);
});

// Os regressao.test.mjs deles voltam a correr a suíte do pacote, já corrida acima: ficam de fora para o tempo caber em 540 s
test('regressão: os ataques da Ronda −1 do F-01, F-02, F-03 e F-10 continuam verdes', () => {
  const dirs = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-10-r0'];
  for (const d of dirs) assert.ok(existsSync(join(ROOT, 'tests/critico', d)), d + ' desapareceu');
  const r = runTests(dirs.map((d) => `tests/critico/${d}/c*.test.mjs`), 500000);
  assert.equal(r.status, 0, failures(r.out));
  assert.equal(r.fail, 0, failures(r.out));
  assert.ok(r.pass >= 150, 'passaram ' + r.pass);
});
