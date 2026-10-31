// Ronda −1 do F-20b (#71), C5: arranque escondido (`node .claude/start-ai-memory.mjs`) e aviso do SessionStart (`node .claude/hooks/forge-ai-memory.mjs`),
// num projeto gerado pelo scaffold. Oráculos: servidor falso em 127.0.0.1:0, espião (espiao.mjs) que intercepta o spawn e, no lugar do binário,
// pede a este processo que levante o servidor falso na porta do --bind; as linhas literais da #71; duas corridas seguidas = um só spawn.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { caixa as caixa20a, ambiente, binFalso, AIM_OK, statusOut, fwd } from '../f-20a-r0/helpers.mjs';
import { W, P, CANARIO_2, TOML_LOCAL, projeto, apaga, servidorFalso, portaLivre, PROIBIDAS } from './helpers.mjs';

const ESPIAO = fileURLToPath(new URL('./espiao.mjs', import.meta.url));
const START = '.claude/start-ai-memory.mjs', HOOK = '.claude/hooks/forge-ai-memory.mjs';
const L = {
  jaOn: (u) => `ai-memory: already on at ${u}`,
  conflito: (u) => `ai-memory: CONFLICT at ${u}: another server answers on this port. Run node .claude/check.cjs --env.`,
  semBin: 'ai-memory: binary not found. Run the forge machine check (update.mjs --check).',
  comecou: (u) => `ai-memory: started at ${u}`,
  hookOn: (u) => `ai-memory: on at ${u} (this project's server).`,
  hookOff: (u) => `ai-memory: OFF at ${u}. Start it: node .claude/start-ai-memory.mjs (nothing is captured while it is off).`,
};

// servidor de controlo: o espião pede-lhe que levante o servidor falso na porta do --bind (modo.sobe = false: não levanta)
const modo = { sobe: true };
const levantados = [];
const ctl = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const port = Number(String(u.searchParams.get('bind')).split(':').pop());
  if (modo.sobe && port && !PROIBIDAS.includes(port)) { try { levantados.push(await servidorFalso(port)); } catch {} }
  res.end('ok');
});
await new Promise((r) => ctl.listen(0, '127.0.0.1', r));
const CTL = 'http://127.0.0.1:' + ctl.address().port;

const proj = await projeto();
const limpar = [() => apaga(proj)];
after(async () => { for (const s of levantados) await s.fecha(); await new Promise((r) => ctl.close(r)); for (const f of limpar) await f(); });

// um cenário: caixa nova, [forge] com a url e um data-dir da caixa, e o binário falso (ou nenhum)
const cenario = async ({ url, statusDir, semBin = false } = {}) => {
  const sb = caixa20a();
  limpar.push(() => apaga(sb.dir));
  const dataDir = fwd(join(sb.dir, 'aim-data'));
  writeFileSync(join(proj, TOML_LOCAL), `[forge]\nserver_url = "${url}"\ndata_dir = "${dataDir}"\n`); // a [forge] vive no .ai-memory.local.toml (6548062958)
  const extra = { CRITICO_CTL: CTL, CLAUDE_PROJECT_DIR: proj, AI_MEMORY_AUTH_TOKEN: CANARIO_2 };
  if (!semBin) extra.AI_MEMORY_BIN = binFalso(join(sb.dir, 'bin', 'ai-memory.exe'), { ...AIM_OK('3.3.0', dataDir), status: statusOut(statusDir ?? dataDir) });
  return { sb, dataDir, env: ambiente(sb, extra) };
};
const corre = (rel, env) => new Promise((res) => {
  const log = join(env.TEMP, 'critico-' + Math.random().toString(36).slice(2) + '.log');
  writeFileSync(log, '');
  const t0 = Date.now();
  const c = spawn(process.execPath, [rel], { cwd: proj, env: { ...env, CRITICO_LOG: log, NODE_OPTIONS: '--import=' + pathToFileURL(ESPIAO).href }, timeout: 60000 });
  let out = '', err = '';
  c.stdout.on('data', (b) => { out += b; });
  c.stderr.on('data', (b) => { err += b; });
  c.stdin.end(JSON.stringify({ hook_event_name: 'SessionStart', cwd: proj, source: 'startup' }));
  c.on('close', (status) => {
    const chamadas = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    res({ status, out, err, ms: Date.now() - t0, linhas: out.split(/\r?\n/).filter((l) => l.trim()), chamadas, spawns: chamadas.filter((x) => x.fn === 'spawn'), unrefs: chamadas.filter((x) => x.fn === 'unref').length });
  });
});
const semCanario = (r) => { for (const k of [CANARIO_2]) { assert.ok(!(r.out + r.err).includes(k), 'canário na saída'); assert.ok(!JSON.stringify(r.chamadas).includes(k), 'canário nos args'); } };

test('C5 os dois ficheiros vêm no projeto gerado', () => {
  assert.ok(existsSync(join(proj, START)), START);
  assert.ok(existsSync(join(proj, HOOK)), HOOK);
});

test('C5 script, estado on: não lança nada, «already on», exit 0', async () => {
  const srv = await servidorFalso(); levantados.push(srv);
  const c = await cenario({ url: srv.url });
  const r = await corre(START, c.env);
  assert.equal(r.status, 0, r.out + r.err);
  assert.ok(r.linhas.includes(L.jaOn(srv.url)), r.out + r.err);
  assert.equal(r.spawns.length, 0);
  semCanario(r);
});

test('C5 script, estado conflict: não lança nada, linha CONFLICT, exit 2', async () => {
  const srv = await servidorFalso(); levantados.push(srv);
  const c = await cenario({ url: srv.url, statusDir: 'C:/outro/data-dir' });
  const r = await corre(START, c.env);
  assert.equal(r.status, 2, r.out + r.err);
  assert.ok(r.linhas.includes(L.conflito(srv.url)), r.out + r.err);
  assert.equal(r.spawns.length, 0);
});

test('C5 script, sem binário: a linha do binário, exit 1, nada lançado', async () => {
  const url = 'http://127.0.0.1:' + (await portaLivre());
  const c = await cenario({ url, semBin: true });
  const r = await corre(START, c.env);
  assert.equal(r.status, 1, r.out + r.err);
  assert.ok(r.linhas.includes(L.semBin), r.out + r.err);
  assert.equal(r.spawns.length, 0);
});

test('C5 script, estado off: spawn(<bin>, [--data-dir, D, serve, --transport, http, --bind, 127.0.0.1:<port>, --workspace, W, --project, P], {detached, stdio ignore, windowsHide}) + unref; «started», exit 0; a 2.ª corrida não lança (um só spawn)', async () => {
  modo.sobe = true;
  const port = await portaLivre(), url = 'http://127.0.0.1:' + port;
  const c = await cenario({ url });
  const r1 = await corre(START, c.env);
  assert.equal(r1.status, 0, r1.out + r1.err);
  assert.ok(r1.linhas.includes(L.comecou(url)), r1.out + r1.err);
  assert.equal(r1.spawns.length, 1, JSON.stringify(r1.spawns));
  const s = r1.spawns[0];
  assert.ok(s.fake, 'o spawn não foi do binário: ' + s.cmd);
  assert.deepEqual(s.args.map(fwd), ['--data-dir', c.dataDir, 'serve', '--transport', 'http', '--bind', '127.0.0.1:' + port, '--workspace', W, '--project', P]);
  assert.deepEqual(s.opts, { detached: true, stdio: 'ignore', windowsHide: true });
  assert.ok(r1.unrefs >= 1, 'sem unref()');
  semCanario(r1);
  const r2 = await corre(START, c.env);
  assert.equal(r2.status, 0, r2.out + r2.err);
  assert.ok(r2.linhas.includes(L.jaOn(url)), r2.out + r2.err);
  assert.equal(r1.spawns.length + r2.spawns.length, 1, 'duas corridas, mais de um spawn');
});

test('C5 script, estado off e o servidor nunca responde: exit 1, sem «started», e desiste em ≤ 15 s (+ margem)', async () => {
  modo.sobe = false;
  try {
    const url = 'http://127.0.0.1:' + (await portaLivre());
    const c = await cenario({ url });
    const r = await corre(START, c.env);
    assert.equal(r.status, 1, r.out + r.err);
    assert.ok(!r.linhas.some((l) => l.startsWith('ai-memory: started')), r.out);
    assert.equal(r.spawns.length, 1);
    assert.ok(r.ms <= 25000, 'demorou ' + r.ms + ' ms');
  } finally { modo.sobe = true; }
});

const ESTADOS = [
  ['on', async () => { const s = await servidorFalso(); levantados.push(s); return { url: s.url, linha: L.hookOn(s.url) }; }],
  ['off', async () => { const url = 'http://127.0.0.1:' + (await portaLivre()); return { url, linha: L.hookOff(url) }; }],
  ['conflict', async () => { const s = await servidorFalso(); levantados.push(s); return { url: s.url, linha: L.conflito(s.url), statusDir: 'C:/outro/data-dir' }; }],
  ['sem binário', async () => { const url = 'http://127.0.0.1:' + (await portaLivre()); return { url, linha: L.semBin, semBin: true }; }],
];
for (const [nome, prep] of ESTADOS) {
  test(`C5 hook do SessionStart, ${nome}: uma só linha literal, exit 0, ≤ 5 s, nada lançado`, async () => {
    const e = await prep();
    const c = await cenario(e);
    const r = await corre(HOOK, c.env);
    assert.equal(r.status, 0, r.out + r.err);
    assert.deepEqual(r.linhas, [e.linha]);
    assert.ok(r.ms <= 5000, 'demorou ' + r.ms + ' ms');
    assert.equal(r.spawns.length, 0, 'o hook lançou: ' + JSON.stringify(r.spawns));
    semCanario(r);
  });
}