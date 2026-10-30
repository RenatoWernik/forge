// F-16: sanidade do próprio oráculo (o corpus tem ≥ 20 blocos hostis distintos, cobre as famílias do contrato e nenhum é válido) e
// regressão estática do critério 4 (nenhum teste de scripts/ nem dos ataques de tests/critico/ que existiam na base 712b690 desaparece
// ou perde testes; os ataques nunca se enfraquecem nem se apagam). GUARDA: verde na base.
// A regressão dinâmica corre fora daqui, uma suite por comando (comentário da Ronda −1 na #57).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { CMD, ROOT, BASE, git, FICHEIROS } from './helpers.mjs';
import { HOSTIS, VALIDOS, PAR, F } from './corpus.mjs';

test('C4 o corpus hostil tem ≥ 20 entradas, nomes e blocos distintos em cada tipo, e nenhum bloco é o par válido nem um bloco válido', () => {
  assert.ok(HOSTIS.length >= 20, `só ${HOSTIS.length} blocos hostis`);
  assert.equal(new Set(HOSTIS.map(([n]) => n)).size, HOSTIS.length, 'nomes repetidos');
  for (const [kind, K] of [['suite', CMD.test], ['e2e', CMD.e2e]]) {
    const blocks = HOSTIS.map(([, g]) => g(K, F[kind], kind === 'suite' ? CMD.e2e : CMD.test));
    assert.equal(new Set(blocks).size, blocks.length, `${kind}: blocos repetidos`);
    const validos = new Set([PAR[kind](K), ...VALIDOS[kind].flatMap(([, g]) => g(K))].map((s) => s.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(blocks.filter((b) => validos.has(b.replace(/\s+/g, ' ').trim()) && !/ /.test(b)), [], `${kind}: um bloco hostil é igual a um válido`);
  }
});

test('C4 o corpus cobre as famílias do contrato: echo, prefixos, sufixos ; e &&, aspas, maiúsculas, inexistentes e ..', () => {
  const s = HOSTIS.map(([, g]) => g(CMD.test, F.suite));
  for (const [familia, re] of [['echo', /^echo /], ['prefixo', /^node --test tests\//], ['; x', /; echo x$/], ['&& x', /&& echo x$/], ['aspas', /"/], ['maiúsculas', /NODE --TEST|TESTS\//], ['inexistente', /nao-existe|fantasma/], ['..', /\.\./]]) {
    assert.ok(s.some((b) => re.test(b)), `falta a família ${familia}`);
  }
});

test('C4 os ficheiros e as pastas dos blocos válidos existem no projeto falso; os dos hostis «inexistentes» não', () => {
  const pastas = new Set(FICHEIROS.flatMap((f) => f.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));
  const existe1 = (p) => FICHEIROS.includes(p) || pastas.has(p);
  const existe = (rest) => rest.split(/\s+/).filter(Boolean).every((x) => existe1(x.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, ''))); // P2: ./f, pasta/, \ e vários filtros; P3: sem filtro
  for (const [kind, K] of [['suite', CMD.test], ['e2e', CMD.e2e]]) {
    for (const b of [PAR[kind](K), ...VALIDOS[kind].flatMap(([, g]) => g(K))]) assert.ok(existe(b.slice(K.length).trim()), `${kind}: ${b}`);
    assert.ok(existe(F[kind]), F[kind]);
  }
  for (const n of ['ficheiro-inexistente', 'pasta-inexistente']) {
    const b = HOSTIS.find(([x]) => x === n)[1](CMD.test, F.suite);
    assert.ok(!existe(b.slice(CMD.test.length).trim()), b);
  }
});

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
