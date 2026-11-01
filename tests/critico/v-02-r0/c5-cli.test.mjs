// V-02 (#126) C5: `node scripts/afetadas.mjs --base <base>` corre em < 2 s (o limiar medido em 3 corridas: cada uma fica abaixo) e imprime,
// por suíte, a regra e o ficheiro que a trouxeram. Oráculo da saída: para cada suíte de afetadas() dos ficheiros do diff, há uma linha
// com o nome dela (como palavra inteira) e um ficheiro desse diff. A forma de «a regra» está em PERGUNTA na #126 (P2); até à resposta,
// só se exige a suíte e o ficheiro na mesma linha.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';
import { ROOT, REL_AFETADAS, exige, ambiente, gitOk, linhas, nomesManifesto, nomes, afetadasAqui, fixtureLote, testeDe, escreve,
  commitaTudo, temSuite, limpa } from './helpers.mjs';

after(limpa);

const LIMITE_MS = 2000;
const cli = (raiz, ref) => {
  exige(raiz, REL_AFETADAS);
  const t0 = process.hrtime.bigint();
  const p = spawnSync(process.execPath, [REL_AFETADAS, '--base', ref], { cwd: raiz, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  return { status: p.status, out: (p.stdout || '') + (p.stderr || ''), ms: Number(process.hrtime.bigint() - t0) / 1e6 };
};
// as suítes sem uma linha que tenha o nome e um dos ficheiros dados
const semLinha = (out, suites, ficheiros) => {
  const ls = out.split(/\r?\n/);
  return [...suites].filter((s) => !ls.some((l) => temSuite(l, s) && ficheiros.some((f) => l.includes(f))));
};

test('C5: 3 corridas de node scripts/afetadas.mjs --base <merge-base com a origin/main> neste repo, cada uma em < 2 s e com saída 0', (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const rs = [cli(ROOT, b), cli(ROOT, b), cli(ROOT, b)];
  const tempos = rs.map((r) => Math.round(r.ms));
  t.diagnostic(`tempos (ms): ${tempos.join(', ')}`);
  for (const r of rs) assert.equal(r.status, 0, r.out.slice(-2000));
  assert.ok(rs.every((r) => r.ms < LIMITE_MS), `tempos ${tempos.join(', ')} ms; o limiar é < ${LIMITE_MS} ms em cada uma das 3`);
});

test('C5: neste repo, cada suíte de afetadas(ficheiros do diff contra a base) tem uma linha com ela e um ficheiro do diff', async (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const fs_ = linhas(gitOk(ROOT, 'diff', '--name-only', b, 'HEAD'));
  if (!fs_.length) return t.skip('diff vazio contra a base (a main é o HEAD)');
  const r = cli(ROOT, b);
  assert.equal(r.status, 0, r.out.slice(-2000));
  const quer = nomes(await afetadasAqui(fs_), nomesManifesto());
  assert.ok(quer.size > 0, 'afetadas() vazia para um diff não vazio');
  assert.deepEqual(semLinha(r.out, quer, fs_), [], r.out.slice(-3000));
});

test('C5: numa fixture com um ramo que muda lib/x.mjs e a delta, --base main imprime a alfa e a delta com o seu ficheiro, e a beta e a gama (fecho) com um ficheiro', () => {
  const d = fixtureLote();
  gitOk(d, 'checkout', '-q', '-b', 'ramo');
  escreve(d, 'lib/x.mjs', 'export const x = 2;\n');
  escreve(d, testeDe('suite-delta', 'd'), "import { test } from 'node:test';\ntest('delta mudou', () => {});\n");
  commitaTudo(d, 'ramo');
  const r = cli(d, 'main');
  assert.equal(r.status, 0, r.out.slice(-2000));
  assert.ok(r.ms < LIMITE_MS, `${Math.round(r.ms)} ms`);
  assert.deepEqual(semLinha(r.out, ['suite-alfa'], ['lib/x.mjs']), [], r.out);
  assert.deepEqual(semLinha(r.out, ['suite-delta'], [testeDe('suite-delta', 'd')]), [], r.out);
  const trazem = ['lib/x.mjs', testeDe('suite-alfa', 'a'), testeDe('suite-beta', 'b')];
  assert.deepEqual(semLinha(r.out, ['suite-beta', 'suite-gama'], trazem), [], r.out);
});