// Ronda −1 do F-20b (#71), C5: espião pré-carregado (NODE_OPTIONS=--import=<este ficheiro>) no `node .claude/start-ai-memory.mjs` e no
// `node .claude/hooks/forge-ai-memory.mjs` que os ataques lançam. Nunca corre nenhum ai-memory:
// - spawnSync e execFileSync: um comando que resolve para um binário falso (ficheiro JSON com "fakeAim": true, como no F-20a) responde como ele;
//   o resto falha com ENOENT; o próprio node (process.execPath, sem shell) corre de verdade;
// - spawn: regista o argv e as opções (detached, stdio, windowsHide); se for o binário falso com `serve`, pede ao servidor de controlo do teste
//   (CRITICO_CTL) que levante o servidor falso na porta do --bind, e devolve um filho falso cujo unref() fica registado;
// - exec, execSync, execFile e fork registam-se e falham com ENOENT.
// Regista em CRITICO_LOG um JSON por linha. Só biblioteca padrão.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const LOG = process.env.CRITICO_LOG, CTL = process.env.CRITICO_CTL;
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
  if (args.includes('read-page')) return r(spec.readPage);
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
  regista({ fn, cmd: String(cmd), args, shell, fake: Boolean(spec), opts: { detached: opts.detached, stdio: opts.stdio, windowsHide: opts.windowsHide } });
  return { args, opts, spec };
};
const buf = (s, opts) => (opts.encoding && opts.encoding !== 'buffer' ? s : Buffer.from(s));
const real = { spawnSync: cp.spawnSync, execFileSync: cp.execFileSync, spawn: cp.spawn };
const ehNode = (cmd, rest) => String(cmd).toLowerCase() === process.execPath.toLowerCase() && !opcoes(rest).shell;

cp.spawnSync = (cmd, ...rest) => {
  if (ehNode(cmd, rest)) return real.spawnSync(cmd, ...rest);
  const { args, opts, spec } = chama('spawnSync', cmd, rest);
  if (!spec) return { pid: 0, output: null, stdout: null, stderr: null, status: null, signal: null, error: enoent(cmd) };
  const [status, out, err] = responde(spec, args);
  return { pid: 4242, output: [null, buf(out, opts), buf(err, opts)], stdout: buf(out, opts), stderr: buf(err, opts), status, signal: null };
};
cp.execFileSync = (cmd, ...rest) => {
  if (ehNode(cmd, rest)) return real.execFileSync(cmd, ...rest);
  const { args, opts, spec } = chama('execFileSync', cmd, rest);
  if (!spec) throw enoent(cmd);
  const [status, out, err] = responde(spec, args);
  if (status !== 0) throw Object.assign(new Error('Command failed: ' + cmd), { status, stdout: buf(out, opts), stderr: buf(err, opts) });
  return buf(out, opts);
};
cp.spawn = (cmd, ...rest) => {
  const { args, spec } = chama('spawn', cmd, rest);
  const ouvintes = {};
  const filho = {
    pid: spec ? 4242 : undefined, stdout: null, stderr: null, stdin: null, connected: false, exitCode: null,
    unref() { regista({ fn: 'unref' }); return this; }, ref() { return this; }, kill() { return true; },
    on(e, f) { (ouvintes[e] ??= []).push(f); return this; }, once(e, f) { return this.on(e, f); }, off() { return this; }, removeListener() { return this; }, removeAllListeners() { return this; }, emit() { return true; },
  };
  if (!spec) { process.nextTick(() => (ouvintes.error ?? []).forEach((f) => f(enoent(cmd)))); return filho; }
  if (args.includes('serve') && CTL) {
    const i = args.indexOf('--bind');
    fetch(CTL + '/up?bind=' + encodeURIComponent(i >= 0 ? args[i + 1] : '') + '&dir=' + encodeURIComponent(args[args.indexOf('--data-dir') + 1] ?? '')).catch(() => {});
  }
  process.nextTick(() => (ouvintes.spawn ?? []).forEach((f) => f()));
  return filho;
};
for (const n of ['exec', 'execSync', 'execFile', 'fork']) {
  cp[n] = (cmd, ...rest) => {
    chama(n, cmd, rest);
    const cb = rest.find((x) => typeof x === 'function');
    if (cb) { process.nextTick(() => cb(enoent(cmd), '', '')); return { on() { return this; }, once() { return this; }, kill() {}, unref() {}, stdout: null, stderr: null }; }
    throw enoent(cmd);
  };
}
syncBuiltinESMExports();