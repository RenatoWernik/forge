// V-01 critério C3 (árvore suja), em scripts/fixtures/executor/rapida: arvore = "suja:<sha256 de git diff HEAD + lista de não rastreados>"
// (spec §4.2) e o nome do ficheiro leva esse hash. Oráculo: limpa → <sha>-limpa-p1.json; um ficheiro seguido alterado → um ficheiro novo com
// o hash, e as unidades voltam a correr mesmo com --continuar; o mesmo estado sujo retoma esse ficheiro sem correr nada; um não rastreado
// novo → outro hash, outro ficheiro e outra corrida. O ficheiro de outra árvore nunca é reutilizado nem reescrito.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exigeExecutor, repo, shaDe, tempPrivado, correr, saida, resultados, pastaResultados, inicios, validaResultado, limpa } from './helpers.mjs';

after(limpa);

test('C3: árvore suja: o nome do ficheiro leva o hash, o mesmo estado sujo retoma o mesmo ficheiro e um resultado de outra árvore nunca é reutilizado', async () => {
  exigeExecutor();
  const d = repo('rapida'), sha = shaDe(d), env = tempPrivado();
  const corridas = () => ['s/a.fx.mjs', 's/b.fx.mjs'].map((f) => inicios(d, f).length);
  const passo = async (args, n) => { const r = await correr(d, args, { env }); assert.equal(r.status, 0, `passo ${n}: ` + saida(r)); return resultados(d); };
  const limpa1 = `${sha}-limpa-p1.json`;
  let rs = await passo(['--todas'], 1);
  assert.deepEqual(rs.map((x) => x.nome), [limpa1]);
  assert.equal(rs[0].dados.arvore, 'limpa');
  const bytesLimpa = readFileSync(join(pastaResultados(d), limpa1), 'utf8');
  assert.deepEqual(corridas(), [1, 1]);

  appendFileSync(join(d, 's/a.fx.mjs'), '// sujo\n');
  rs = await passo(['--todas', '--continuar'], 2);
  const sujos = rs.filter((x) => x.nome !== limpa1);
  assert.equal(sujos.length, 1, rs.map((x) => x.nome).join(', '));
  const [s1] = sujos, h1 = (/^suja:([0-9a-f]{64})$/.exec(s1.dados.arvore) || [])[1];
  assert.ok(h1, `arvore: ${s1.dados.arvore}`);
  assert.ok(s1.nome.startsWith(`${sha}-`) && s1.nome.endsWith('-p1.json') && s1.nome.includes(h1), `o nome ${s1.nome} não leva o sha, o hash e o passe`);
  assert.deepEqual(validaResultado(s1.dados, { raiz: d }), []);
  assert.deepEqual(corridas(), [2, 2], 'o resultado da árvore limpa foi reutilizado numa árvore suja');
  assert.equal(readFileSync(join(pastaResultados(d), limpa1), 'utf8'), bytesLimpa, 'o ficheiro da árvore limpa foi reescrito');

  rs = await passo(['--todas', '--continuar'], 3);
  assert.deepEqual(rs.map((x) => x.nome).sort(), [limpa1, s1.nome].sort(), 'o mesmo estado sujo não deu o mesmo ficheiro');
  assert.deepEqual(corridas(), [2, 2], 'o mesmo estado sujo voltou a correr unidades já feitas');

  writeFileSync(join(d, 'novo.txt'), 'não rastreado\n');
  rs = await passo(['--todas', '--continuar'], 4);
  const s2 = rs.find((x) => x.nome !== limpa1 && x.nome !== s1.nome);
  assert.ok(s2 && rs.length === 3, 'um não rastreado novo não deu outro ficheiro: ' + rs.map((x) => x.nome).join(', '));
  const h2 = (/^suja:([0-9a-f]{64})$/.exec(s2.dados.arvore) || [])[1];
  assert.ok(h2 && h2 !== h1 && s2.nome.includes(h2), `arvore ${s2.dados.arvore}, nome ${s2.nome}`);
  assert.deepEqual(corridas(), [3, 3], 'o resultado de outra árvore suja foi reutilizado');
});