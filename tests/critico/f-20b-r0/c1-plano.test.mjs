// Ronda −1 do F-20b (#71), C1: o plano e o data-dir. Oráculos: instantâneo (sha256) antes e depois, tabela de plataformas, freePort injetado,
// registo do sys.run (init uma só vez e nunca --force), data-dir existente com os mesmos sha256.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  ROOT, MEMORIA, PROIBIDAS, NOME, VERSAO, CONFIG_INICIAL, caixa, dataDirWin, instantaneo, sysFalso, plano, aplica, projeto, le, escreve, forge, fwd,
  mesmoCaminho, apaga, servidorFalso, portaLivre,
} from './helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
const cenario = async (o = {}) => {
  const sb = caixa(), proj = await projeto(), f = sysFalso(sb, o);
  limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
  return { sb, proj, ...f, raizes: [proj, sb.home, sb.local, sb.xdg, sb.cfg] };
};

test('C1 --plan: imprime { bin, version, dataDir, port, serverUrl, outside, inside } e não escreve nada (projeto, HOME, LOCALAPPDATA, XDG, CLAUDE_CONFIG_DIR)', async () => {
  const c = await cenario();
  const antes = instantaneo(c.raizes);
  const r = await plano(c.proj, c.sys);
  assert.deepEqual(instantaneo(c.raizes), antes, 'o --plan escreveu');
  assert.equal(r.code, 0, r.out);
  assert.ok(r.json, 'o --plan não imprimiu JSON: ' + r.out);
  for (const k of ['bin', 'version', 'dataDir', 'port', 'serverUrl', 'outside', 'inside']) assert.ok(k in r.json, 'falta ' + k + ': ' + r.out);
  assert.ok(mesmoCaminho(r.json.bin, c.sb.bin), 'bin: ' + r.json.bin);
  assert.equal(r.json.version, VERSAO);
  assert.ok(mesmoCaminho(r.json.dataDir, dataDirWin(c.sb)), 'dataDir: ' + r.json.dataDir);
  assert.ok(Number.isInteger(r.json.port) && !PROIBIDAS.includes(r.json.port), 'port: ' + r.json.port);
  assert.equal(r.json.serverUrl, 'http://127.0.0.1:' + r.json.port);
  assert.ok(Array.isArray(r.json.outside) && Array.isArray(r.json.inside), 'outside e inside são listas');
  assert.ok(fwd(JSON.stringify(r.json.outside)).replace(/\/\//g, '/').toLowerCase().includes(fwd(dataDirWin(c.sb)).toLowerCase()), 'o outside não mostra o data-dir: ' + JSON.stringify(r.json.outside));
  assert.equal(c.regs.spawn.length, 0, 'o --plan lançou processos');
  assert.ok(!c.regs.run.some((x) => x.args.includes('init')), 'o --plan correu o init');
});

for (const modo of ['--plan', '--apply']) {
  test(`C1 ${modo} sem binário: exit 1, «ai-memory not found», nada escrito`, async () => {
    const c = await cenario({ env: { AI_MEMORY_BIN: undefined }, bins: [] });
    const antes = instantaneo(c.raizes);
    const r = modo === '--plan' ? await plano(c.proj, c.sys) : await aplica(c.proj, c.sys);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /ai-memory not found/);
    assert.deepEqual(instantaneo(c.raizes), antes, 'escreveu sem binário');
    assert.equal(c.regs.spawn.length, 0);
  });
}

test('C1 o bin resolve-se pela ordem do F-20a: sem AI_MEMORY_BIN nem PATH, o %LOCALAPPDATA%/ai-memory/ai-memory.exe', async () => {
  const sb0 = caixa();
  const alvo = fwd(join(sb0.local, 'ai-memory', 'ai-memory.exe'));
  mkdirSync(join(sb0.local, 'ai-memory'), { recursive: true }); writeFileSync(alvo, 'fake\n');
  const proj = await projeto(), f = sysFalso(sb0, { env: { AI_MEMORY_BIN: undefined }, bins: [alvo] });
  limpar.push(f.fecha, () => apaga(sb0.dir), () => apaga(proj));
  const r = await plano(proj, f.sys);
  assert.equal(r.code, 0, r.out);
  assert.ok(mesmoCaminho(r.json.bin, alvo), 'bin: ' + r.json?.bin);
});

// a tabela de plataformas do dataDir
const TABELA = [
  ['win32', {}, (sb) => join(sb.local, 'forge', 'ai-memory', NOME)],
  ['darwin', {}, (sb) => join(sb.home, 'Library', 'Application Support', 'forge', 'ai-memory', NOME)],
  ['linux', {}, (sb) => join(sb.xdg, 'forge', 'ai-memory', NOME)],
  ['linux', { XDG_DATA_HOME: undefined }, (sb) => join(sb.home, '.local', 'share', 'forge', 'ai-memory', NOME)],
];
for (const [platform, env, esperado] of TABELA) {
  test(`C1 dataDir em ${platform}${'XDG_DATA_HOME' in env ? ' sem XDG_DATA_HOME' : ''}`, async () => {
    const c = await cenario({ platform, env });
    const antes = instantaneo(c.raizes);
    const r = await plano(c.proj, c.sys);
    assert.equal(r.code, 0, r.out);
    assert.equal(fwd(r.json.dataDir).replace(/\/$/, ''), fwd(esperado(c.sb)));
    assert.deepEqual(instantaneo(c.raizes), antes);
  });
}

test('C1 porta: com freePort a devolver 49374 e depois 4790, o plano escolhe a terceira', async () => {
  const livre = await portaLivre();
  const c = await cenario({ portas: [49374, 4790, livre] });
  const r = await plano(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.port, livre);
});

test('C1 porta: 49375 também é recusada', async () => {
  const livre = await portaLivre();
  const c = await cenario({ portas: [49375, livre] });
  const r = await plano(c.proj, c.sys);
  assert.equal(r.json?.port, livre, r.out);
});

test('C1 porta: com várias portas ocupadas, a escolhida estava livre no momento e fora das proibidas', async () => {
  const ocupadas = [];
  for (let i = 0; i < 5; i++) ocupadas.push(await servidorFalso());
  limpar.push(async () => { for (const s of ocupadas) await s.fecha(); });
  const c = await cenario();
  const r = await plano(c.proj, c.sys);
  assert.ok(!PROIBIDAS.includes(r.json.port) && !ocupadas.some((s) => s.port === r.json.port), 'porta: ' + r.json.port);
  const s = await servidorFalso(r.json.port); await s.fecha(); // estava livre: dá para a ocupar
});

test('C1 com a [forge] já existente, o plano reutiliza a porta e o data-dir dela', async () => {
  const c = await cenario();
  const port = await portaLivre(), dd = fwd(join(c.sb.dir, 'outro-data-dir'));
  escreve(c.proj, '.ai-memory.toml', le(c.proj, '.ai-memory.toml').replace(/\s*$/, '\n') + `\n[forge]\nserver_url = "http://127.0.0.1:${port}"\ndata_dir = "${dd}"\n`);
  const r = await plano(c.proj, c.sys);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.port, port);
  assert.equal(r.json.serverUrl, 'http://127.0.0.1:' + port);
  assert.ok(mesmoCaminho(r.json.dataDir, dd), r.json.dataDir);
});

test('C1 --apply: init uma só vez (e sem --force) em dois --apply; a [forge] com server_url e data_dir em /; uma só linha bind no config.toml', async () => {
  const c = await cenario();
  const r1 = await aplica(c.proj, c.sys);
  assert.equal(r1.code, 0, r1.out);
  const fg = forge(c.proj);
  assert.ok(fg, 'sem [forge] no .ai-memory.toml');
  assert.equal(fg.tabelas, 1);
  assert.ok(!PROIBIDAS.includes(fg.port) && fg.serverUrl === 'http://127.0.0.1:' + fg.port, 'server_url: ' + fg.serverUrl);
  assert.ok(fg.dataDir && !fg.dataDir.includes('\\'), 'data_dir sem barras /: ' + fg.dataDir);
  assert.ok(mesmoCaminho(fg.dataDir, dataDirWin(c.sb)), fg.dataDir);
  const cfg = readFileSync(join(dataDirWin(c.sb), 'config.toml'), 'utf8');
  const binds = cfg.split(/\r?\n/).filter((l) => /^\s*bind\s*=/.test(l));
  assert.deepEqual(binds, [`bind = "127.0.0.1:${fg.port}"`]);
  const r2 = await aplica(c.proj, c.sys);
  assert.equal(r2.code, 0, r2.out);
  const inits = c.regs.run.filter((x) => x.args.includes('init'));
  assert.equal(inits.length, 1, 'init: ' + JSON.stringify(inits));
  assert.ok(mesmoCaminho(inits[0].args[inits[0].args.indexOf('--data-dir') + 1], dataDirWin(c.sb)), 'init com --data-dir <dataDir>: ' + JSON.stringify(inits[0]));
  assert.ok(!c.regs.run.some((x) => x.args.some((a) => /^--force$|^-f$/.test(a))), 'algum run com --force');
});

test('C1 segundo --apply: mesma porta e mesmo data-dir; .ai-memory.toml, config.toml, settings.local.json e .gitignore byte a byte iguais', async () => {
  const c = await cenario();
  assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const fg1 = forge(c.proj);
  const antes = instantaneo([c.proj, c.sb.local]);
  const r2 = await aplica(c.proj, c.sys);
  assert.equal(r2.code, 0, r2.out);
  const fg2 = forge(c.proj);
  assert.equal(fg2.port, fg1.port); assert.equal(fg2.dataDir, fg1.dataDir);
  assert.deepEqual(instantaneo([c.proj, c.sb.local]), antes, 'o segundo --apply mudou ficheiros');
});

test('C1 a [forge] não se duplica (mesmo se já estiver antes da [capture]) e as linhas workspace, project, [capture] e as do utilizador ficam byte a byte', async () => {
  const c = await cenario();
  const port = await portaLivre();
  const orig = le(c.proj, '.ai-memory.toml').replace('[capture]', `# nota do utilizador\n[forge]\nserver_url = "http://127.0.0.1:${port}"\ndata_dir = "${dataDirWin(c.sb)}"\n\n[capture]`);
  escreve(c.proj, '.ai-memory.toml', orig);
  for (let i = 0; i < 2; i++) assert.equal((await aplica(c.proj, c.sys)).code, 0);
  const depois = le(c.proj, '.ai-memory.toml');
  assert.equal(depois.split(/\r?\n/).filter((l) => /^\s*\[forge\]\s*$/.test(l)).length, 1, depois);
  const fora = orig.split(/\r?\n/).filter((l) => l.trim() && !/^\s*(server_url|data_dir|autostart)\s*=/.test(l));
  const linhas = depois.split(/\r?\n/);
  let i = 0;
  for (const l of linhas) if (l === fora[i]) i++;
  assert.equal(i, fora.length, 'linhas perdidas ou mudadas (em ordem): ' + JSON.stringify(fora.slice(i)) + '\n' + depois);
  assert.equal(forge(c.proj).port, port);
});

test('C1 data-dir já existente com config.toml: nenhum init, e os outros ficheiros dele com os mesmos sha256 depois de dois --apply', async () => {
  const c = await cenario();
  const dd = dataDirWin(c.sb);
  mkdirSync(join(dd, 'auth-tokens'), { recursive: true }); mkdirSync(join(dd, 'db'), { recursive: true });
  writeFileSync(join(dd, 'config.toml'), CONFIG_INICIAL());
  writeFileSync(join(dd, 'auth-tokens', 'default'), 'tok\n');
  writeFileSync(join(dd, 'db', 'memory.sqlite'), Buffer.from([0, 1, 2, 3, 255]));
  writeFileSync(join(dd, 'notas.md'), '# não mexer\n');
  const cfgAntes = readFileSync(join(dd, 'config.toml'), 'utf8');
  const semCfg = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.endsWith('|config.toml')));
  const antes = instantaneo([dd]);
  for (let i = 0; i < 2; i++) assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.deepEqual(semCfg(instantaneo([dd])), semCfg(antes));
  assert.ok(!c.regs.run.some((x) => x.args.includes('init')), 'correu o init com config.toml');
  // o config.toml só muda na linha bind
  const port = forge(c.proj).port;
  const cfg = readFileSync(join(dd, 'config.toml'), 'utf8');
  assert.deepEqual(cfg.split(/\r?\n/).filter((l) => !/^\s*bind\s*=/.test(l)), cfgAntes.split(/\r?\n/).filter((l) => !/^\s*bind\s*=/.test(l)));
  assert.deepEqual(cfg.split(/\r?\n/).filter((l) => /^\s*bind\s*=/.test(l)), [`bind = "127.0.0.1:${port}"`]);
});

test('C1 projeto já configurado (a [forge] e o bind batem certo): o data-dir inteiro fica com os mesmos sha256 depois de dois --apply', async () => {
  const c = await cenario();
  const dd = dataDirWin(c.sb), port = await portaLivre();
  mkdirSync(join(dd, 'auth-tokens'), { recursive: true });
  writeFileSync(join(dd, 'config.toml'), CONFIG_INICIAL(port));
  writeFileSync(join(dd, 'auth-tokens', 'default'), 'tok\n');
  escreve(c.proj, '.ai-memory.toml', le(c.proj, '.ai-memory.toml').replace(/\s*$/, '\n') + `\n[forge]\nserver_url = "http://127.0.0.1:${port}"\ndata_dir = "${dd}"\n`);
  const antes = instantaneo([dd]);
  for (let i = 0; i < 2; i++) assert.equal((await aplica(c.proj, c.sys)).code, 0);
  assert.deepEqual(instantaneo([dd]), antes);
});

// caminhos com " ou carácter de controlo: recusados com exit 1 e nada escrito
const MAUS = [
  ['LOCALAPPDATA com "', (sb) => ({ env: { LOCALAPPDATA: join(sb.dir, 'a"b') } })],
  ['LOCALAPPDATA com tabulação', (sb) => ({ env: { LOCALAPPDATA: join(sb.dir, 'a\tb') } })],
  ['XDG_DATA_HOME com nova linha (linux)', (sb) => ({ platform: 'linux', env: { XDG_DATA_HOME: sb.dir + '/x\ny' } })],
  ['HOME com " (darwin)', (sb) => ({ platform: 'darwin', home: sb.dir + '/h"o', env: { HOME: sb.dir + '/h"o', USERPROFILE: sb.dir + '/h"o' } })],
  ['AI_MEMORY_BIN com "', (sb) => ({ env: { AI_MEMORY_BIN: sb.dir + '/b"in/ai-memory.exe' }, bins: [sb.dir + '/b"in/ai-memory.exe'] })],
  ['AI_MEMORY_BIN com \\u0007', (sb) => ({ env: { AI_MEMORY_BIN: sb.dir + '/b\u0007in/ai-memory.exe' }, bins: [sb.dir + '/b\u0007in/ai-memory.exe'] })],
];
for (const [nome, cfg] of MAUS) {
  for (const modo of ['--plan', '--apply']) {
    test(`C1 caminho recusado (${nome}) no ${modo}: exit 1 e nada escrito`, async () => {
      const sb = caixa(), proj = await projeto();
      const o = cfg(sb);
      const f = sysFalso(sb, o);
      if (o.home) f.sys.home = o.home;
      limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
      const raizes = [proj, sb.home, sb.local, sb.xdg, sb.cfg, sb.dir];
      const antes = instantaneo(raizes);
      const r = modo === '--plan' ? await plano(proj, f.sys) : await aplica(proj, f.sys);
      assert.equal(r.code, 1, r.out);
      assert.deepEqual(instantaneo(raizes), antes, 'escreveu com um caminho recusado');
      assert.ok(!f.regs.run.some((x) => x.args.includes('init')) && f.regs.spawn.length === 0, 'correu init ou spawn');
    });
  }
}

test('C1 CLI real (`node scripts/memoria.mjs --plan --dest <projeto>`), sem binário na caixa: exit 1, «ai-memory not found», nada escrito', async () => {
  const sb = caixa(), proj = await projeto();
  limpar.push(() => apaga(sb.dir), () => apaga(proj));
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(PATH|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|XDG_.*|CLAUDE_CONFIG_DIR|AI_MEMORY_.*|NODE_OPTIONS|NODE_TEST_CONTEXT)$/i.test(k)) env[k] = v;
  Object.assign(env, { PATH: '', HOME: sb.home, USERPROFILE: sb.home, LOCALAPPDATA: sb.local, XDG_DATA_HOME: sb.xdg, CLAUDE_CONFIG_DIR: sb.cfg, APPDATA: join(sb.dir, 'appdata') });
  const raizes = [proj, sb.home, sb.local, sb.xdg, sb.cfg];
  const antes = instantaneo(raizes);
  const r = spawnSync(process.execPath, [MEMORIA, '--plan', '--dest', proj], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 1, (r.stdout || '') + (r.stderr || ''));
  assert.match((r.stdout || '') + (r.stderr || ''), /ai-memory not found/);
  assert.deepEqual(instantaneo(raizes), antes);
});