// V-02 (#126) C5: `node scripts/afetadas.mjs --base <base>` corre em < 2 s (o limiar medido em 3 corridas: cada uma fica abaixo) e imprime,
// por suíte, a regra e o ficheiro que a trouxeram. Forma da regra (RESPOSTA do orquestrador na #126, P2): o glob de `caminhos` que casou,
// `implícita` (tests/critico/<x>/**) ou `doLote:<suíte de origem>`, mais o ficheiro do diff que ativou a regra. Oráculo: para cada suíte de
// afetadas() dos ficheiros do diff, há uma linha com o nome dela (como palavra inteira), um ficheiro f desse diff e uma regra válida para f.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { base } from '../_comum/base.mjs';
import { ROOT, REL_AFETADAS, exige, ambiente, gitOk, linhas, lerMapa, casa, suiteDaPasta, nomesManifesto, nomes, afetadasAqui, fixtureLote,
  testeDe, escreve, commitaTudo, temSuite, limpa } from './helpers.mjs';

after(limpa);

const LIMITE_MS = 2000;
const cli = (raiz, ref) => {
  exige(raiz, REL_AFETADAS);
  const t0 = process.hrtime.bigint();
  const p = spawnSync(process.execPath, [REL_AFETADAS, '--base', ref], { cwd: raiz, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  return { status: p.status, out: (p.stdout || '') + (p.stderr || ''), ms: Number(process.hrtime.bigint() - t0) / 1e6 };
};
// a linha de `s` é válida quando traz um ficheiro f do diff e uma regra que justifica s a partir de f: um glob de uma regra com s (ou "*")
// que casa com f, `implícita` com f em tests/critico/s/, ou `doLote:<o>` com o uma suíte afetada
function semLinha(out, suites, diff, mapa, afetadas) {
  const ls = out.split(/\r?\n/);
  const valida = (l, s) => diff.some((f) => l.includes(f) && (
    (l.includes('implícita') && suiteDaPasta(f) === s)
    || [...afetadas].some((o) => o !== s && l.includes(`doLote:${o}`))
    || mapa.regras.some((r) => (r.suites.includes('*') || r.suites.includes(s)) && r.caminhos.some((g) => casa(f, g) && l.includes(g)))));
  return [...suites].filter((s) => !ls.some((l) => temSuite(l, s) && valida(l, s)));
}

test('C5: 3 corridas de node scripts/afetadas.mjs --base <merge-base com a origin/main> neste repo, cada uma em < 2 s e com saída 0', (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const rs = [cli(ROOT, b), cli(ROOT, b), cli(ROOT, b)];
  const tempos = rs.map((r) => Math.round(r.ms));
  t.diagnostic(`tempos (ms): ${tempos.join(', ')}`);
  for (const r of rs) assert.equal(r.status, 0, r.out.slice(-2000));
  assert.ok(rs.every((r) => r.ms < LIMITE_MS), `tempos ${tempos.join(', ')} ms; o limiar é < ${LIMITE_MS} ms em cada uma das 3`);
});

test('C5: neste repo, cada suíte de afetadas(ficheiros do diff contra a base) tem uma linha com ela, a regra e o ficheiro do diff', async (t) => {
  const b = base();
  if (!b) return t.skip('sem origin/main');
  const diff = linhas(gitOk(ROOT, 'diff', '--name-only', b, 'HEAD'));
  if (!diff.length) return t.skip('diff vazio contra a base (a main é o HEAD)');
  const r = cli(ROOT, b);
  assert.equal(r.status, 0, r.out.slice(-2000));
  const quer = nomes(await afetadasAqui(diff), nomesManifesto());
  assert.ok(quer.size > 0, 'afetadas() vazia para um diff não vazio');
  assert.deepEqual(semLinha(r.out, quer, diff, lerMapa(), quer), [], r.out.slice(-3000));
});

test('C5: numa fixture (ramo que muda lib/x.mjs e a delta), --base main imprime cada suíte com a sua regra e o ficheiro do diff', () => {
  const d = fixtureLote();
  gitOk(d, 'checkout', '-q', '-b', 'ramo');
  escreve(d, 'lib/x.mjs', 'export const x = 2;\n');
  const delta = testeDe('suite-delta', 'd');
  escreve(d, delta, "import { test } from 'node:test';\ntest('delta mudou', () => {});\n");
  commitaTudo(d, 'ramo');
  const r = cli(d, 'main');
  assert.equal(r.status, 0, r.out.slice(-2000));
  assert.ok(r.ms < LIMITE_MS, `${Math.round(r.ms)} ms`);
  const ls = r.out.split(/\r?\n/);
  const tem = (s, ...partes) => ls.some((l) => temSuite(l, s) && partes.every((p) => l.includes(p)));
  const falta = [
    ['suite-alfa', 'lib/x.mjs', 'lib/**'],
    ['suite-delta', delta, 'implícita'],
    ['suite-beta', 'lib/x.mjs', 'doLote:suite-alfa'],
    ['suite-gama', 'lib/x.mjs', 'doLote:suite-beta'],
  ].filter(([s, ...p]) => !tem(s, ...p)).map((x) => x.join(' | '));
  assert.deepEqual(falta, [], r.out);
});