// Ronda −1 do V-11 (#135, acrescento 6561971839): o 1.º teste do g-guardas do f-26 (a guarda de pasta nova) passa a teste de âmbito do f-26.
// Oráculo [comportamento, corre sempre], numa cópia (um repo git novo; origin/main = o commit da cópia) com uma pasta nova tests/critico/zz-v11-nova-r0/:
// - no ramo f-26-x (GITHUB_HEAD_REF), a guarda «nada muda em tests/critico/» falha e nomeia a pasta nova;
// - no ramo v-01-x, essa guarda faz skip com «âmbito do f-26: fora da branch f-26*», e é a única do ficheiro com esse skip.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copia, escreve, gitOk, nodeTest, cauda, limpa } from './helpers.mjs';

after(limpa);
const G = ['tests', 'critico', 'f-26-r0', 'g-guardas.test.mjs'].join('/');
const FRAG = 'nada muda em tests/critico/';
const MOTIVO = 'âmbito do f-26: fora da branch f-26';
let d = null;
const repo = () => {
  if (d) return d;
  d = copia();
  gitOk(d, 'init', '-q', '-b', 'main');
  gitOk(d, 'add', '-A');
  gitOk(d, '-c', 'user.name=critico', '-c', 'user.email=critico@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'copia');
  gitOk(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  escreve(d, 'tests/critico/zz-v11-nova-r0/a.test.mjs', "import test from 'node:test';\ntest('nova', () => {});\n");
  return d;
};

test('C5 g-guardas no ramo f-26-x: uma pasta nova em tests/critico/ faz a guarda falhar e nomeá-la', () => {
  const r = nodeTest(repo(), ['--test-name-pattern=' + FRAG, G], { GITHUB_HEAD_REF: 'f-26-x' });
  const rs = r.resultados.filter((x) => x.titulo.includes(FRAG));
  assert.equal(rs.length, 1, 'controlo: a guarda não correu\n' + cauda(r));
  assert.ok(!rs[0].ok && rs[0].bloco.includes('zz-v11-nova-r0'), 'a guarda não falhou a nomear a pasta nova:\n' + rs[0].bloco.slice(0, 2000));
});

test('C5 g-guardas noutro ramo (v-01-x): a guarda de pasta nova faz skip com o motivo, e só ela', () => {
  const r = nodeTest(repo(), [G], { GITHUB_HEAD_REF: 'v-01-x' });
  const rs = r.resultados.filter((x) => x.titulo.includes(FRAG));
  assert.equal(rs.length, 1, 'controlo: a guarda não apareceu\n' + cauda(r));
  assert.ok(rs[0].ok && rs[0].bloco.includes('# SKIP') && rs[0].bloco.includes(MOTIVO), `a guarda não fez skip com «${MOTIVO}*»:\n` + rs[0].bloco.slice(0, 2000));
  assert.equal(r.resultados.filter((x) => x.bloco.includes(MOTIVO)).length, 1, 'outro teste do g-guardas passou a fazer skip de âmbito');
  assert.equal(r.resultados.filter((x) => !x.ok).length, 0, 'falhas no g-guardas fora do ramo:\n' + cauda(r));
});