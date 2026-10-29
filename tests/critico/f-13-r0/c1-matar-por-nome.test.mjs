// F-13 critério 1: o hook (1) bloqueia matar processos por nome e deixa passar o resto; a mensagem de bloqueio diz a alternativa (PID).
// Oráculo: o corpus de comandos (corpus-comandos.mjs), com 0 falsos positivos e 0 falsos negativos, nas ferramentas Bash e PowerShell.
// O script é o do projeto gerado com os três hooks, chamado com o JSON do evento PreToolUse; nenhum comando do corpus é executado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, gerar, hooksDe, entradaPre, correrMuitos, veredito, mostra } from './helpers.mjs';
import { MATAR_BLOQUEIA, MATAR_PASSA } from './corpus-comandos.mjs';

let proj;
const projeto = async () => (proj ??= await gerar(hooksDe(true, true, true)));

const correr = async (comandos, tool, bg) => {
  const u = await api();
  const p = await projeto();
  const rs = await correrMuitos(p, comandos.map((c) => ({ rel: u.scripts.matar, entrada: entradaPre(p, tool, c, bg) })));
  return rs.map((r, i) => ({ comando: comandos[i], r, v: veredito(r) }));
};

for (const tool of ['Bash', 'PowerShell']) {
  test(`C1 ${tool}: bloqueia os ${MATAR_BLOQUEIA.length} comandos do corpus que matam processos por nome (0 falsos negativos)`, async () => {
    const falsosNegativos = (await correr(MATAR_BLOQUEIA, tool)).filter((x) => !x.v.bloqueia).map((x) => `${JSON.stringify(x.comando)} → ${mostra(x.r)}`);
    assert.deepEqual(falsosNegativos, []);
  });

  test(`C1 ${tool}: deixa passar os ${MATAR_PASSA.length} comandos do corpus (0 falsos positivos; saída 0, sem deny nem ask)`, async () => {
    const falsosPositivos = (await correr(MATAR_PASSA, tool)).filter((x) => !x.v.passa).map((x) => `${JSON.stringify(x.comando)} → ${mostra(x.r)}`);
    assert.deepEqual(falsosPositivos, []);
  });

  test(`C1 ${tool}: com run_in_background true o veredito é o mesmo (bloqueia os do corpus a bloquear, passa os outros)`, async () => {
    const amostra = [...MATAR_BLOQUEIA.slice(0, 9), ...MATAR_PASSA.slice(0, 6)];
    const errados = (await correr(amostra, tool, true)).filter((x, i) => x.v.bloqueia !== i < 9 || (i >= 9 && !x.v.passa)).map((x) => `${JSON.stringify(x.comando)} → ${mostra(x.r)}`);
    assert.deepEqual(errados, []);
  });
}

test('C1: a mensagem de cada bloqueio diz a alternativa (matar por PID)', async () => {
  const semAlternativa = (await correr(MATAR_BLOQUEIA, 'Bash')).filter((x) => x.v.bloqueia && !/\bPID\b/i.test(x.v.mensagem)).map((x) => `${JSON.stringify(x.comando)} → ${JSON.stringify(x.v.mensagem.slice(0, 200))}`);
  assert.deepEqual(semAlternativa, []);
});

