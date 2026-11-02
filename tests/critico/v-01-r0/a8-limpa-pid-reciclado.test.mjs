// Crítico R2 do V-01 (#125): a limpa() dos helpers mata processos alheios. Regista-se o PID de um filho já morto (como o lanca() e o motores() fazem) e, quando o Windows
// recicla esse número para outro processo (aqui, um inocente lançado por este teste), a limpa() faz taskkill /PID /T /F nele.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import * as H from './helpers.mjs';

test('A8: um PID registado que morreu e foi reciclado por um inocente: a limpa() não o pode matar', { timeout: 240000 }, async () => {
  const morto = spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid;
  H.registaPid(morto);
  let inocente = null, tentativas = 0;
  const t0 = Date.now(), vistos = new Set();
  while (Date.now() - t0 < 200000 && tentativas < 3000) {
    tentativas++;
    const p = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore', windowsHide: true });
    vistos.add(p.pid);
    if (p.pid === morto) { inocente = p; break; }
    p.kill();
    await new Promise((r) => { p.once('exit', r); });
  }
  console.log(`A8 PID ${morto}: reciclado ao fim de ${tentativas} lançamentos e ${Math.round((Date.now() - t0) / 1000)} s; PIDs distintos vistos ${vistos.size}`);
  if (!inocente) return;
  assert.ok(H.vivo(inocente.pid));
  await H.limpa();
  await H.espera(500);
  const vivo = H.vivo(inocente.pid);
  if (vivo) inocente.kill();
  assert.ok(vivo, `a limpa() matou o processo inocente ${inocente.pid}, que tinha o número de um PID registado e já morto`);
});