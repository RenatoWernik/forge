// F-06: regressões. Corre à parte dos ataques c*.test.mjs e, como o ficheiro inteiro passa de 540 s, por blocos de testes
// (cada comando fica abaixo de 540 s; os nomes dos testes trazem a pasta e o ficheiro para isso):
//   node --test --test-name-pattern="perde testes|âmbito|scripts/|pastas" tests/critico/f-06-r0/regressao.test.mjs
//   node --test --test-name-pattern="f-01-r0|f-03-r0|f-10-r0" tests/critico/f-06-r0/regressao.test.mjs   (~150 s)
//   node --test --test-name-pattern="f-02-r0/c[12]" tests/critico/f-06-r0/regressao.test.mjs   (~170 s)
//   node --test --test-name-pattern="f-02-r0/c[34]|f-02-r0/regressao" tests/critico/f-06-r0/regressao.test.mjs
//   node --test --test-name-pattern="f-02-r0/c5" tests/critico/f-06-r0/regressao.test.mjs   (o corpus 5 vezes)
//   (e um bloco por pasta que entre depois, como a f-05-r0)
// A suíte do pacote continua verde (com o corpus do F-02, que passa a correr as mutações do F-06), nenhum ficheiro de teste perde
// testes (referência: e083b6a, a main com o F-01, o F-02, o F-03 e o F-10), os ataques da Ronda −1 já fundidos continuam verdes e
// só os helpers.mjs desses ataques podem mudar. Os filhos correm com o HOME e o TMP falsos do helpers.mjs.
// Cada ficheiro de ataque anterior corre no seu próprio processo (timeout 520 s). Dos regressao.test.mjs anteriores ficam de fora só
// os testes que voltam a correr a suíte do pacote ou os ataques de outras pastas («scripts/*.test.mjs», «continuam verdes»): isso já
// está aqui, uma vez, e corrê-los aninhados passa dos 520 s.
// DEPENDE DO F-05: depois de o F-05 entrar na main, os ataques dele (tests/critico/f-05-r0) entram aqui sozinhos (todas as pastas
// de tests/critico menos a f-06-r0); as 4 de e083b6a são obrigatórias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sandboxEnv } from './helpers.mjs';

// Número de test() de topo por ficheiro em e083b6a
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };
const REQUIRED = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-10-r0'];
const prior = () => readdirSync(join(ROOT, 'tests/critico')).filter((d) => d !== 'f-06-r0' && /-r0$/.test(d)).sort();
const files = (d) => readdirSync(join(ROOT, 'tests/critico', d)).filter((f) => f.endsWith('.test.mjs')).sort();
// --test-skip-pattern existe desde o Node 22.1 (a máquina tem o 24); num Node mais antigo o filho recusa a opção e o teste falha à vista
const NESTED = 'scripts/\\*\\.test\\.mjs|continuam verdes';
const runTests = (args, concurrency = 2) => {
  const r = spawnSync(process.execPath, ['--test', `--test-concurrency=${concurrency}`, '--test-reporter=tap', ...args], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 520000 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, signal: r.signal, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
const failures = (r) => (r.signal ? `morto por ${r.signal} (passou dos 520 s?)\n` : '') + r.out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + r.out.slice(-2500);
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
  assert.equal(r.status, 0, failures(r));
  assert.equal(r.fail, 0, failures(r));
  assert.ok(r.pass >= 139, 'passaram ' + r.pass);
});

test('âmbito: em relação à origin/main, dos ataques já fundidos só os helpers.mjs podem mudar', () => {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(mb.status, 0, 'sem merge-base com origin/main: ' + mb.stderr);
  const changed = git('diff', '--name-only', mb.stdout.trim(), '--', ...prior().map((d) => 'tests/critico/' + d)).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter((f) => !f.endsWith('/helpers.mjs')), [], 'ficheiros dos ataques anteriores alterados');
});

test('regressão: as pastas dos ataques já fundidos (f-01, f-02, f-03, f-10) existem', () => {
  assert.deepEqual(REQUIRED.filter((d) => !prior().includes(d)), [], 'pastas de ataques desaparecidas');
});

// Um teste por ficheiro de ataque anterior: os ataques da Ronda −1 já fundidos (e os que entrarem depois, como o f-05) continuam verdes
for (const d of prior()) {
  for (const f of files(d)) {
    test(`regressão: ${d}/${f} continua verde`, () => {
      const r = runTests([...(f === 'regressao.test.mjs' ? [`--test-skip-pattern=${NESTED}`] : []), `tests/critico/${d}/${f}`], 1);
      assert.equal(r.status, 0, failures(r));
      assert.equal(r.fail, 0, failures(r));
      assert.ok(r.pass >= 1, 'nenhum teste passou\n' + failures(r));
    });
  }
}
