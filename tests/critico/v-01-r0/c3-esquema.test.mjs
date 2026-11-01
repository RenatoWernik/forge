// V-01 critério C3 (resultados): no corpus scripts/fixtures/executor/contagens (mista: 3 pass, 1 fail, 2 skip com motivo, 1 todo; verde: 2 pass),
// o ficheiro segue o esquema da spec §4.2 (validaResultado, com o tap de cada unidade a bater com as linhas # pass|fail|skipped|todo) e as
// contagens são as que o TAP do node dá para a fixture (guarda em guardas.test.mjs). Nome numa árvore limpa: <sha>-limpa-p<passe>.json.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { exigeExecutor, repo, shaDe, tempPrivado, correr, saida, resultados, umResultado, unidade, validaResultado, limpa } from './helpers.mjs';

after(limpa);

test('C3: o ficheiro de resultados segue o esquema da spec §4.2, as contagens são as do TAP e o nome é <sha>-limpa-p1.json; uma falha dá a saída 1', async () => {
  exigeExecutor();
  const d = repo('contagens'), sha = shaDe(d);
  const r = await correr(d, ['--todas'], { env: tempPrivado() });
  assert.equal(r.pendurado, false, saida(r));
  assert.equal(r.status, 1, saida(r));
  const { nome, dados: res } = umResultado(d);
  assert.equal(nome, `${sha}-limpa-p1.json`);
  assert.deepEqual(validaResultado(res, { raiz: d }), []);
  assert.equal(res.sha, sha);
  assert.equal(res.arvore, 'limpa');
  assert.equal(res.node, process.version);
  assert.equal(res.completo, true);
  const m = unidade(res, 'mista/m.fx.mjs'), v = unidade(res, 'verde/v.fx.mjs');
  assert.ok(m && v, 'faltam unidades: ' + res.unidades.map((u) => u.ficheiro).join(', '));
  assert.equal(res.unidades.length, 2);
  assert.deepEqual({ estado: m.estado, pass: m.pass, fail: m.fail, skip: m.skip, todo: m.todo, suite: m.suite, bloco: m.bloco },
    { estado: 'fail', pass: 3, fail: 1, skip: 2, todo: 1, suite: 'mista', bloco: null });
  assert.deepEqual([...m.skips].sort((a, b) => a.teste.localeCompare(b.teste)), [{ teste: 's1', motivo: 'motivo-um' }, { teste: 's2', motivo: 'motivo-dois' }]);
  for (const k of ['p1', 'p2', 'p3', 'f1']) assert.equal(typeof m.duracoes[k], 'number', `duracoes.${k}`);
  assert.deepEqual({ estado: v.estado, pass: v.pass, fail: v.fail }, { estado: 'pass', pass: 2, fail: 0 });
  assert.equal(res.suites.verde.estado, 'pass');
  assert.notEqual(res.suites.mista.estado, 'pass');
  assert.deepEqual([res.suites.mista.pass, res.suites.mista.fail, res.suites.mista.skip], [3, 1, 2]);
});

test('C3: --passe 2 grava <sha>-limpa-p2.json ao lado do passe 1, sem o apagar; tudo verde dá a saída 0', async () => {
  exigeExecutor();
  const d = repo('rapida'), sha = shaDe(d), env = tempPrivado();
  const r1 = await correr(d, ['--todas'], { env });
  assert.equal(r1.status, 0, saida(r1));
  const r2 = await correr(d, ['--todas', '--passe', '2'], { env });
  assert.equal(r2.status, 0, saida(r2));
  const rs = resultados(d);
  assert.deepEqual(rs.map((x) => x.nome), [`${sha}-limpa-p1.json`, `${sha}-limpa-p2.json`]);
  for (const x of rs) assert.deepEqual(validaResultado(x.dados, { raiz: d }), [], x.nome);
});