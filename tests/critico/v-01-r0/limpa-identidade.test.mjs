// Classe do a8 (crítico R2, #125): a limpa() e o mataArvore() só matam um PID registado se ainda for o processo que se registou. Determinístico, sem
// esperar que o Windows recicle um PID: um processo inocente vivo é registado como se fosse (a) um motor (linha de comando sem `--motor-interno` e o nonce) ou
// (b) um processo que já existia antes de ele nascer (`desde` anterior à criação). Um processo registado de forma normal continua a morrer (controlo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as H from './helpers.mjs';

const inocente = () => spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore', windowsHide: true });
const morre = async (p) => H.esperaAte(() => p.exitCode !== null || p.signalCode !== null || !H.vivo(p.pid), 5000);

test('limpa(): um PID registado como motor mas cuja linha de comando não é a de um motor não é morto; um registado normalmente é', { timeout: 120000 }, async () => {
  const alheio = inocente(), meu = inocente();
  try {
    H.registaPid(alheio.pid, { cmd: ['--motor-interno', 'abc123'] });
    H.registaPid(meu.pid);
    await H.limpa();
    assert.ok(await morre(meu), 'o processo registado normalmente devia ter morrido');
    assert.ok(H.vivo(alheio.pid), 'a limpa() matou um processo que não é o motor registado');
  } finally { alheio.kill(); meu.kill(); }
});

test('mataArvore(): um PID registado com `desde` anterior à criação do processo (PID reciclado) não é morto', { timeout: 120000 }, async () => {
  const alheio = inocente();
  try {
    H.registaPid(alheio.pid, { desde: Date.now() - 60000 });
    H.mataArvore(alheio.pid);
    await H.espera(500);
    assert.ok(H.vivo(alheio.pid) && alheio.exitCode === null, 'o mataArvore() matou um processo que nasceu depois do registo');
  } finally { alheio.kill(); }
  await H.limpa();
});
