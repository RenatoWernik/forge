// Regressão das duas classes da R1 do F-20b (#71, comentários 6549313493 e 6549319646). Escrito pelo dev; usa os helpers do f-20b-r0 sem os alterar.
// Classe 1: uma [forge] parcial ou incoerente. Depois do --apply, a porta e o data-dir da [forge], dos hooks, do MCP e do bind são os mesmos, o estado é «on»
//   (o servidor confirma o data-dir) e o 2.º --apply dá os mesmos bytes.
// Classe 2: o check.cjs --env e o memoria.mjs decidem o mesmo sobre o .gitignore (x, /x, **/x, ! desfaz).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  LOCAL, MCP, TOML_LOCAL, IGNORADOS, caixa, dataDirWin, instantaneo, sysFalso, aplica, projeto, le, leJson, escreve, forge, fwd, apaga, portaLivre, carregaModulo,
} from '../f-20b-r0/helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
const cenario = async () => {
  const sb = caixa(), proj = await projeto(), f = sysFalso(sb);
  limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
  return { sb, proj, ...f };
};
// tudo o que o --apply escreveu tem de falar da mesma porta e do mesmo data-dir
const coerente = (c) => {
  const fg = forge(c.proj), s = leJson(c.proj, LOCAL), m = leJson(c.proj, MCP);
  const cfg = readFileSync(join(fg.dataDir, 'config.toml'), 'utf8').split(/\r?\n/).filter((l) => /^\s*bind\s*=/.test(l));
  assert.ok(fg?.serverUrl && fg.dataDir, 'a [forge] ficou incompleta: ' + JSON.stringify(fg));
  assert.deepEqual(cfg, [`bind = "127.0.0.1:${fg.port}"`]);
  const urls = new Set(), dirs = new Set();
  for (const g of Object.values(s.hooks).flat()) for (const h of g.hooks) if (h.args?.includes('hook') && h.args.includes('--agent')) { urls.add(h.args[h.args.indexOf('--server-url') + 1]); dirs.add(fwd(h.args[h.args.indexOf('--data-dir') + 1]).toLowerCase()); }
  const a = m.mcpServers['ai-memory'].args;
  urls.add(a[a.indexOf('--server-url') + 1].replace(/\/mcp$/, '')); dirs.add(fwd(a[a.indexOf('--data-dir') + 1]).toLowerCase());
  assert.deepEqual([...urls], [fg.serverUrl], 'portas diferentes entre a [forge], os hooks e o MCP');
  assert.deepEqual([...dirs], [fwd(fg.dataDir).toLowerCase()], 'data-dirs diferentes entre a [forge], os hooks e o MCP');
};

const CASOS = [
  ['só server_url', async () => `[forge]\nserver_url = "http://127.0.0.1:${await portaLivre()}"\n`],
  ['só data_dir (não-padrão)', async (c) => `[forge]\ndata_dir = "${fwd(join(c.sb.dir, 'outro-dd'))}"\n`],
  ['server_url não-local no meio de outras linhas do utilizador', async () => `# nota\n[forge]\nautostart = true\nserver_url = "http://127.0.0.1:${await portaLivre()}" # minha\n\n[outra]\nx = "1"\n`],
  ['duas tabelas [forge] com valores diferentes (a última ganha no readConfig)', async (c) => `[forge]\nserver_url = "http://127.0.0.1:${await portaLivre()}"\ndata_dir = "${dataDirWin(c.sb)}"\n[forge]\nserver_url = "http://127.0.0.1:${await portaLivre()}"\n`],
  ['server_url repetido na mesma tabela', async () => `[forge]\nserver_url = "http://127.0.0.1:${await portaLivre()}"\nserver_url = "http://127.0.0.1:${await portaLivre()}"\n`],
  ['[forge] parcial no versionado e outra parte no local', async () => '[forge]\ndata_dir = "X"\n'],
];
for (const [nome, texto] of CASOS) {
  test(`classe 1: ${nome}: depois do --apply tudo coincide, o estado é on e o 2.º --apply é idempotente`, async () => {
    const c = await cenario();
    if (nome.startsWith('[forge] parcial no versionado')) {
      const port = await portaLivre();
      escreve(c.proj, '.ai-memory.toml', le(c.proj, '.ai-memory.toml').replace(/\s*$/, '\n') + `\n[forge]\nserver_url = "http://127.0.0.1:${port}"\n`);
      escreve(c.proj, TOML_LOCAL, `[forge]\ndata_dir = "${fwd(join(c.sb.dir, 'dd-local'))}"\n`);
    } else escreve(c.proj, TOML_LOCAL, await texto(c));
    const r1 = await aplica(c.proj, c.sys);
    assert.equal(r1.code, 0, r1.out);
    assert.match(r1.out, /ai-memory: (started|already on) at http:\/\/127\.0\.0\.1:\d+/);
    coerente(c);
    const antes = instantaneo([c.proj, c.sb.local, c.sb.dir]);
    const r2 = await aplica(c.proj, c.sys);
    assert.equal(r2.code, 0, r2.out);
    assert.match(r2.out, /already on/);
    assert.deepEqual(instantaneo([c.proj, c.sb.local, c.sb.dir]), antes, 'o 2.º --apply mudou ficheiros');
    assert.equal(c.regs.spawn.length, 1, 'mais de um servidor lançado');
  });
}

test('classe 1: um server_url que não é 127.0.0.1:<porta> falha fechado, sem escrever nada', async () => {
  const c = await cenario();
  escreve(c.proj, TOML_LOCAL, '[forge]\nserver_url = "http://example.com:80"\n');
  const antes = instantaneo([c.proj, c.sb.local]);
  const r = await aplica(c.proj, c.sys);
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(instantaneo([c.proj, c.sb.local]), antes);
});

// classe 2
const VARIANTES = [['x', (r) => r], ['/x', (r) => '/' + r], ['**/x', (r) => '**/' + r], ['x com espaços e CRLF', (r) => ' ' + r + '  \r']];
for (const [nome, f] of VARIANTES) {
  test(`classe 2: .gitignore com ${nome}: isIgnored, o --apply não acrescenta nada e o check.cjs --env não dá falso alarme`, async () => {
    const mod = carregaModulo();
    for (const rel of IGNORADOS) assert.ok(mod.isIgnored(IGNORADOS.map(f).join('\n') + '\n', rel), rel);
    const c = await cenario();
    escreve(c.proj, '.gitignore', 'node_modules/\n' + IGNORADOS.map(f).join('\n') + '\n');
    const gi = le(c.proj, '.gitignore');
    assert.equal((await aplica(c.proj, c.sys)).code, 0);
    assert.equal(le(c.proj, '.gitignore'), gi, 'o --apply mexeu num .gitignore que já ignora');
    const env = { ...process.env, HOME: c.sb.home, USERPROFILE: c.sb.home, AI_MEMORY_BIN: '' };
    const out = spawnSync(process.execPath, ['.claude/check.cjs', '--env'], { cwd: c.proj, env, encoding: 'utf8' }).stdout.split('\n');
    const linha = out.find((l) => l.includes('the 9 capture hooks'));
    assert.ok(linha?.startsWith('ok'), String(linha));
  });
}

test('classe 2: um .gitignore que desfaz com ! não conta como ignorado, no isIgnored e no --apply (que acrescenta a linha depois)', async () => {
  const mod = carregaModulo();
  assert.equal(mod.isIgnored('.mcp.json\n!.mcp.json\n', '.mcp.json'), false);
  assert.equal(mod.isIgnored('!.mcp.json\n/.mcp.json\n', '.mcp.json'), true);
  assert.equal(mod.isIgnored('# .mcp.json\n', '.mcp.json'), false);
  const c = await cenario();
  escreve(c.proj, '.gitignore', '.mcp.json\n!.mcp.json\n');
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.ok(mod.isIgnored(le(c.proj, '.gitignore'), '.mcp.json'));
});

test('classe 2: o check.cjs dá FAIL quando os hooks apontam para outra porta que a [forge]', async () => {
  const c = await cenario();
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const s = leJson(c.proj, LOCAL), fg = forge(c.proj);
  for (const g of Object.values(s.hooks).flat()) for (const h of g.hooks) if (h.args?.includes('--server-url')) h.args[h.args.indexOf('--server-url') + 1] = 'http://127.0.0.1:' + (fg.port + 1);
  escreve(c.proj, LOCAL, JSON.stringify(s, null, 2));
  const env = { ...process.env, HOME: c.sb.home, USERPROFILE: c.sb.home, AI_MEMORY_BIN: '' };
  const linha = spawnSync(process.execPath, ['.claude/check.cjs', '--env'], { cwd: c.proj, env, encoding: 'utf8' }).stdout.split('\n').find((l) => l.includes('the 9 capture hooks'));
  assert.ok(linha?.startsWith('FAIL'), String(linha));
});
