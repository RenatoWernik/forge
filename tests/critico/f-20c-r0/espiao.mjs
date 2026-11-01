// Ronda −1 do F-20c (#72): espião pré-carregado (NODE_OPTIONS=--import=<este ficheiro>) no `node .claude/check.cjs --env` que os ataques C4 e C5 lançam.
// É o espião do F-20a (f-20a-r0/espiao.mjs) com três acrescentos:
// - CRITICO_PLATFORM força a plataforma: process.platform (o seam do contrato) e, por coerência, os.platform();
// - o `git` sem shell corre de verdade, com o PATH real do teste (CRITICO_REAL_PATH), porque o C5 lê as tags `cp-*` de um repositório temporário;
// - o binário falso responde ao `read-page` por caminho: spec.readPages = { "<path>": { code, out } }, e o resto cai em spec.readPage.
// Nenhum ai-memory, systemctl, launchctl ou wscript corre: o que não é o node, o git ou um binário falso falha com ENOENT e fica registado.
// Regista em CRITICO_LOG um JSON por linha: o argv, a shell e o AI_MEMORY_SERVER_URL efetivo de cada chamada. Só biblioteca padrão.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const PLAT = process.env.CRITICO_PLATFORM, REAL_PATH = process.env.CRITICO_REAL_PATH, LOG = process.env.CRITICO_LOG;
if (PLAT) {
  Object.defineProperty(process, 'platform', { value: PLAT, configurable: true, enumerable: true, writable: false });
  os.platform = () => PLAT;
}
const regista = (o) => { if (LOG) fs.appendFileSync(LOG, JSON.stringify(o) + '\n'); };
const envVal = (env, k) => { const key = Object.keys(env).find((x) => x.toUpperCase() === k); return key === undefined ? undefined : env[key]; };
const fake = (f) => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j && j.fakeAim ? j : null; } catch { return null; } };
const resolve = (cmd, env) => {
  const nomes = (b) => [b, b + '.exe', b + '.com'];
  if (/[\\/]/.test(cmd)) { for (const f of nomes(cmd)) { try { if (fs.statSync(f).isFile()) return f; } catch {} } return null; }
  for (const d of String(envVal(env, 'PATH') ?? '').split(path.delimiter).filter(Boolean)) for (const f of nomes(path.join(d, cmd))) { try { if (fs.statSync(f).isFile()) return f; } catch {} }
  return null;
};
const enoent = (cmd) => Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT', errno: -4058, syscall: 'spawn ' + cmd, path: String(cmd) });
const responde = (spec, args) => {
  const r = (x) => [x?.code ?? 0, x?.out ?? '', x?.err ?? ''];
  if (args.length === 1 && args[0] === '--version') return r({ out: spec.version ?? '' });
  if (args.includes('status')) return r(spec.status);
  if (args.includes('hook')) return r(spec.hook);
  if (args.includes('read-page')) { const i = args.indexOf('--path'); const p = i >= 0 ? args[i + 1] : null; return r(spec.readPages && p in spec.readPages ? spec.readPages[p] : spec.readPage); }
  return [2, '', 'fake ai-memory: unknown command'];
};
const opcoes = (rest) => rest.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? {};
const chama = (fn, cmd, rest) => {
  const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
  const opts = opcoes(rest);
  const env = opts.env ?? process.env;
  const shell = Boolean(opts.shell) || fn === 'exec' || fn === 'execSync';
  const file = shell ? null : resolve(String(cmd), env);
  const spec = file ? fake(file) : null;
  regista({ fn, cmd: String(cmd), args, shell, fake: Boolean(spec), file, serverUrlEnv: envVal(env, 'AI_MEMORY_SERVER_URL') ?? null });
  return { args, opts, spec };
};
const buf = (s, opts) => (opts.encoding && opts.encoding !== 'buffer' ? s : Buffer.from(s));
const real = { spawnSync: cp.spawnSync, execFileSync: cp.execFileSync };
const ehNode = (cmd, rest) => String(cmd).toLowerCase() === process.execPath.toLowerCase() && !opcoes(rest).shell;
const ehGit = (cmd, rest) => Boolean(REAL_PATH) && /^git(\.exe)?$/i.test(path.basename(String(cmd))) && !opcoes(rest).shell;
// o git real, com o PATH real e o resto do ambiente efetivo da chamada
const viaGit = (fn, cmd, rest) => {
  const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
  const opts = opcoes(rest);
  const env = { ...(opts.env ?? process.env) };
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'PATH') delete env[k];
  env.PATH = REAL_PATH;
  regista({ fn, cmd: String(cmd), args, shell: false, fake: false, git: true, serverUrlEnv: null });
  return real[fn](cmd, args, { ...opts, env });
};

cp.spawnSync = (cmd, ...rest) => {
  if (ehNode(cmd, rest)) return real.spawnSync(cmd, ...rest);
  if (ehGit(cmd, rest)) return viaGit('spawnSync', cmd, rest);
  const { args, opts, spec } = chama('spawnSync', cmd, rest);
  if (!spec) return { pid: 0, output: null, stdout: null, stderr: null, status: null, signal: null, error: enoent(cmd) };
  const [status, out, err] = responde(spec, args);
  return { pid: 4242, output: [null, buf(out, opts), buf(err, opts)], stdout: buf(out, opts), stderr: buf(err, opts), status, signal: null };
};
cp.execFileSync = (cmd, ...rest) => {
  if (ehNode(cmd, rest)) return real.execFileSync(cmd, ...rest);
  if (ehGit(cmd, rest)) return viaGit('execFileSync', cmd, rest);
  const { args, opts, spec } = chama('execFileSync', cmd, rest);
  if (!spec) throw enoent(cmd);
  const [status, out, err] = responde(spec, args);
  if (status !== 0) throw Object.assign(new Error('Command failed: ' + cmd), { status, stdout: buf(out, opts), stderr: buf(err, opts) });
  return buf(out, opts);
};
for (const n of ['spawn', 'exec', 'execSync', 'execFile', 'fork']) {
  cp[n] = (cmd, ...rest) => {
    chama(n, cmd, rest);
    const cb = rest.find((x) => typeof x === 'function');
    if (cb) { process.nextTick(() => cb(enoent(cmd), '', '')); return { on() { return this; }, once() { return this; }, kill() {}, unref() {}, stdout: null, stderr: null }; }
    throw enoent(cmd);
  };
}
syncBuiltinESMExports();