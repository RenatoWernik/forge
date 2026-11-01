// Ronda −1 do F-26 (#101): guardas, verdes na base.
// - Os ataques antigos e as pastas da lista congelada ficam byte a byte contra `git merge-base HEAD origin/main` (regra 8, nunca um sha fixo);
//   só tests/critico/f-26-r0 e tests/critico/_comum são novos. Sem origin/main, skip com o motivo.
// - Os casos de casos/ dizem o que dizem: depois de trocados os marcadores, cada caso mau tem a violação da sua regra, e o caso real do f-22a
//   coincide com uma versão do histórico do ramo f-22a-registo-learnings (skip se o ramo não existir).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, gitRaiz, caso, NOME_SO, AMB, SHA_F22A, SHA_CURTO, SHA_OUTRO } from './helpers.mjs';

const NOVOS = ['tests/critico/f-26-r0/', 'tests/critico/_comum/'];

test('GUARDA: nada muda em tests/critico/ contra o merge-base com a main, fora de f-26-r0 e _comum (versionados e novos)', (t) => {
  const mb = gitRaiz('merge-base', 'HEAD', 'origin/main');
  if (mb.status !== 0) return t.skip('sem origin/main');
  const b = mb.stdout.trim();
  const d = gitRaiz('diff', '--stat', b, '--', 'tests/critico', ...NOVOS.map((p) => ':(exclude)' + p));
  assert.equal(d.status, 0, d.stderr);
  assert.equal(d.stdout.trim(), '', 'mudou em tests/critico/:\n' + d.stdout);
  const o = gitRaiz('ls-files', '-o', '--exclude-standard', '--', 'tests/critico');
  const novos = o.stdout.split(/\r?\n/).filter(Boolean).filter((f) => !NOVOS.some((p) => f.startsWith(p)));
  assert.deepEqual(novos, [], 'ficheiros novos em pastas antigas');
});

test('GUARDA: cada caso mau tem a sua violação e cada caso limpo tem o que diz', () => {
  const tem = (rel, ...ks) => { const s = caso(rel); for (const k of ks) assert.ok(s.includes(k), rel + ' sem ' + k); return s; };
  tem('mau-l1-base.txt', `const BASE = '${SHA_CURTO}'`, "spawnSync('git'");
  tem('mau-l1-array.txt', `'${SHA_OUTRO}'`, "spawnSync('git'");
  tem('mau-l1-template.txt', '`git show ' + SHA_F22A + ':');
  assert.ok(!tem('mau-l2.txt', "test('" + AMB).includes('soNoTicket'));
  assert.equal(tem('mau-l2-dois.txt', 'soNoTicket(t').split("test('" + AMB).length - 1, 2);
  const l3 = tem('mau-l3.txt', NOME_SO);
  assert.ok(!l3.includes(AMB) && !l3.includes('base()'));
  tem('limpo-base.txt', 'base()', NOME_SO);
  tem('limpo-ambito.txt', "test('" + AMB, 'soNoTicket(t', NOME_SO);
  tem('limpo-fixture.txt', `ref: '${SHA_OUTRO}'`, "spawnSync('git', ['rev-parse', 'HEAD']");
  tem('limpo-comentario.txt', `// const BASE = '${SHA_CURTO}'`, '/* spawnSync');
  tem('f22a-antigo/helpers.mjs.txt', `export const BASE = '${SHA_F22A}'`);
  tem('f22a-antigo/c6-manual-projeto.test.mjs.txt', "'ls-tree', '-r', '" + NOME_SO + "', BASE");
});

test('GUARDA: o caso real do f-22a coincide com uma versão do histórico do ramo f-22a-registo-learnings', (t) => {
  const ramo = 'origin/f-22a-registo-learnings';
  if (gitRaiz('rev-parse', '--verify', '-q', ramo).status !== 0) return t.skip('sem o ramo ' + ramo);
  for (const [f, rel] of [['c6-manual-projeto.test.mjs', 'f22a-antigo/c6-manual-projeto.test.mjs.txt'], ['helpers.mjs', 'f22a-antigo/helpers.mjs.txt']]) {
    const p = 'tests/critico/f-22a-r0/' + f;
    const cs = gitRaiz('log', '--format=%H', ramo, '--', p).stdout.split(/\r?\n/).filter(Boolean);
    const meu = caso(rel);
    assert.ok(cs.some((c) => gitRaiz('show', c + ':' + p).stdout.replace(/\r\n/g, '\n') === meu), 'nenhuma versão de ' + p + ' coincide com ' + rel);
  }
});
test('GUARDA: a f-20c-r1 (a pasta limpa do C4 c) não tem git, shas de 7 a 40, testes de âmbito nem a opção de nomes', () => {
  const p = join(ROOT, 'tests/critico/f-20c-r1');
  for (const e of readdirSync(p)) {
    const s = readFileSync(join(p, e), 'utf8');
    assert.ok(!/\bgit\b/.test(s) && !/(?<![0-9A-Za-z_])[0-9a-f]{7,40}(?![0-9A-Za-z_])/i.test(s) && !s.includes(AMB) && !s.includes(NOME_SO), e + ' deixou de ser limpo');
  }
});