// Writes .checkpoints/painel.json atomically (F-25): the live panel never reads it half written.
// Usage, from the project root: <JSON> | node .claude/painel-gravar.mjs
// Checks the JSON with validar() of the shared reader; invalid JSON or a field error exits with 1, shows the errors and leaves
// the file as it was. Otherwise writes .checkpoints/painel.json.tmp-<pid> and renames it over painel.json. Never leaves a .tmp-*.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { validar } from './painel-leitor.mjs';

const falhar = (msg) => { process.stderr.write(msg + '\n'); process.exit(1); };

let o;
try { o = JSON.parse(readFileSync(0, 'utf8').replace(/^﻿/, '')); } catch (e) { falhar(`painel.json: not valid JSON: ${e.message}`); }
const erros = validar(o);
if (erros.length) falhar(erros.join('\n'));

const destino = '.checkpoints/painel.json';
const tmp = `${destino}.tmp-${process.pid}`;
try {
  mkdirSync('.checkpoints', { recursive: true });
  writeFileSync(tmp, JSON.stringify(o, null, 2) + '\n');
  // On Windows the rename fails with EPERM, EACCES or EBUSY while another process reads painel.json: try again for up to 3 s
  for (let fim = Date.now() + 3000; ;) {
    try { renameSync(tmp, destino); break; } catch (e) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || Date.now() > fim) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
} catch (e) {
  rmSync(tmp, { force: true });
  falhar(`painel.json: not written: ${e.message}`);
}
