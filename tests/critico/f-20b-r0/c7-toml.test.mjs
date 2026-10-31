// Ronda −1 do F-20b (#71), seguimento #83 (pertence a este ticket, brief do orquestrador) e #70 comentário 6547395518 (prefixo \\?\ do Windows).
// O readConfig de templates/.claude/ai-memory.cjs desfaz os escapes TOML básicos das strings entre aspas duplas e lê as strings literais ('...'),
// e o serverState compara o data_dir reportado com o prefixo \\?\ ao do projeto. Oráculos: as tabelas abaixo, e o ciclo escrever/ler do --apply.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregaModulo, caixa, sysFalso, aplica, projeto, forge, apaga, dataDirWin, mesmoCaminho } from './helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
const comToml = (forgeLinhas) => {
  const d = mkdtempSync(join(tmpdir(), 'critico-f20b-toml-'));
  limpar.push(() => apaga(d));
  writeFileSync(join(d, '.ai-memory.toml'), `workspace = "w"\nproject = "p"\n\n[forge]\n${forgeLinhas}\n\n[capture]\nignore_paths = []\n`);
  return d;
};

const TABELA = [
  ['aspas duplas com \\\\', 'data_dir = "C:\\\\Users\\\\x\\\\data"', 'C:\\Users\\x\\data'],
  ['string literal', "data_dir = 'C:\\Users\\x\\data'", 'C:\\Users\\x\\data'],
  ['aspas duplas com \\" e comentário', 'data_dir = "C:/a \\"b\\"/data" # nota', 'C:/a "b"/data'],
  ['string literal com comentário', "data_dir = 'D:\\dados\\aim' # nota", 'D:\\dados\\aim'],
  ['barras / (o formato que o --apply escreve)', 'data_dir = "C:/Users/x/data"', 'C:/Users/x/data'],
];
for (const [nome, linha, esperado] of TABELA) {
  test(`#83 readConfig: data_dir em ${nome}`, () => {
    const { readConfig } = carregaModulo();
    assert.equal(readConfig(comToml('server_url = "http://127.0.0.1:1"\n' + linha)).dataDir, esperado);
  });
}

test("#83 readConfig: server_url em string literal", () => {
  const { readConfig } = carregaModulo();
  assert.equal(readConfig(comToml("server_url = 'http://127.0.0.1:7'\ndata_dir = 'C:\\x'")).serverUrl, 'http://127.0.0.1:7');
});

// a ponta a ponta do #83 com o \\?\ do servidor real (win32): TOML escapado + data_dir reportado com prefixo = on
const fetchOk = async () => new Response('{"ok":true}', { status: 200 });
const runRep = (rep) => () => { const out = JSON.stringify({ data_dir: rep }); return Object.assign(new String(out), { code: 0, status: 0, stdout: out, stderr: '' }); };
const CASOS = [
  ['"C:\\\\Users\\\\x\\\\data"', '\\\\?\\C:\\Users\\x\\data', 'on'],
  ["'C:\\Users\\x\\data'", '\\\\?\\C:\\Users\\x\\data', 'on'],
  ['"C:/Users/x/data"', '\\\\?\\C:\\Users\\x\\data', 'on'],
  ['"C:\\\\Users\\\\x\\\\data"', 'C:\\Users\\x\\outra', 'conflict'],
];
for (const [valor, rep, estado] of CASOS) {
  test(`#83 + \\\\?\\ (win32): data_dir = ${valor} e o servidor reporta ${rep} → ${estado}`, async () => {
    const { readConfig, serverState } = carregaModulo();
    const cfg = readConfig(comToml(`server_url = "http://127.0.0.1:1"\ndata_dir = ${valor}`));
    const s = await serverState({ serverUrl: cfg.serverUrl, dataDir: cfg.dataDir, bin: 'x', platform: 'win32', fetch: fetchOk, run: runRep(rep) });
    assert.equal(s.state, estado, JSON.stringify({ cfg, s }));
  });
}

// 6548062958: o readConfig lê o .ai-memory.toml e o .ai-memory.local.toml, e o local prevalece
const doisToml = (versionado, local) => {
  const d = mkdtempSync(join(tmpdir(), 'critico-f20b-toml2-'));
  limpar.push(() => apaga(d));
  writeFileSync(join(d, '.ai-memory.toml'), versionado);
  if (local !== null) writeFileSync(join(d, '.ai-memory.local.toml'), local);
  return d;
};
test('6548062958 readConfig: workspace e project do .ai-memory.toml, a [forge] só no .ai-memory.local.toml', () => {
  const { readConfig } = carregaModulo();
  const cfg = readConfig(doisToml('workspace = "w"\nproject = "p"\n\n[capture]\nignore_paths = []\n', '[forge]\nserver_url = "http://127.0.0.1:5"\ndata_dir = "C:/l/data"\n'));
  assert.deepEqual([cfg.workspace, cfg.project, cfg.serverUrl, cfg.dataDir], ['w', 'p', 'http://127.0.0.1:5', 'C:/l/data']);
});
test('6548062958 readConfig: com [forge] nos dois, o local prevalece; sem o local, vale a do versionado', () => {
  const { readConfig } = carregaModulo();
  const v = 'workspace = "w"\nproject = "p"\n\n[forge]\nserver_url = "http://127.0.0.1:4"\ndata_dir = "C:/v/data"\n';
  const a = readConfig(doisToml(v, '[forge]\nserver_url = "http://127.0.0.1:5"\ndata_dir = "C:/l/data"\n'));
  assert.deepEqual([a.workspace, a.project, a.serverUrl, a.dataDir], ['w', 'p', 'http://127.0.0.1:5', 'C:/l/data']);
  const b = readConfig(doisToml(v, null));
  assert.deepEqual([b.serverUrl, b.dataDir], ['http://127.0.0.1:4', 'C:/v/data']);
});
test('6548062958 + #83 readConfig: a string literal no .ai-memory.local.toml', () => {
  const { readConfig } = carregaModulo();
  const cfg = readConfig(doisToml('workspace = "w"\nproject = "p"\n', "[forge]\nserver_url = 'http://127.0.0.1:5'\ndata_dir = 'C:\\l\\data'\n"));
  assert.equal(cfg.dataDir, 'C:\\l\\data');
});
test('#83 ciclo: o data_dir que o --apply escreve na [forge] volta igual pelo readConfig', async () => {
  const sb = caixa(), proj = await projeto(), f = sysFalso(sb);
  limpar.push(f.fecha, () => apaga(sb.dir), () => apaga(proj));
  assert.equal((await aplica(proj, f.sys)).code, 0);
  const { readConfig } = carregaModulo();
  const cfg = readConfig(proj);
  assert.ok(mesmoCaminho(cfg.dataDir, dataDirWin(sb)), cfg.dataDir);
  assert.equal(cfg.serverUrl, forge(proj).serverUrl);
});