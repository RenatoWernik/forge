// F-20c, correção da R1 (#96 e #97): testes de regressão por classe, ao lado dos ataques da Ronda −1 (que não mudam). Só fakes.
// #96: um .vbs com um caminho fora do ASCII só é certo em UTF-16 LE com BOM (o wscript lê o resto na página ANSI); o check dá FAIL sem o BOM.
// #97: no «yes» em linux e darwin só o gestor de serviços arranca o servidor (nenhum spawn do arranca()); com um servidor deste projeto já ligado,
// o gestor só faz o enable (linux sem --now; darwin launchctl enable), nunca arranca outro.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { caixa, projeto, sysF20c, autostart, plano, forge, apaga, UNIT, LABEL, UID, comandoVbs, argvWindows, ARGV, W, P } from '../f-20c-r0/helpers.mjs';

const aim = createRequire(import.meta.url)('../../../templates/.claude/ai-memory.cjs');
const limpar = [];
after(async () => { for (const f of limpar) await f(); });

// #96
const JOAO = 'C:/Users/João/AppData/Local/ai-memory/ai-memory.exe', DD = 'C:/Users/João/AppData/Local/forge/ai-memory/acme--billing';
const dec = (b) => (b[0] === 0xff && b[1] === 0xfe ? b.subarray(2).toString('utf16le') : b.toString('utf8'));
const dados = (bytes) => {
  const d = mkdtempSync(join(tmpdir(), 'critico f20c r1 '));
  limpar.push(() => apaga(d));
  const env = { APPDATA: join(d, 'appdata') };
  const e = aim.startupEntry({ platform: 'win32', env, home: d, workspace: W, project: P, bin: JOAO, dataDir: DD, port: 50123 });
  mkdirSync(e.dir, { recursive: true });
  writeFileSync(join(e.dir, e.name), bytes(e));
  return { env, d, e };
};
const estado = ({ env, d }) => aim.autostartState({ cfg: { workspace: W, project: P, serverUrl: 'http://127.0.0.1:50123', dataDir: DD, autostart: 'yes' }, bin: JOAO, platform: 'win32', env, home: d });

test('#96 caminho com João: o .vbs é UTF-16 LE com BOM e, descodificado, a linha Run dá o argv exato', () => {
  const d = dados((e) => e.bytes);
  assert.deepEqual([d.e.bytes[0], d.e.bytes[1]], [0xff, 0xfe]);
  assert.deepEqual(argvWindows(comandoVbs(dec(d.e.bytes))), ARGV(JOAO, DD, 50123));
  assert.deepEqual(estado(d), { ok: true, detail: '' });
});

test('#96 mutação: o mesmo .vbs escrito em UTF-8 (sem BOM) é apanhado pelo check (FAIL)', () => {
  const r = estado(dados((e) => Buffer.from(e.text, 'utf8')));
  assert.equal(r.ok, false);
  assert.match(r.detail, /does not match/);
});

test('#96 caminhos ASCII: o .vbs continua UTF-8 sem BOM', () => {
  const e = aim.startupEntry({ platform: 'win32', env: {}, home: 'C:/h', workspace: W, project: P, bin: 'C:/Program Files/ai-memory.exe', dataDir: 'C:/d', port: 5 });
  assert.notEqual(e.bytes[0], 0xff);
  assert.equal(e.bytes.toString('utf8'), e.text);
});

// #97
const cena = async (plat, ligado) => {
  const sb = caixa(plat), proj = await projeto(), f = sysF20c(sb, plat);
  limpar.push(async () => { await f.fecha(); apaga(proj); apaga(sb.dir); });
  assert.equal((await plano(proj, f.sys)).code, 0);
  assert.equal((await autostart(proj, f.sys, 'no')).code, 0);
  f.regs.cmds.length = 0;
  f.regs.spawn.length = 0;
  if (!ligado) f.sys.fetch = async () => { throw new Error('off'); }; // o «no» acima arrancou o servidor falso; aqui nada responde na porta
  else { // um servidor deste projeto responde na porta, com o data-dir certo
    const run = f.sys.run, dd = forge(proj).dataDir;
    f.sys.fetch = async () => ({ ok: true });
    f.sys.run = (cmd, args = [], o = {}) => (args.includes('status') ? { code: 0, stdout: JSON.stringify({ data_dir: dd }), stderr: '' } : run(cmd, args, o));
  }
  return { proj, f };
};
const serve = (f) => f.regs.spawn.filter((s) => (s.args ?? []).includes('serve'));

for (const plat of ['linux', 'darwin']) {
  test(`#97 ${plat} «yes» com o servidor desligado: só o gestor arranca, nenhum spawn do servidor`, async () => {
    const { proj, f } = await cena(plat, false);
    assert.equal((await autostart(proj, f.sys, 'yes')).code, 0);
    assert.deepEqual(serve(f), []);
    const gestor = f.regs.cmds.filter((c) => c.cmd === (plat === 'linux' ? 'systemctl' : 'launchctl')).map((c) => c.args.join(' '));
    assert.deepEqual(gestor, plat === 'linux' ? ['--user daemon-reload', `--user enable --now ${UNIT}`] : [`bootstrap gui/${UID} ${f.entrada}`]);
  });

  test(`#97 ${plat} «yes» com o servidor deste projeto já ligado: o gestor só faz o enable, nada o arranca de novo`, async () => {
    const { proj, f } = await cena(plat, true);
    assert.equal((await autostart(proj, f.sys, 'yes')).code, 0);
    assert.deepEqual(serve(f), []);
    const gestor = f.regs.cmds.filter((c) => c.cmd === (plat === 'linux' ? 'systemctl' : 'launchctl')).map((c) => c.args.join(' '));
    assert.deepEqual(gestor, plat === 'linux' ? ['--user daemon-reload', `--user enable ${UNIT}`] : [`enable gui/${UID}/${LABEL}`]);
  });
}

// #97, o $ na unit linux (repro do crítico): o executável do ExecStart leva o $ tal como está (só o % vira %%); nos argumentos o $ vai como $$.
// O check usa o mesmo escape por posição, por isso uma unit escrita assim continua «ok» e a que tem o $$ no executável dá FAIL.
test('#97 linux: $ no executável fica literal e nos argumentos vai como $$; o check concorda', () => {
  const a = { platform: 'linux', env: {}, home: '/home/u', workspace: W, project: P, bin: '/opt/a$b%c/ai-memory', dataDir: '/d/x$y%z', port: 41234 };
  const exec = aim.startupEntry(a).text.split('\n').find((l) => l.startsWith('ExecStart='));
  assert.ok(exec.startsWith('ExecStart="/opt/a$b%%c/ai-memory" '), exec);
  assert.ok(exec.includes('--data-dir "/d/x$$y%%z"'), exec);
  const d = mkdtempSync(join(tmpdir(), 'critico f20c r1 '));
  limpar.push(() => apaga(d));
  const cfg = { workspace: W, project: P, serverUrl: 'http://127.0.0.1:41234', dataDir: a.dataDir, autostart: 'yes' };
  const grava = (texto) => { const e = aim.startupEntry({ ...a, env: { XDG_CONFIG_HOME: d } }); mkdirSync(e.dir, { recursive: true }); writeFileSync(join(e.dir, e.name), texto); };
  const estado = () => aim.autostartState({ cfg, bin: a.bin, platform: 'linux', env: { XDG_CONFIG_HOME: d }, home: d });
  grava(aim.startupEntry(a).text);
  assert.equal(estado().ok, true);
  grava(aim.startupEntry(a).text.replace('"/opt/a$b%%c/ai-memory"', () => '"/opt/a$$b%%c/ai-memory"'));
  assert.equal(estado().ok, false);
});

// R2 (#97), a classe: no «yes», qualquer estado do servidor que não seja on nem off (conflito: outro servidor na porta; nobin: o binário deixa de se encontrar)
// escreve o aviso e sai com 2 ANTES de escrever a entrada e de chamar o gestor de serviços, em win32, linux e darwin.
const SEM_ON_OFF = {
  conflict: { texto: /CONFLICT/, prepara: (f, dd) => { const run = f.sys.run; f.sys.fetch = async () => ({ ok: true }); f.sys.run = (cmd, args = [], o = {}) => (args.includes('status') ? { code: 0, stdout: JSON.stringify({ data_dir: dd + '-outro' }), stderr: '' } : run(cmd, args, o)); } },
  nobin: { texto: /binary not found/, prepara: (f) => { const run = f.sys.run; let n = 0; f.sys.run = (cmd, args = [], o = {}) => (args.length === 1 && args[0] === '--version' && ++n > 1 ? { code: 1, stdout: '', stderr: '' } : run(cmd, args, o)); } },
};
for (const plat of ['win32', 'linux', 'darwin']) {
  for (const [estado, c] of Object.entries(SEM_ON_OFF)) {
    test(`#97 ${plat} «yes» com o servidor em estado ${estado}: aviso, código 2, nenhuma entrada e nenhum gestor`, async () => {
      const { proj, f } = await cena(plat, false);
      c.prepara(f, forge(proj).dataDir);
      const r = await autostart(proj, f.sys, 'yes');
      assert.equal(r.code, 2, `code=${r.code}\n${r.out}`);
      assert.match(r.out, c.texto);
      assert.deepEqual(f.regs.cmds.filter((x) => x.cmd === 'systemctl' || x.cmd === 'launchctl'), []);
      assert.equal(existsSync(f.entrada), false, 'a entrada foi escrita');
      assert.deepEqual(serve(f), []);
    });
  }
}
