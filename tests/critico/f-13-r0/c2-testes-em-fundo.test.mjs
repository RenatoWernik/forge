// F-13 critério 2: o hook (2) bloqueia os comandos de teste com run_in_background true e diz a alternativa (primeiro plano, blocos de até 9 min);
// deixa passar os mesmos em primeiro plano (run_in_background false ou ausente) e os servidores e builds em segundo plano.
// Oráculo: o corpus de comandos (corpus-comandos.mjs), com 0 falsos positivos e 0 falsos negativos, nas ferramentas Bash e PowerShell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, gerar, hooksDe, entradaPre, correrMuitos, veredito, mostra } from './helpers.mjs';
import { TESTES, FUNDO_PASSA } from './corpus-comandos.mjs';

let proj;
const projeto = async () => (proj ??= await gerar(hooksDe(true, true, true)));

const correr = async (comandos, tool, bg) => {
  const u = await api();
  const p = await projeto();
  const rs = await correrMuitos(p, comandos.map((c) => ({ rel: u.scripts.fundo, entrada: entradaPre(p, tool, c, bg) })));
  return rs.map((r, i) => ({ comando: comandos[i], r, v: veredito(r) }));
};
const lista = (xs) => xs.map((x) => `${JSON.stringify(x.comando)} → ${mostra(x.r)}`);

for (const tool of ['Bash', 'PowerShell']) {
  test(`C2 ${tool}: bloqueia os ${TESTES.length} comandos de teste do corpus com run_in_background true (0 falsos negativos)`, async () => {
    assert.deepEqual(lista((await correr(TESTES, tool, true)).filter((x) => !x.v.bloqueia)), []);
  });

  test(`C2 ${tool}: deixa passar os mesmos ${TESTES.length} comandos em primeiro plano, com run_in_background false (0 falsos positivos)`, async () => {
    assert.deepEqual(lista((await correr(TESTES, tool, false)).filter((x) => !x.v.passa)), []);
  });

  test(`C2 ${tool}: deixa passar os mesmos ${TESTES.length} comandos sem o campo run_in_background (0 falsos positivos)`, async () => {
    assert.deepEqual(lista((await correr(TESTES, tool, undefined)).filter((x) => !x.v.passa)), []);
  });

  test(`C2 ${tool}: deixa passar em segundo plano os ${FUNDO_PASSA.length} servidores, builds e comandos que só mencionam «test» (0 falsos positivos)`, async () => {
    assert.deepEqual(lista((await correr(FUNDO_PASSA, tool, true)).filter((x) => !x.v.passa)), []);
  });
}

test('C2: a mensagem de cada bloqueio diz a alternativa: os blocos de até 9 min em primeiro plano', async () => {
  const sem = (await correr(TESTES, 'Bash', true)).filter((x) => x.v.bloqueia && !/\b9\s?min/i.test(x.v.mensagem));
  assert.deepEqual(sem.map((x) => `${JSON.stringify(x.comando)} → ${JSON.stringify(x.v.mensagem.slice(0, 200))}`), []);
});

