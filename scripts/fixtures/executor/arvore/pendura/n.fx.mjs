// Lança um neto que nunca acaba (com o stdio herdado, como um browser) e fica pendurado; o executor tem de matar a árvore ao fim de limite_s.
// No Windows o neto sai do job object do libuv (detached), como um browser que cria os seus processos: matar só o filho deixa-o vivo, e o
// taskkill /PID /T do filho apanha-o. Em POSIX fica no grupo do filho, que é o que o process.kill(-pid) mata.
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { grava } from '../sonda.mjs';

test('pendura com um neto', async () => {
  const neto = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e3)'], { stdio: 'inherit', detached: process.platform === 'win32' });
  grava('pids.json', { neto: neto.pid, corredor: process.pid, pai: process.ppid, home: process.env.HOME ?? null, t: Date.now() });
  await new Promise(() => setInterval(() => {}, 1e3));
});