// F-06: regressões e tempos. Corre à parte dos ataques c*.test.mjs e, como o ficheiro inteiro passa de 540 s, por blocos
// (cada comando fica abaixo de 540 s; os nomes dos testes trazem a pasta para isso):
//   node --test --test-name-pattern="perde testes|âmbito|scripts/|pastas|corpus" tests/critico/f-06-r0/regressao.test.mjs
//   node --test --test-name-pattern="f-01-r0|f-03-r0|f-10-r0" tests/critico/f-06-r0/regressao.test.mjs
//   node --test --test-name-pattern="f-02-r0" tests/critico/f-06-r0/regressao.test.mjs
//   (e um bloco por pasta que entre depois, como a f-04-r0, a f-05-r0 ou a f-11-r0)
// A suíte do pacote continua verde (com o corpus do F-02, que passa a correr as mutações do F-06), nenhum ficheiro de teste perde
// testes (referência: e083b6a, a main com o F-01, o F-02, o F-03 e o F-10), os ataques da Ronda −1 já fundidos continuam verdes e
// só os helpers.mjs desses ataques podem mudar. Os filhos correm com o HOME e o TMP falsos do helpers.mjs.
// Resposta 6 na #7 (tempos): o corpus (`node --test scripts/corpus.test.mjs`, o tempo que ele próprio imprime) fica abaixo de
// 60 s e os ataques do f-02-r0 (a pasta inteira, com 2 workers) abaixo de 540 s.
// Cada pasta de ataques anteriores corre num só processo, com 2 workers e timeout de 530 s. Dos regressao.test.mjs anteriores
// ficam de fora só os testes que voltam a correr a suíte do pacote ou os ataques de outras pastas («scripts/*.test.mjs»,
// «continuam verdes»): isso já está aqui, uma vez. --test-skip-pattern exige Node 22.1 ou mais recente (resposta 7 na #7).
// DEPENDE DO F-05: depois de o F-05 entrar na main, os ataques dele (tests/critico/f-05-r0) entram aqui sozinhos (todas as pastas
// de tests/critico menos a f-06-r0); as 4 de e083b6a são obrigatórias.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sandboxEnv, REAL_ENV } from './helpers.mjs';
import { doLote } from '../_comum/lote.mjs';

// Número de test() de topo por ficheiro em e083b6a
const BASELINE = { 'corpus.test.mjs': 5, 'doctor.test.mjs': 46, 'frontmatter.test.mjs': 3, 'painel.test.mjs': 13, 'scaffold.test.mjs': 29, 'sem-claude-mem.test.mjs': 1, 'sync.test.mjs': 21 };
const REQUIRED = ['f-01-r0', 'f-02-r0', 'f-03-r0', 'f-10-r0'];
const CORPUS_S = 60, F02_S = 540;
const prior = () => readdirSync(join(ROOT, 'tests/critico')).filter((d) => d !== 'f-06-r0' && /-r0$/.test(d)).sort();
// Reexecutor aninhado: cada pasta corre dentro de um teste e não cabe nos 540 s de um comando com a máquina carregada. Fica em skip por omissão;
// cada suite corre no seu próprio comando (Ronda 0, crítico e tester), e `FORGE_NESTED=1` liga-o.
const NESTED_SKIP = process.env.FORGE_NESTED !== '1' && 'reexecutor aninhado: cada suite corre no seu comando; FORGE_NESTED=1 liga-o';
const NESTED = 'scripts/\\*\\.test\\.mjs|continuam verdes';
const runTests = (args, timeout = 520000, env = sandboxEnv()) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=tap', ...args], { cwd: ROOT, encoding: 'utf8', env, timeout });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, signal: r.signal, ms: Date.now() - t0, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
const failures = (r) => (r.signal ? `morto por ${r.signal} ao fim de ${Math.round(r.ms / 1000)} s\n` : '') + r.out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + r.out.slice(-2500);
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

test('regressão: nenhum ficheiro de teste do pacote perde testes', () => {
  for (const [f, n] of Object.entries(BASELINE)) {
    const file = join(ROOT, 'scripts', f);
    assert.ok(existsSync(file), f + ' desapareceu');
    const count = [...readFileSync(file, 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].length;
    assert.ok(count >= n, `${f}: ${count} testes, eram ${n}`);
  }
});

test('regressão: node --test "scripts/*.test.mjs" passa, com pelo menos os 139 testes de e083b6a', (t) => {
  const r = doLote(t, 'scripts', { corre: () => runTests(['scripts/*.test.mjs']) });
  if (!r) return;
  assert.equal(r.status, 0, failures(r));
  assert.equal(r.fail, 0, failures(r));
  assert.ok(r.pass >= 139, 'passaram ' + r.pass);
});

test(`tempo: o corpus (scripts/corpus.test.mjs) passa e corre em menos de ${CORPUS_S} s`, (t) => {
  const r = runTests(['scripts/corpus.test.mjs'], 300000);
  assert.equal(r.status, 0, failures(r));
  const s = +(r.out.match(/tempo total do corpus: ([\d.]+) s/) || [])[1];
  assert.ok(Number.isFinite(s), 'o corpus não imprimiu o tempo total\n' + r.out.slice(-1500));
  t.diagnostic(`corpus: ${s} s`);
  assert.ok(s < CORPUS_S, `o corpus demorou ${s} s`);
});

const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
test('âmbito: em relação à origin/main, dos ataques já fundidos só os helpers.mjs podem mudar', { skip: branch !== 'f-06-briefs' && 'só no ramo f-06-briefs' }, () => {
  const mb = git('merge-base', 'HEAD', 'origin/main');
  assert.equal(mb.status, 0, 'sem merge-base com origin/main: ' + mb.stderr);
  const changed = git('diff', '--name-only', mb.stdout.trim(), '--', ...prior().map((d) => 'tests/critico/' + d)).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changed.filter((f) => !f.endsWith('/helpers.mjs')), [], 'ficheiros dos ataques anteriores alterados');
});

test('regressão: as pastas dos ataques já fundidos (f-01, f-02, f-03, f-10) existem', () => {
  assert.deepEqual(REQUIRED.filter((d) => !prior().includes(d)), [], 'pastas de ataques desaparecidas');
});

// Uma pasta por teste: os ataques da Ronda −1 já fundidos (e os que entrarem depois, como o f-05) continuam verdes. O f-02-r0
// também tem de correr em menos de 540 s (resposta 6); o timeout de 530 s de cada pasta já o garante.
for (const d of prior()) {
  test(`regressão: ${d} continua verde${d === 'f-02-r0' ? ` e corre em menos de ${F02_S} s` : ''}`, { skip: NESTED_SKIP }, (t) => {
    // o f-12-r0 abre o Chrome e gere o próprio ambiente: não se sobrepõem HOME, USERPROFILE nem TMP
    const r = doLote(t, d, { corre: () => runTests([`--test-skip-pattern=${NESTED}`, `tests/critico/${d}/*.test.mjs`], 530000, d === 'f-12-r0' ? REAL_ENV : undefined) });
    if (!r) return;
    t.diagnostic(`${d}: ${Math.round(r.ms / 1000)} s`);
    assert.equal(r.status, 0, failures(r));
    assert.equal(r.fail, 0, failures(r));
    assert.ok(r.pass >= 1, 'nenhum teste passou\n' + failures(r));
    if (d === 'f-02-r0') assert.ok(r.ms < F02_S * 1000, `o f-02-r0 demorou ${Math.round(r.ms / 1000)} s`);
  });
}
