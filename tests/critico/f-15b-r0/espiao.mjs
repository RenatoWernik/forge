// Pré-carregado com NODE_OPTIONS=--import=<este ficheiro> no processo `node scripts/update.mjs` que os ataques lançam.
// Regista em CRITICO_LOG (um JSON por linha) e faz falhar:
// - cada tentativa de rede (fetch, http, https, net, tls, dns);
// - cada processo filho (child_process: falha com ENOENT, nunca corre nada);
// - cada escrita no disco (fs e fs/promises: falha com EACCES).
// Um update que apanhe o erro e siga em frente continua a ser detetado pelo registo. Só biblioteca padrão.
import fs, { appendFileSync } from 'node:fs';
import cp from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const LOG = process.env.CRITICO_LOG;
const regista = (o) => { if (LOG) appendFileSync(LOG, JSON.stringify(o) + '\n'); };

// rede
globalThis.fetch = async (u) => { regista({ t: 'rede', fn: 'fetch', alvo: String(u?.url ?? u) }); throw new Error('critico: rede'); };
for (const [mod, nomes] of [[http, ['request', 'get']], [https, ['request', 'get']], [net, ['connect', 'createConnection']], [tls, ['connect']], [dns, ['lookup', 'resolve', 'resolve4', 'resolve6']]]) {
  for (const n of nomes) mod[n] = (...a) => { regista({ t: 'rede', fn: n, alvo: String(typeof a[0] === 'object' ? JSON.stringify(a[0]) : a[0]).slice(0, 200) }); throw new Error('critico: rede (' + n + ')'); };
}
dns.promises.lookup = async (h) => { regista({ t: 'rede', fn: 'dns.promises.lookup', alvo: String(h) }); throw new Error('critico: rede'); };

// processos filhos
const enoent = (cmd) => Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT', errno: -4058, syscall: 'spawn ' + cmd, path: String(cmd) });
for (const n of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  cp[n] = (cmd, ...rest) => {
    const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
    const opts = rest.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? {};
    regista({ t: 'proc', fn: n, cmd: String(cmd), args, shell: Boolean(opts.shell) || n === 'exec' || n === 'execSync', cwd: opts.cwd ? String(opts.cwd) : null });
    const cb = rest.find((x) => typeof x === 'function');
    if (cb) { process.nextTick(() => cb(enoent(cmd), '', '')); return { on() { return this; }, kill() {}, stdout: null, stderr: null }; }
    throw enoent(cmd);
  };
}

// escritas no disco
const bloqueia = (fn, alvo) => { regista({ t: 'escrita', fn, alvo: String(alvo) }); return Object.assign(new Error('critico: escrita bloqueada ' + alvo), { code: 'EACCES' }); };
const ESCRITAS = ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'unlink', 'rename', 'copyFile', 'cp', 'symlink', 'link', 'truncate', 'utimes', 'chmod'];
for (const n of ESCRITAS) {
  if (typeof fs[n] === 'function') fs[n] = (p, ...rest) => { const e = bloqueia(n, p); const cb = rest.findLast((x) => typeof x === 'function'); if (cb) process.nextTick(() => cb(e)); else throw e; };
  if (typeof fs[n + 'Sync'] === 'function') fs[n + 'Sync'] = (p) => { throw bloqueia(n + 'Sync', p); };
  if (typeof fs.promises[n] === 'function') fs.promises[n] = async (p) => { throw bloqueia('promises.' + n, p); };
}
fs.createWriteStream = (p) => { throw bloqueia('createWriteStream', p); };
const W = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_TRUNC;
const escreve = (f) => (typeof f === 'string' ? /[wa+]/.test(f) : typeof f === 'number' ? (f & W) !== 0 : false);
const { open, openSync } = fs;
const popen = fs.promises.open;
fs.open = (p, f, ...r) => { if (escreve(f)) { const e = bloqueia('open', p); const cb = r.findLast((x) => typeof x === 'function'); if (cb) return process.nextTick(() => cb(e)); throw e; } return open(p, f, ...r); };
fs.openSync = (p, f, ...r) => { if (escreve(f)) throw bloqueia('openSync', p); return openSync(p, f, ...r); };
fs.promises.open = async (p, f, ...r) => { if (escreve(f)) throw bloqueia('promises.open', p); return popen(p, f, ...r); };

syncBuiltinESMExports();
