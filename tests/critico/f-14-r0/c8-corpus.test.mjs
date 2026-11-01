// F-14 critério 6 e o seguimento do corpus: todo o corpus acaba em «All ok.» e todas as mutações dos F-02 a F-13 falham na linha certa
// (o próprio scripts/corpus.test.mjs), e `node --test scripts/corpus.test.mjs` corre em menos de 55 s.
// Oráculo: o código 0 do corpus.test.mjs, os nomes das mutações da base 248ed1c ainda no corpus (nenhuma apagada para encurtar) e o
// tempo de relógio do processo, medido aqui, abaixo de 60 000 ms (resposta 3 do orquestrador: o alvo de 55 s
// saiu, porque o ruído da máquina é ±3 s). Na base: 53,3 s e 56,1 s.
// Corre sozinho neste ficheiro (um comando, uma suite): o tempo mede-se sem outra suite ao lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { ROOT, BASE, git, sandboxEnv } from './helpers.mjs';
import { limiteMs } from './limite.mjs';

test('C6: as mutações do corpus da base continuam lá (pelo nome) e o corpus não encolheu', () => {
  const r = git('ls-tree', '--name-only', BASE + ':scripts/corpus/mutations');
  assert.equal(r.status, 0, r.stderr);
  const base = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const agora = readdirSync(join(ROOT, 'scripts/corpus/mutations'));
  assert.deepEqual(base.filter((n) => !agora.includes(n)), []);
  const answers = git('ls-tree', '--name-only', BASE + ':scripts/corpus/answers').stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(answers.filter((n) => !readdirSync(join(ROOT, 'scripts/corpus/answers')).includes(basename(n))), []);
});

test('C6 e seguimento: node --test scripts/corpus.test.mjs sai 0 e corre em menos de 60 s × max(1, N_agora / N_base) (F-27)', () => {
  const ls = (d) => readdirSync(join(ROOT, d)).filter((n) => n.endsWith('.json')).length;
  const nBase = git('ls-tree', '--name-only', BASE + ':scripts/corpus/mutations').stdout.split('\n').filter((n) => n.trim().endsWith('.json')).length;
  const nAgora = ls('scripts/corpus/mutations'), limite = limiteMs(nAgora, nBase);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/corpus.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout: 500000 });
  const ms = Date.now() - t0, out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2000));
  assert.ok(ms < limite, `o corpus levou ${(ms / 1000).toFixed(1)} s (limite: ${(limite / 1000).toFixed(1)} s = 60 s × max(1, ${nAgora} / ${nBase}); N_agora=${nAgora}, N_base=${nBase})`);
});
