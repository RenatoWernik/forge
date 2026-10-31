// Ronda −1 do F-20a (#70): espião pré-carregado com NODE_OPTIONS=--import=<este ficheiro> no `node .claude/check.cjs --env` que os ataques lançam.
// Substitui child_process.spawnSync e execFileSync. Nunca corre nenhum processo:
// - um comando que resolve para um binário falso (ficheiro JSON com "fakeAim": true) responde como o ai-memory descrito nesse ficheiro;
// - um comando com shell, ou que não resolve para um binário falso, falha com ENOENT;
// - spawn, exec, execSync, execFile e fork registam-se e falham com ENOENT (o seam do contrato é o spawnSync);
// - exceção: o próprio node (process.execPath, sem shell) corre de verdade, porque o check.cjs se relança a si mesmo nas simulações do --render.
// Regista em CRITICO_LOG (um JSON por linha) o argv, a shell e o AI_MEMORY_SERVER_URL efetivo de cada chamada (o resto do ambiente não, por segurança).
// O "PATH" resolve-se como no Windows: cada pasta do PATH do ambiente efetivo, com o nome tal como está e com .exe e .com.
// Só biblioteca padrão.
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const LOG = process.env.CRITICO_LOG;
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
// a resposta do binário falso: [código de saída, stdout, stderr]
const responde = (spec, args) => {
  const r = (x) => [x?.code ?? 0, x?.out ?? '', x?.err ?? ''];
  if (args.length === 1 && args[0] === '--version') return r({ out: spec.version ?? '' });
  if (args.includes('status')) return r(spec.status);
  if (args.includes('hook')) return r(spec.hook);
  if (args.includes('read-page')) return r(spec.readPage);
  return [2, '', 'fake ai-memory: unknown command'];
};
const chama = (fn, cmd, rest) => {
  const args = Array.isArray(rest[0]) ? rest[0].map(String) : [];
  const opts = rest.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? {};
  const env = opts.env ?? process.env;
  const shell = Boolean(opts.shell) || fn === 'exec' || fn === 'execSync';
  const file = shell ? null : resolve(String(cmd), env);
  const spec = file ? fake(file) : null;
  regista({ fn, cmd: String(cmd), args, shell, fake: Boolean(spec), file, serverUrlEnv: envVal(env, 'AI_MEMORY_SERVER_URL') ?? null, input: typeof opts.input === 'string' ? opts.input.slice(0, 300) : null });
  return { args, opts, spec };
};
const buf = (s, opts) => (opts.encoding && opts.encoding !== 'buffer' ? s : Buffer.from(s));

const real = { spawnSync: cp.spawnSync, execFileSync: cp.execFileSync };
const ehNode = (cmd, rest) => String(cmd).toLowerCase() === process.execPath.toLowerCase() && !rest.some((x) => x && typeof x === 'object' && !Array.isArray(x) && x.shell);
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
for (const n of ['spawn', 'exec', 'execSync', 'execFile', 'fork']) {
  cp[n] = (cmd, ...rest) => {
    chama(n, cmd, rest);
    const cb = rest.find((x) => typeof x === 'function');
    if (cb) { process.nextTick(() => cb(enoent(cmd), '', '')); return { on() { return this; }, once() { return this; }, kill() {}, stdout: null, stderr: null }; }
    throw enoent(cmd);
  };
}
syncBuiltinESMExports();