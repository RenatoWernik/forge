// Ronda −1 do F-21a (#73): espião pré-carregado com NODE_OPTIONS=--import=<este ficheiro> no `node .claude/graph.mjs` e no `node .claude/check.cjs --env`
// que os ataques lançam. Substitui spawnSync, spawn, execFileSync, execFile, execSync, exec e fork. Nenhum graphify real corre, nunca:
// - graphify (pelo nome do binário, com ou sem caminho, .exe ou .cmd, direto, com shell ou via cmd.exe /c): responde como o descrito em CRITICO_GRAPHIFY
//   (JSON { code, out, err, grava }); sem CRITICO_GRAPHIFY falha com ENOENT. Com "grava", escreve <cwd>/graphify-out/graph.json antes de responder,
//   como o graphify faz, para que um graph.mjs que leia o graph.json antes de correr o comando, ou fora da raiz, leia o antigo;
// - git e o próprio node (process.execPath) correm de verdade: a frescura compara com o HEAD de um repositório temporário real;
// - tudo o resto falha com ENOENT.
// Regista em CRITICO_LOG (um JSON por linha): função, comando e args normalizados, shell, cwd efetivo e se correu de verdade. Só biblioteca padrão.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import util from 'node:util';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';

const LOG = process.env.CRITICO_LOG;
const regista = (o) => { if (LOG) fs.appendFileSync(LOG, JSON.stringify(o) + '\n'); };
const real = { ...cp };
const nome = (c) => path.basename(String(c).replace(/^"|"$/g, '')).toLowerCase().replace(/\.(exe|cmd|bat|com|ps1)$/, '');
const parte = (s) => String(s).trim().split(/\s+/).filter(Boolean).map((x) => x.replace(/^"|"$/g, ''));
const SHELLS = ['exec', 'execSync'];
// o comando efetivo: com shell e sem args, o comando é a linha inteira; cmd.exe /d /s /c <linha> conta como a linha
const normaliza = (fn, cmd, rest) => {
  const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
  const opts = rest.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? {};
  const shell = Boolean(opts.shell) || SHELLS.includes(fn);
  let c = String(cmd), a = args;
  if (shell && !a.length) { const p = parte(c); c = p[0] ?? ''; a = p.slice(1); }
  if (nome(c) === 'cmd') { let i = 0; while (i < a.length && /^\/[a-z]$/i.test(a[i])) i++; const resto = a.slice(i).flatMap(parte); c = resto[0] ?? ''; a = resto.slice(1); }
  return { c, a, opts, shell, cwd: path.resolve(String(opts.cwd ?? process.cwd())) };
};
const enoent = (cmd) => Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT', errno: -4058, syscall: 'spawn ' + cmd, path: String(cmd) });
const cenario = () => { try { return process.env.CRITICO_GRAPHIFY ? JSON.parse(process.env.CRITICO_GRAPHIFY) : null; } catch { return null; } };
const corre = (cwd) => {
  const s = cenario();
  if (!s) return null;
  if (s.grava !== undefined) { const d = path.join(cwd, 'graphify-out'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'graph.json'), typeof s.grava === 'string' ? s.grava : JSON.stringify(s.grava)); }
  return [s.code ?? 0, s.out ?? '', s.err ?? ''];
};
const buf = (s, opts) => (opts.encoding && opts.encoding !== 'buffer' ? s : Buffer.from(s));
const herda = (opts) => opts.stdio === 'inherit' || (Array.isArray(opts.stdio) && opts.stdio[1] === 'inherit');

const trata = (fn, cmd, rest) => {
  if (String(cmd).toLowerCase() === process.execPath.toLowerCase() && !rest.some((x) => x && typeof x === 'object' && !Array.isArray(x) && x.shell)) return { realmente: true };
  const n = normaliza(fn, cmd, rest);
  const quem = nome(n.c);
  const realmente = quem === 'git';
  regista({ fn, cmd: n.c, nome: quem, args: n.a, shell: n.shell, cwd: n.cwd, real: realmente });
  if (realmente) return { realmente: true };
  return { n, r: quem === 'graphify' ? corre(n.cwd) : null };
};

cp.spawnSync = (cmd, ...rest) => {
  const t = trata('spawnSync', cmd, rest);
  if (t.realmente) return real.spawnSync(cmd, ...rest);
  if (!t.r) return { pid: 0, output: null, stdout: null, stderr: null, status: null, signal: null, error: enoent(cmd) };
  const [status, out, err] = t.r, o = t.n.opts;
  if (herda(o)) { process.stdout.write(out); process.stderr.write(err); return { pid: 4242, output: [null, null, null], stdout: null, stderr: null, status, signal: null }; }
  return { pid: 4242, output: [null, buf(out, o), buf(err, o)], stdout: buf(out, o), stderr: buf(err, o), status, signal: null };
};
const sincrono = (fn) => (cmd, ...rest) => {
  const t = trata(fn, cmd, rest);
  if (t.realmente) return real[fn](cmd, ...rest);
  if (!t.r) throw enoent(cmd);
  const [status, out, err] = t.r, o = t.n.opts;
  if (status !== 0) throw Object.assign(new Error('Command failed: ' + cmd + '\n' + err), { status, stdout: buf(out, o), stderr: buf(err, o), output: [null, buf(out, o), buf(err, o)] });
  return buf(out, o);
};
cp.execFileSync = sincrono('execFileSync');
cp.execSync = sincrono('execSync');

const filho = (t, cmd) => {
  const ch = new EventEmitter();
  const o = t.n.opts;
  ch.pid = t.r ? 4242 : undefined;
  ch.stdout = herda(o) ? null : new PassThrough();
  ch.stderr = herda(o) ? null : new PassThrough();
  ch.stdin = new PassThrough();
  ch.kill = () => true;
  ch.exitCode = null;
  setImmediate(() => {
    if (!t.r) { ch.emit('error', enoent(cmd)); ch.emit('close', -4058, null); return; }
    const [status, out, err] = t.r;
    if (ch.stdout) { ch.stdout.end(out); ch.stderr.end(err); } else { process.stdout.write(out); process.stderr.write(err); }
    setTimeout(() => { ch.exitCode = status; ch.emit('exit', status, null); setTimeout(() => ch.emit('close', status, null), 5); }, 20);
  });
  return ch;
};
cp.spawn = (cmd, ...rest) => { const t = trata('spawn', cmd, rest); return t.realmente ? real.spawn(cmd, ...rest) : filho(t, cmd); };
cp.fork = (cmd, ...rest) => { const t = trata('fork', cmd, rest); return t.realmente ? real.fork(cmd, ...rest) : filho({ n: t.n, r: null }, cmd); };
const comCallback = (fn) => {
  const f = (cmd, ...rest) => {
    const t = trata(fn, cmd, rest);
    if (t.realmente) return real[fn](cmd, ...rest);
    const cb = rest.find((x) => typeof x === 'function');
    const ch = Object.assign(new EventEmitter(), { pid: t.r ? 4242 : undefined, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true });
    process.nextTick(() => {
      if (!cb) return;
      if (!t.r) return cb(enoent(cmd), '', '');
      const [status, out, err] = t.r, o = t.n.opts;
      cb(status === 0 ? null : Object.assign(new Error('Command failed: ' + cmd), { code: status, stdout: buf(out, o.encoding ? o : { encoding: 'utf8' }), stderr: buf(err, o.encoding ? o : { encoding: 'utf8' }) }), buf(out, o.encoding ? o : { encoding: 'utf8' }), buf(err, o.encoding ? o : { encoding: 'utf8' }));
    });
    return ch;
  };
  f[util.promisify.custom] = (cmd, ...rest) => new Promise((res, rej) => f(cmd, ...rest, (e, stdout, stderr) => (e ? rej(Object.assign(e, { stdout, stderr })) : res({ stdout, stderr }))));
  return f;
};
cp.execFile = comCallback('execFile');
cp.exec = comCallback('exec');
syncBuiltinESMExports();