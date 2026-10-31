// Ronda −1 do F-20b (#71), C2 e C3, com as respostas do orquestrador (comentários 6546794885 e 6548062958):
// - os hooks e `enabledMcpjsonServers: ["ai-memory"]` vão para o `.claude/settings.local.json`;
// - o servidor MCP vai para o `.mcp.json` da raiz;
// - o `.gitignore` garante os dois e o `.ai-memory.local.toml`; nada vai para o `.claude/settings.json` versionado nem para os globais.
// Oráculos: fixtures com hooks e servidores alheios e os três hooks de proteção do F-13, idempotência, JSON inválido, instantâneo do HOME e do
// CLAUDE_CONFIG_DIR falsos, e higiene (nenhum ficheiro versionado leva caminhos nem portas desta máquina).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  PARES, HOOK_FORGE, LOCAL, MCP, IGNORADOS, ignorado, caixa, dataDirWin, instantaneo, sysFalso, aplica, projeto, le, leJson, escreve, forge, fwd, barras,
  apaga, ficheiros,
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
const igualSemCaixa = (a, b) => JSON.stringify(barras(a)).toLowerCase() === JSON.stringify(barras(b)).toLowerCase();
const ALHEIO = {
  permissions: { allow: ['Bash(ls:*)'] },
  env: { MINHA_VAR: '1' },
  enabledMcpjsonServers: ['outro'],
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo alheio-pre' }] }],
    SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo alheio-ss' }] }],
    Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'echo alheio-notif' }] }],
  },
};
const MCP_ALHEIO = { mcpServers: { outro: { type: 'stdio', command: 'outro-servidor', args: ['--x'] } } };

test('C2 o settings.local.json ganha os 9 grupos do ai-memory (matcher "", um hook com bin, --data-dir, --event, --agent claude-code, --server-url), o grupo SessionStart do forge e enabledMcpjsonServers com "ai-memory"', async () => {
  const c = await cenario();
  const r = await aplica(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(c.proj, LOCAL)), 'sem ' + LOCAL);
  const s = leJson(c.proj, LOCAL), fg = forge(c.proj);
  assert.ok(fg, 'sem [forge] no .ai-memory.local.toml');
  const maus = [];
  for (const [ev, nome] of PARES) {
    const alvo = { matcher: '', hooks: [esperadoHook(c.sb.bin, dataDirWin(c.sb), fg.serverUrl, nome)] };
    const iguais = (s.hooks?.[ev] ?? []).filter((g) => igualSemCaixa(g, alvo));
    if (iguais.length !== 1) maus.push(`${ev}: ${iguais.length} grupos iguais a ${JSON.stringify(barras(alvo))}; tem ${JSON.stringify(s.hooks?.[ev] ?? null)}`);
  }
  const forgeSS = (s.hooks?.SessionStart ?? []).flatMap((g) => g.hooks ?? []).filter((h) => JSON.stringify(h) === JSON.stringify(HOOK_FORGE));
  if (forgeSS.length !== 1) maus.push('SessionStart do forge: ' + forgeSS.length + ' hooks iguais a ' + JSON.stringify(HOOK_FORGE));
  if ((s.enabledMcpjsonServers ?? []).filter((x) => x === 'ai-memory').length !== 1) maus.push('enabledMcpjsonServers: ' + JSON.stringify(s.enabledMcpjsonServers ?? null));
  if (s.mcpServers?.['ai-memory']) maus.push('o servidor MCP foi para o settings.local.json (o Claude Code não o lê daí)');
  assert.deepEqual(maus, []);
});

test('C2 junção: as chaves, os hooks e os enabledMcpjsonServers do utilizador ficam; o .claude/settings.json versionado (três hooks de proteção do F-13) fica byte a byte', async () => {
  const c = await cenario();
  escreve(c.proj, LOCAL, JSON.stringify(ALHEIO, null, 2) + '\n');
  const versionado = le(c.proj, '.claude/settings.json');
  assert.ok(Object.values(JSON.parse(versionado).hooks ?? {}).flat().length >= 2, 'fixture: o settings.json gerado não tem os hooks de proteção');
  const r = await aplica(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  assert.equal(le(c.proj, '.claude/settings.json'), versionado, 'o .claude/settings.json versionado mudou');
  const s = leJson(c.proj, LOCAL);
  assert.deepEqual(s.permissions, ALHEIO.permissions);
  assert.deepEqual(s.env, ALHEIO.env);
  assert.ok(s.enabledMcpjsonServers?.includes('outro') && s.enabledMcpjsonServers.includes('ai-memory'), JSON.stringify(s.enabledMcpjsonServers));
  for (const [ev, grupos] of Object.entries(ALHEIO.hooks)) for (const g of grupos) assert.ok((s.hooks?.[ev] ?? []).some((x) => JSON.stringify(x) === JSON.stringify(g)), `perdeu o hook alheio de ${ev}`);
});

test('C2/C3 idempotência: um segundo --apply dá os mesmos bytes no settings.local.json e no .mcp.json, sem grupos nem entradas duplicadas', async () => {
  const c = await cenario();
  escreve(c.proj, LOCAL, JSON.stringify(ALHEIO, null, 2) + '\n');
  escreve(c.proj, MCP, JSON.stringify(MCP_ALHEIO, null, 2) + '\n');
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const um = le(c.proj, LOCAL), m1 = le(c.proj, MCP);
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.equal(le(c.proj, LOCAL), um);
  assert.equal(le(c.proj, MCP), m1);
  const s = JSON.parse(um);
  for (const ev of Object.keys(s.hooks ?? {})) {
    const vistos = s.hooks[ev].map((g) => JSON.stringify(g));
    assert.equal(new Set(vistos).size, vistos.length, 'grupos duplicados em ' + ev);
  }
  assert.equal(new Set(s.enabledMcpjsonServers).size, s.enabledMcpjsonServers.length, 'enabledMcpjsonServers duplicados');
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

test('C3 o .mcp.json da raiz ganha mcpServers["ai-memory"] = { type: "stdio", command: <bin>, args: [mcp-bridge, --server-url, <url>/mcp, --data-dir, <dataDir>] }; o outro servidor fica', async () => {
  const c = await cenario();
  escreve(c.proj, MCP, JSON.stringify(MCP_ALHEIO, null, 2) + '\n');
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const m = leJson(c.proj, MCP), fg = forge(c.proj);
  assert.ok(igualSemCaixa(m.mcpServers?.['ai-memory'] ?? null, esperadoMcp(c.sb.bin, dataDirWin(c.sb), fg.serverUrl)), JSON.stringify(m.mcpServers?.['ai-memory'] ?? null));
  assert.deepEqual(m.mcpServers.outro, MCP_ALHEIO.mcpServers.outro);
});

test('C3 sem .mcp.json, o --apply cria-o com o ai-memory', async () => {
  const c = await cenario();
  apaga(join(c.proj, MCP));
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.ok(leJson(c.proj, MCP).mcpServers?.['ai-memory'], 'sem mcpServers["ai-memory"] no .mcp.json');
});

test('C3 um .mcp.json que não é JSON válido nunca é sobrescrito (os bytes ficam)', async () => {
  const c = await cenario();
  const mau = '{ "mcpServers": { "equipa": ';
  escreve(c.proj, MCP, mau);
  await aplica(c.proj, c.sys);
  assert.equal(le(c.proj, MCP), mau);
});

test('C2/C3 o .gitignore do projeto garante .claude/settings.local.json, .mcp.json e .ai-memory.local.toml (acrescentados se faltarem, uma só vez cada, as outras linhas ficam; criado se não existir)', async () => {
  const a = await cenario();
  escreve(a.proj, '.gitignore', 'node_modules/\n# meu\ndist/\n');
  for (let i = 0; i < 2; i++) assert.equal((await aplica(a.proj, a.sys)).code, 0);
  const t = le(a.proj, '.gitignore'), g = t.split(/\r?\n/);
  for (const rel of IGNORADOS) assert.equal(g.filter((l) => l.trim() === rel || l.trim() === '/' + rel).length, 1, rel + ':\n' + t);
  for (const l of ['node_modules/', '# meu', 'dist/']) assert.ok(g.includes(l), 'perdeu ' + l);
  const b = await cenario();
  apaga(join(b.proj, '.gitignore'));
  assert.equal((await aplica(b.proj, b.sys)).code, 0);
  for (const rel of IGNORADOS) assert.ok(ignorado(le(b.proj, '.gitignore'), rel), 'falta ' + rel);
});

test('C2/C3 higiene: depois do --apply, nenhum ficheiro versionado (tudo menos settings.local.json, .mcp.json e .ai-memory.local.toml) leva o bin, o data-dir, a caixa ou a porta desta máquina', async () => {
  const c = await cenario();
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const port = forge(c.proj)?.port;
  assert.ok(port, 'sem porta na [forge]');
  const agulhas = [c.sb.bin, dataDirWin(c.sb), c.sb.dir].flatMap((p) => [fwd(p).toLowerCase(), fwd(p).replace(/\//g, '\\').toLowerCase(), fwd(p).replace(/\//g, '\\\\').toLowerCase()]);
  agulhas.push('127.0.0.1:' + port, 'localhost:' + port);
  const maus = [];
  for (const rel of ficheiros(c.proj)) {
    if (IGNORADOS.includes(rel)) continue;
    const t = readFileSync(join(c.proj, rel), 'utf8').toLowerCase();
    for (const a of agulhas) if (t.includes(a)) { maus.push(rel + ': ' + a); break; }
  }
  assert.deepEqual(maus, []);
});