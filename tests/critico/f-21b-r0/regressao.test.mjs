// F-21b, barra de regressão e «O que reprova» do corpo da #74:
// - a chamada graph:update nunca muda os resultados nem para a execução quando falha (falha aberta): para cenários ao acaso (semente
//   fixa), o resultado de cada peça é o da BASE (o mesmo workflow sem graph:update, no mesmo runtime falso), tirando o campo novo
//   graphNodes, qualquer que seja a resposta do graph:update; o batch, o ponytail e o attacks devolvem exatamente o mesmo `out`;
// - nenhum ataque nem assert antigo muda: os ficheiros de tests/critico/ da BASE ficam byte a byte e os scripts/*.test.mjs da BASE
//   mantêm todas as linhas, pela mesma ordem.
// A BASE é o merge-base com origin/main (regra 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { srcNow, srcBase, runWf, fake, plain, why, buildArgs, attacksArgs, ponyArgs, batchArgs, piece, unit, resultOf, omit, rng, pick, git, MB, ROOT, lines } from './helpers.mjs';

const RESP = ['graph: updated 42 nodes', null, 'ok', 'Error: graphify not found ' + 'z'.repeat(150)];

test('regressão [guarda] (build): em 40 cenários ao acaso, o resultado de cada peça é o da BASE (sem graphNodes), qualquer que seja a resposta do graph:update', async () => {
  const r = rng(2174);
  for (let i = 1; i <= 40; i++) {
    const mode = pick(r, ['rigorous', 'accelerated']), n = pick(r, [1, 2]), parallel = pick(r, [false, true]);
    const f = { winAt: pick(r, [1, 2, 3, 4]), crit: pick(r, [(x) => 'C' + x, () => 'C1']), graph: pick(r, RESP) };
    const args = buildArgs(['pa', 'pb'].slice(0, n).map((id) => piece(id)), { mode, parallel });
    const ref = await runWf(srcBase('build'), args, fake(f));
    assert.equal(ref.err, undefined, `controlo ${i}: a BASE falhou: ` + why(ref));
    const run = await runWf(srcNow('build'), args, fake(f));
    assert.equal(run.err, undefined, `cenário ${i}: a execução parou: ` + why(run));
    for (const id of ['pa', 'pb'].slice(0, n)) assert.deepEqual(omit(resultOf(run, id), 'graphNodes'), resultOf(ref, id), `cenário ${i} (${mode}, winAt ${f.winAt}, graph ${JSON.stringify(f.graph)?.slice(0, 30)}), peça ${id}`);
  }
});

for (const [name, mk, f] of [['batch', () => batchArgs(), {}], ['ponytail', () => ponyArgs([unit('u1'), unit('u2')]), { ponyWinAt: 2 }], ['attacks', () => attacksArgs([piece('pa'), piece('pb')]), {}]]) {
  test(`regressão [guarda] (${name}): o out é exatamente o da BASE, qualquer que seja a resposta do graph:update`, async () => {
    for (const graph of RESP) {
      const ref = await runWf(srcBase(name), mk(), fake({ ...f, graph }));
      assert.equal(ref.err, undefined, 'controlo: ' + why(ref));
      const run = await runWf(srcNow(name), mk(), fake({ ...f, graph }));
      assert.equal(run.err, undefined, why(run));
      assert.deepEqual(plain(run.out), plain(ref.out), `graph ${JSON.stringify(graph)?.slice(0, 30)}`);
    }
  });
}

test('regressão [guarda]: os ficheiros de tests/critico/ da BASE ficam byte a byte (nenhum ataque se enfraquece nem se apaga)', () => {
  const fs_ = git('ls-tree', '-r', '--name-only', MB, 'tests/critico').split(/\r?\n/).filter(Boolean);
  assert.ok(fs_.length > 100, 'controlo: ' + fs_.length);
  const mudados = fs_.filter((f) => { const p = join(ROOT, f); return !existsSync(p) || lines(readFileSync(p, 'utf8')).join('\n') !== lines(git('show', MB + ':' + f)).join('\n'); });
  assert.deepEqual(mudados, []);
});

// as linhas da base que se perderam em «agora» (subsequência gulosa, pela ordem)
const perdidas = (antes, agora) => { let j = 0; const out = []; for (const l of antes) { const k = agora.indexOf(l, j); if (k < 0) out.push(l); else j = k + 1; } return out; };
test('regressão [guarda]: os scripts/*.test.mjs da BASE mantêm todas as linhas, pela mesma ordem (nenhum assert antigo muda)', () => {
  const fs_ = git('ls-tree', '--name-only', MB, 'scripts/').split(/\r?\n/).filter((f) => f.endsWith('.test.mjs'));
  assert.ok(fs_.length >= 10, 'controlo: ' + fs_.length);
  for (const f of fs_) {
    const p = join(ROOT, f);
    assert.ok(existsSync(p), f + ' foi apagado');
    assert.deepEqual(perdidas(lines(git('show', MB + ':' + f)), lines(readFileSync(p, 'utf8'))), [], 'linhas da base alteradas ou apagadas em ' + f);
  }
});