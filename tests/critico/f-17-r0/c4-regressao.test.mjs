// F-17 critério 4, parte estática (GUARDA): nenhum teste de scripts/ nem dos ataques de tests/critico/ que existiam na base 712b690
// desaparece ou perde testes (os ataques nunca se enfraquecem nem se apagam). A regressão dinâmica corre fora daqui, uma suite por
// comando (comentário da Ronda −1 na #58).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, join, existsSync, readFileSync } from './helpers.mjs';

const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const conta = (t) => [...t.matchAll(/^\s*test\((['"`])/gm)].length;
const lista = (dir) => { const r = git('ls-tree', '-r', '--name-only', `${BASE}:${dir}`); assert.equal(r.status, 0, r.stderr); return r.stdout.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.test.mjs')); };

for (const dir of ['scripts', 'tests/critico']) {
  test(`C4 regressão estática: nenhum ${dir}/**/*.test.mjs da base ${BASE} desaparece nem perde testes`, () => {
    const menos = [];
    for (const n of lista(dir)) {
      const antes = conta(git('show', `${BASE}:${dir}/${n}`).stdout), f = join(ROOT, dir, n);
      const agora = existsSync(f) ? conta(readFileSync(f, 'utf8')) : -1;
      if (agora < antes) menos.push(`${n}: ${agora} testes, eram ${antes}`);
    }
    assert.deepEqual(menos, []);
  });
}
