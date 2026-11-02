// Crítico R3 do V-01 (#125). Um número registado por um processo nosso já morto volta, reciclado, num processo NOSSO, registado de novo como o lanca() e o motores() fazem.
// O registaPid guarda Math.min(desde) e une as cmd: o mataArvore() e a limpa() recusam o nosso processo, e o teste falha com «o motor não morreu».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import * as H from './helpers.mjs';

async function reciclado(morto) {
  const t0 = Date.now();
  for (let n = 0; Date.now() - t0 < 120000 && n < 6000; n++) {
    const p = spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { stdio: 'ignore', windowsHide: true });
    if (p.pid === morto) return p;
    p.kill(); await new Promise((r) => p.once('exit', r));
  }
  return null;
}
const vive = (p) => H.vivo(p.pid) && p.exitCode === null && p.signalCode === null;

for (const [nome, antes, depois] of [['lanca depois de lanca', {}, {}], ['motor depois de lanca', {}, { cmd: ['setTimeout'] }], ['motor depois de outro motor', { cmd: ['--motor-interno', 'nonceantigo'] }, { cmd: ['setTimeout'] }]]) {
  test(`A9 (${nome}): o processo nosso com um número já registado morre`, { timeout: 200000 }, async (t) => {
    const morto = spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid;
    H.registaPid(morto, antes);
    const p = await reciclado(morto);
    if (!p) return t.skip('sem reciclagem');
    H.registaPid(p.pid, depois);
    H.mataArvore(p.pid);
    await H.esperaAte(() => !vive(p), 3000);
    const vivo = vive(p);
    p.kill();
    await H.limpa();
    assert.equal(vivo, false, `o mataArvore() recusou o processo nosso ${p.pid}`);
  });
}