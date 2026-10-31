// Ronda −1 do F-20b (#71), C2 e C3: os hooks e o MCP do ai-memory no `.claude/settings.local.json` do projeto (comentário 6546794885 do orquestrador:
// nunca no `.claude/settings.json` versionado nem nos globais; o `.gitignore` garante o settings.local.json).
// Oráculos: fixtures com hooks e servidores alheios e os três hooks de proteção do F-13, idempotência, JSON inválido, instantâneo do HOME e do
// CLAUDE_CONFIG_DIR falsos, e higiene (nenhum ficheiro versionado leva caminhos desta máquina).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  PARES, HOOK_FORGE, LOCAL, caixa, dataDirWin, instantaneo, sysFalso, aplica, projeto, le, leJson, escreve, forge, fwd, barras, apaga, ficheiros,
} from './helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
const cenario = async () => {
  const sb = caixa(), proj = await projeto(), f = sysFalso(sb);
  limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
  return { sb, proj, ...f };
};
const esperadoHook = (bin, dd, url, ev) => ({ type: 'command', command: bin, args: ['--data-dir', dd, 'hook', '--event', ev, '--agent', 'claude-code', '--server-url', url] });
const esperadoMcp = (bin, dd, url) => ({ type: 'stdio', command: bin, args: ['mcp-bridge', '--server-url', url + '/mcp', '--data-dir', dd] });
const ALHEIO = {
  permissions: { allow: ['Bash(ls:*)'] },
  env: { MINHA_VAR: '1' },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo alheio-pre' }] }],
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo alheio-ss' }] }],
    Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'echo alheio-notif' }] }],
  },
  mcpServers: { outro: { type: 'stdio', command: 'outro-servidor', args: ['--x'] } },
};

test('C2 o settings.local.json ganha os 9 grupos do ai-memory (matcher "", um hook com bin, --data-dir, --event, --agent claude-code, --server-url) e o grupo SessionStart do forge', async () => {
  const c = await cenario();
  const r = await aplica(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(c.proj, LOCAL)), 'sem ' + LOCAL);
  const s = leJson(c.proj, LOCAL), fg = forge(c.proj);
  const maus = [];
  for (const [ev, nome] of PARES) {
    const alvo = barras({ matcher: '', hooks: [esperadoHook(c.sb.bin, dataDirWin(c.sb), fg.serverUrl, nome)] });
    const iguais = (s.hooks?.[ev] ?? []).filter((g) => JSON.stringify(barras(g)).toLowerCase() === JSON.stringify(alvo).toLowerCase());
    if (iguais.length !== 1) maus.push(`${ev}: ${iguais.length} grupos iguais a ${JSON.stringify(alvo)}; tem ${JSON.stringify(s.hooks?.[ev] ?? null)}`);
  }
  const forgeSS = (s.hooks?.SessionStart ?? []).flatMap((g) => g.hooks ?? []).filter((h) => JSON.stringify(h) === JSON.stringify(HOOK_FORGE));
  if (forgeSS.length !== 1) maus.push('SessionStart do forge: ' + forgeSS.length + ' hooks iguais a ' + JSON.stringify(HOOK_FORGE));
  assert.deepEqual(maus, []);
});

test('C2 junção: as chaves e os hooks do utilizador ficam; o .claude/settings.json versionado (três hooks de proteção do F-13) fica byte a byte', async () => {
  const c = await cenario();
  escreve(c.proj, LOCAL, JSON.stringify(ALHEIO, null, 2) + '\n');
  const versionado = le(c.proj, '.claude/settings.json');
  assert.equal((JSON.parse(versionado).hooks ? Object.values(JSON.parse(versionado).hooks).flat().length : 0) >= 2, true, 'fixture: o settings.json gerado não tem os hooks de proteção');
  const r = await aplica(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  assert.equal(le(c.proj, '.claude/settings.json'), versionado, 'o .claude/settings.json versionado mudou');
  const s = leJson(c.proj, LOCAL);
  assert.deepEqual(s.permissions, ALHEIO.permissions);
  assert.deepEqual(s.env, ALHEIO.env);
  for (const [ev, grupos] of Object.entries(ALHEIO.hooks)) for (const g of grupos) assert.ok((s.hooks?.[ev] ?? []).some((x) => JSON.stringify(x) === JSON.stringify(g)), `perdeu o hook alheio de ${ev}`);
  assert.deepEqual(s.mcpServers?.outro, ALHEIO.mcpServers.outro);
});

test('C2/C3 idempotência: um segundo --apply dá os mesmos bytes no settings.local.json, sem grupos duplicados', async () => {
  const c = await cenario();
  escreve(c.proj, LOCAL, JSON.stringify(ALHEIO, null, 2) + '\n');
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const um = le(c.proj, LOCAL);
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.equal(le(c.proj, LOCAL), um);
  const s = JSON.parse(um);
  for (const ev of Object.keys(s.hooks ?? {})) {
    const vistos = s.hooks[ev].map((g) => JSON.stringify(g));
    assert.equal(new Set(vistos).size, vistos.length, 'grupos duplicados em ' + ev);
  }
});

test('C2 um settings.local.json que não é JSON válido: exit 1 e nenhum ficheiro escrito (projeto, data-dir, HOME, CLAUDE_CONFIG_DIR), nem init nem spawn', async () => {
  const c = await cenario();
  escreve(c.proj, LOCAL, '{ "hooks": { , }');
  const raizes = [c.proj, c.sb.home, c.sb.local, c.sb.xdg, c.sb.cfg];
  const antes = instantaneo(raizes);
  const r = await aplica(c.proj, c.sys);
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(instantaneo(raizes), antes);
  assert.ok(!c.regs.run.some((x) => x.args.includes('init')), 'correu o init');
  assert.equal(c.regs.spawn.length, 0, 'lançou o servidor');
});

test('C2 os settings globais nunca se tocam: o HOME (~/.claude.json, ~/.claude/settings.json) e o CLAUDE_CONFIG_DIR falsos ficam iguais', async () => {
  const c = await cenario();
  const antes = instantaneo([c.sb.home, c.sb.cfg]);
  for (let i = 0; i < 2; i++) assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.deepEqual(instantaneo([c.sb.home, c.sb.cfg]), antes);
});

test('C3 o settings.local.json ganha mcpServers["ai-memory"] = { type: "stdio", command: <bin>, args: [mcp-bridge, --server-url, <url>/mcp, --data-dir, <dataDir>] }', async () => {
  const c = await cenario();
  escreve(c.proj, LOCAL, JSON.stringify({ mcpServers: ALHEIO.mcpServers }, null, 2) + '\n');
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const s = leJson(c.proj, LOCAL), fg = forge(c.proj);
  assert.equal(JSON.stringify(barras(s.mcpServers?.['ai-memory'] ?? null)).toLowerCase(), JSON.stringify(barras(esperadoMcp(c.sb.bin, dataDirWin(c.sb), fg.serverUrl))).toLowerCase());
  assert.deepEqual(s.mcpServers.outro, ALHEIO.mcpServers.outro);
});

test('C3 o .mcp.json versionado nunca se toca: com outro servidor fica byte a byte; sem ele, continua a não existir', async () => {
  const a = await cenario();
  const mcp = JSON.stringify({ mcpServers: { equipa: { type: 'http', url: 'https://example.invalid/mcp' } } }, null, 2) + '\n';
  escreve(a.proj, '.mcp.json', mcp);
  for (let i = 0; i < 2; i++) assert.equal((await aplica(a.proj, a.sys)).code, 0);
  assert.equal(le(a.proj, '.mcp.json'), mcp);
  const b = await cenario();
  assert.equal((await aplica(b.proj, b.sys)).code, 0);
  assert.equal(existsSync(join(b.proj, '.mcp.json')), false, 'criou um .mcp.json versionado');
});

test('C2 o .gitignore do projeto garante .claude/settings.local.json (acrescentado se faltar, uma só vez, as outras linhas ficam; criado se não existir)', async () => {
  const a = await cenario();
  escreve(a.proj, '.gitignore', 'node_modules/\n# meu\ndist/\n');
  for (let i = 0; i < 2; i++) assert.equal((await aplica(a.proj, a.sys)).code, 0);
  const g = le(a.proj, '.gitignore').split(/\r?\n/);
  assert.equal(g.filter((l) => l.trim() === LOCAL || l.trim() === '/' + LOCAL).length, 1, g.join('\n'));
  for (const l of ['node_modules/', '# meu', 'dist/']) assert.ok(g.includes(l), 'perdeu ' + l);
  const b = await cenario();
  apaga(join(b.proj, '.gitignore'));
  assert.equal((await aplica(b.proj, b.sys)).code, 0);
  assert.ok(le(b.proj, '.gitignore').split(/\r?\n/).some((l) => l.trim() === LOCAL || l.trim() === '/' + LOCAL));
});

test('C2/C3 higiene: depois do --apply, nenhum ficheiro versionado (tudo menos o settings.local.json e o .ai-memory.toml, ver PERGUNTA) leva o bin, o data-dir ou a caixa desta máquina', async () => {
  const c = await cenario();
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const agulhas = [c.sb.bin, dataDirWin(c.sb), c.sb.dir].flatMap((p) => [fwd(p).toLowerCase(), fwd(p).replace(/\//g, '\\').toLowerCase(), fwd(p).replace(/\//g, '\\\\').toLowerCase()]);
  const maus = [];
  for (const rel of ficheiros(c.proj)) {
    if (rel === LOCAL || rel === '.ai-memory.toml') continue;
    const t = readFileSync(join(c.proj, rel), 'utf8').toLowerCase();
    for (const a of agulhas) if (t.includes(a)) { maus.push(rel + ': ' + a); break; }
  }
  assert.deepEqual(maus, []);
});