// V-08, Ronda 3 (#132; RESPOSTA do orquestrador ao veredito da R2, pontos 1 e 2). Ataques novos, em acréscimo aos anteriores (que não se tocam):
//   1. `tipo: comando` com `formato: tap` exige pelo menos um teste corrido: tudo em SKIP ou TODO dá `erro` («nenhum teste correu») e código 1; 1 ok e o resto em skip dá pass;
//   2. o motor nunca morre em silêncio: suítes com nomes que não são nomes de ficheiro correm; um erro forçado no motor (FORGE_TESTE_MORTE_MOTOR=1) dá código 1 com o motivo
//      em ≤ 3 chamadas, no executor e no check-ticket, nunca 3 sem fim.
// (O ponto 3, a dica do `prepara` na linha do pós-merge, é exigido em r2-prepara.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gerar, conjunto, preCondicao, repo, git, commita, escreve, comSuites, correAteFim, resultado, fim } from './helpers.mjs';

const nodeE = (js) => [process.execPath, '-e', js];
const tap = (nome, js) => ({ nome, tipo: 'comando', comando: nodeE(js), formato: 'tap', limite_s: 60 });
const estados = (res) => Object.fromEntries(Object.entries(res.suites ?? {}).map(([n, s]) => [n, s.estado]));
const unidade = (res, suite) => (res.unidades ?? []).find((u) => u.suite === suite);
const projeto = async (suites, antes = () => {}) => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  antes(P);
  comSuites(P, suites);
  return { P, sha: repo(P) };
};

test('R3-1: um TAP só com SKIP ou TODO dá erro «nenhum teste correu» e código 1; 1 ok e o resto em skip dá pass; um node --test real com tudo em skip dá erro', async () => {
  const real = (nome, ficheiro) => ({ nome, tipo: 'comando', comando: [process.execPath, '--test', '--test-reporter=tap', ficheiro], formato: 'tap', limite_s: 60 });
  const { P, sha } = await projeto([
    tap('um-skip', "console.log('1..1\\nok 1 - a # SKIP sem base de dados')"),
    tap('so-todo', "console.log('1..1\\nok 1 - a # TODO depois')"),
    tap('skips-e-todos', "console.log('1..2\\nok 1 - a # SKIP x\\nok 2 - b # TODO y')"),
    tap('um-ok', "console.log('1..3\\nok 1 - a # SKIP x\\nok 2 - b\\nok 3 - c # SKIP y')"),
    real('real-tudo-skip', 't/skip.test.mjs'),
    real('real-um-ok', 't/um.test.mjs'),
  ], (P) => {
    escreve(P, 't/skip.test.mjs', "import { test } from 'node:test';\ntest('x', { skip: 'sem base de dados' }, () => { throw new Error('x'); });\ntest('y', { skip: 'sem base de dados' }, () => { throw new Error('y'); });\n");
    escreve(P, 't/um.test.mjs', "import { test } from 'node:test';\ntest('x', { skip: 'sem base de dados' }, () => { throw new Error('x'); });\ntest('y', () => {});\n");
  });
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 1, `código ${r.status}` + fim(r));
  const res = resultado(P, sha);
  assert.deepEqual(estados(res), { 'um-skip': 'erro', 'so-todo': 'erro', 'skips-e-todos': 'erro', 'um-ok': 'pass', 'real-tudo-skip': 'erro', 'real-um-ok': 'pass' });
  for (const s of ['um-skip', 'so-todo', 'skips-e-todos', 'real-tudo-skip']) assert.match(unidade(res, s)?.motivo ?? '', /nenhum teste correu/, s);
});

test('R3-2: suítes com nomes que não são nomes de ficheiro (test:unit, unit/api, ..\\x, « a b», «á*?», e dois nomes que dão o mesmo texto limpo) correm e dão o resultado certo em ≤ 2 chamadas', async () => {
  const nomes = ['test:unit', 'unit/api', '..\\x', ' a b', 'á*?', 'a:b', 'a/b', 'x'.repeat(300)];
  const { P, sha } = await projeto([...nomes.map((n) => ({ nome: n, tipo: 'comando', comando: nodeE('process.exit(0)'), formato: 'codigo', limite_s: 60 })),
    { nome: 'unit/node', tipo: 'node-test', ficheiros: ['t/a.test.mjs'], limite_s: 60 },
    { nome: 'vermelha:x', tipo: 'comando', comando: nodeE('process.exit(3)'), formato: 'codigo', limite_s: 60 }],
  (P) => escreve(P, 't/a.test.mjs', "import { test } from 'node:test';\ntest('a', () => {});\n"));
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.ok(r.chamadas <= 2 && r.status === 1, `código ${r.status} ao fim de ${r.chamadas} chamada(s) (esperado 1 em ≤ 2)` + fim(r));
  const res = resultado(P, sha);
  assert.deepEqual(estados(res), { ...Object.fromEntries(nomes.map((n) => [n, 'pass'])), 'unit/node': 'pass', 'vermelha:x': 'fail' });
  const taps = res.unidades.map((u) => u.tap);
  assert.equal(new Set(taps).size, taps.length, 'dois logs com o mesmo caminho: ' + JSON.stringify(taps));
  for (const t of taps) assert.ok(existsSync(join(P, t)), `o log ${t} não existe`);
  assert.ok(taps.every((t) => /^\.forge\/resultados\/logs\/[\w.-]+$/.test(t)), 'um caminho com caracteres fora de [\\w.-]: ' + JSON.stringify(taps));
});

test('R3-2: com um erro forçado no motor o executor dá 1 em ≤ 3 chamadas, a dizer porquê e com o motivo no resultado; nunca 3 sem fim', async () => {
  const { P, sha } = await projeto([{ nome: 'a', tipo: 'comando', comando: nodeE('process.exit(0)'), formato: 'codigo', limite_s: 60 }]);
  const r = correAteFim(P, 'executor.mjs', ['--todas'], { max: 6, env: { FORGE_TESTE_MORTE_MOTOR: '1' } });
  assert.ok(r.chamadas <= 3 && r.status === 1, `código ${r.status} ao fim de ${r.chamadas} chamada(s) (esperado 1 em ≤ 3)` + fim(r));
  assert.match(r.out, /morreram sem concluir nenhuma unidade/);
  assert.match(r.out, /morte forçada pelo teste/);
  const res = resultado(P, sha);
  assert.match(res.motor_morreu ?? '', /morte forçada pelo teste/, 'o resultado não guardou o motivo');
});

test('R3-2: o mesmo no check-ticket: FAIL com o motivo no ramo e no pós-merge, código 1 em ≤ 3 chamadas, nunca 3 sem fim', async () => {
  const { P } = await projeto([{ nome: 'a', tipo: 'comando', comando: nodeE('process.exit(0)'), formato: 'codigo', limite_s: 60 }]);
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 'a.txt', 'a\n');
  commita(P, 'ticket');
  const r = correAteFim(P, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main'], { max: 6, env: { FORGE_TESTE_MORTE_MOTOR: '1' } });
  assert.ok(r.chamadas <= 3 && r.status === 1, `código ${r.status} ao fim de ${r.chamadas} chamada(s) (esperado 1 em ≤ 3)` + fim(r));
  for (const passo of ['afetadas no ramo', 'pós-merge']) assert.ok(r.out.split(/\r?\n/).some((l) => new RegExp(`^FAIL ${passo}\\b.*morreu`).test(l)), `sem «FAIL ${passo} (…morreu…)»` + fim(r));
});
