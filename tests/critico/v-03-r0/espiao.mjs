// Ronda −1 do V-03 (#127): o espião dos spawns de `--test`, carregado com --import nos filhos que correm um ficheiro de teste. Cada spawnSync,
// spawn ou execFileSync cujo argv tem '--test' fica registado em V03_ESPIAO_LOG ({ cmd, args, cwd relativo a V03_RAIZ }) e devolve uma
// resposta falsa (V03_ESPIAO_RESPOSTA = verde | vermelho) sem correr nada. Os outros comandos (git e afins) correm como sempre.
import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { appendFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const LOG = process.env.V03_ESPIAO_LOG, RAIZ = process.env.V03_RAIZ || process.cwd();
const resumo = (pass, fail) => `# tests ${pass + fail}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n`;
const VERDE = 'TAP version 13\n' + resumo(100000, 0);
const VERMELHO = 'TAP version 13\nnot ok 1 - v03 espiao\n1..1\n' + resumo(0, 1);
const resposta = () => (process.env.V03_ESPIAO_RESPOSTA === 'vermelho' ? { status: 1, stdout: VERMELHO } : { status: 0, stdout: VERDE });
const eTeste = (args) => Array.isArray(args) && args.includes('--test');
const texto = (o) => !!o?.encoding && o.encoding !== 'buffer';
const regista = (cmd, args, o) => {
  if (LOG) appendFileSync(LOG, JSON.stringify({ cmd: cmd === process.execPath ? 'node' : String(cmd), args: args.map(String), cwd: relative(RAIZ, resolve(o?.cwd ?? process.cwd())).replaceAll('\\', '/') }) + '\n');
};
const orig = { spawnSync: cp.spawnSync, spawn: cp.spawn, execFileSync: cp.execFileSync };

cp.spawnSync = function (cmd, args, o) {
  if (!eTeste(args)) return orig.spawnSync.apply(this, arguments);
  regista(cmd, args, o);
  const { status, stdout } = resposta(), out = texto(o) ? stdout : Buffer.from(stdout), err = texto(o) ? '' : Buffer.alloc(0);
  return { pid: 0, status, signal: null, stdout: out, stderr: err, output: [null, out, err] };
};
cp.spawn = function (cmd, args, o) {
  if (!eTeste(args)) return orig.spawn.apply(this, arguments);
  regista(cmd, args, o);
  const { status, stdout } = resposta(), p = new EventEmitter();
  p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.pid = 0; p.kill = () => true;
  setImmediate(() => { p.emit('spawn'); p.stdout.end(stdout); p.stderr.end(); setImmediate(() => { p.exitCode = status; p.emit('exit', status, null); p.emit('close', status, null); }); });
  return p;
};
cp.execFileSync = function (cmd, args, o) {
  if (!eTeste(args)) return orig.execFileSync.apply(this, arguments);
  regista(cmd, args, o);
  const { status, stdout } = resposta();
  if (status !== 0) { const e = new Error('v03 espiao: vermelho'); e.status = status; e.stdout = stdout; e.stderr = ''; throw e; }
  return texto(o) ? stdout : Buffer.from(stdout);
};
syncBuiltinESMExports();