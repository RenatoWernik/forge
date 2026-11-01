// Ronda −1 do F-20c (#72), C2: «Sim» (`memoria.mjs --apply --dest <projeto> --autostart yes`) em win32, linux e darwin.
// Oráculos: uma fixture golden por plataforma (golden/), com espaços nos caminhos do binário e do data-dir e um % na unit linux; o sys.run regista os
// comandos exatos, pela ordem, e o estado da entrada no momento de cada um; no win32, a linha Run dividida pelas regras do Windows dá o argv
// esperado; a idempotência (um segundo --autostart yes dá os mesmos bytes e não duplica a entrada).
// Também: nada no registo, nenhum schtasks, sudo ou runas; fora do data-dir só aparece a entrada deste projeto; os canários do F-20b ficam fora dela.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  PLATAFORMAS, ENTRADA, UNIT, LABEL, UID, W, P, CANARIO_1, CANARIO_2, TOML_LOCAL, caixa, projeto, sysF20c, autostart, plano, forge, linhasAutostart, proibidos,
  golden, comandoVbs, argvWindows, unit, plist, ARGV, semCr, fwd, mesmoCaminho, instantaneo, apaga, le,
} from './helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
// um cenário: caixa da plataforma, projeto gerado, sys falso; o bin é o que o --plan resolve
const cena = async (plat, o = {}) => {
  const sb = caixa(plat), proj = await projeto(), f = sysF20c(sb, plat, o);
  limpar.push(async () => { await f.fecha(); apaga(proj); apaga(sb.dir); });
  const pl = await plano(proj, f.sys);
  assert.equal(pl.code, 0, 'o --plan falhou: ' + pl.out);
  return { sb, proj, f, bin: pl.json.bin };
};
// os valores da [forge] depois do --apply
const alvo = (proj, bin) => { const g = forge(proj); assert.ok(g && g.dataDir && g.port, 'sem [forge] no ' + TOML_LOCAL); return { bin, dataDir: g.dataDir, port: g.port }; };
const sim = async (c) => { const r = await autostart(c.proj, c.f.sys, 'yes'); assert.equal(r.code, 0, '--autostart yes saiu com ' + r.code + ': ' + r.out); return r; };
// as pastas pessoais fora do data-dir onde a entrada pode nascer
const pessoais = (sb) => [sb.home, sb.appdata, sb.xdgc].filter(existsSync);
const novos = (antes, depois) => Object.keys(depois).filter((k) => !(k in antes) || antes[k] !== depois[k]).sort();

for (const plat of PLATAFORMAS) {
  test(`C2 ${plat}: grava autostart = "yes" uma só vez na [forge] e cria a entrada deste projeto com o nome exato`, async () => {
    const c = await cena(plat);
    await sim(c);
    assert.deepEqual(linhasAutostart(c.proj).map((l) => l.trim().replace(/\s*=\s*/, ' = ')), ['autostart = "yes"']);
    assert.ok(existsSync(c.f.entrada), 'falta a entrada ' + c.f.entrada);
    assert.equal(readdirSync(dirname(c.f.entrada)).filter((n) => n === ENTRADA[plat]).length, 1);
  });

  test(`C2 ${plat}: um segundo --autostart yes dá os mesmos bytes (entrada e ${TOML_LOCAL}) e não duplica a entrada`, async () => {
    const c = await cena(plat);
    await sim(c);
    const e1 = readFileSync(c.f.entrada), t1 = le(c.proj, TOML_LOCAL), pasta1 = readdirSync(dirname(c.f.entrada)).sort();
    await sim(c);
    assert.ok(readFileSync(c.f.entrada).equals(e1), 'a entrada mudou no segundo --autostart yes');
    assert.equal(le(c.proj, TOML_LOCAL), t1, `o ${TOML_LOCAL} mudou no segundo --autostart yes`);
    assert.deepEqual(readdirSync(dirname(c.f.entrada)).sort(), pasta1, 'a pasta das entradas mudou');
    assert.equal(linhasAutostart(c.proj).length, 1, 'autostart duplicado');
  });

  test(`C2 ${plat}: fora do data-dir só aparece a entrada deste projeto; nenhum registo, schtasks, sudo, runas ou wscript; os canários ficam fora`, async () => {
    const c = await cena(plat);
    const antes = instantaneo(pessoais(c.sb));
    await sim(c);
    const depois = instantaneo(pessoais(c.sb));
    const dd = fwd(forge(c.proj).dataDir).toLowerCase() + '/';
    const mudou = novos(antes, depois).filter((k) => !fwd(k.replace('|', '/')).toLowerCase().startsWith(dd));
    assert.equal(mudou.length, 1, 'mudou fora do data-dir: ' + JSON.stringify(mudou));
    assert.ok(mesmoCaminho(mudou[0].replace('|', '/'), c.f.entrada), 'o ficheiro novo não é a entrada: ' + mudou[0]);
    assert.deepEqual(proibidos(c.f), [], 'comandos proibidos: ' + JSON.stringify(proibidos(c.f)));
    const t = readFileSync(c.f.entrada, 'utf8');
    for (const k of [CANARIO_1, CANARIO_2, '--auth-token', 'AI_MEMORY_AUTH_TOKEN']) assert.ok(!t.includes(k), 'a entrada leva ' + k);
  });
}

test('C2 win32: o .vbs na pasta Startup do APPDATA é o golden (2 linhas, byte a byte, com espaços nos caminhos)', async () => {
  const c = await cena('win32');
  await sim(c);
  assert.ok(mesmoCaminho(c.f.entrada, join(c.sb.appdata, 'Microsoft/Windows/Start Menu/Programs/Startup', ENTRADA.win32)));
  const a = alvo(c.proj, c.bin);
  assert.ok(/ /.test(a.bin) && / /.test(a.dataDir), 'o cenário tem de ter espaços no bin e no data-dir');
  const t = semCr(readFileSync(c.f.entrada, 'utf8')).replace(/\n$/, '');
  assert.equal(t.split('\n').length, 2, 'não tem exatamente 2 linhas:\n' + t);
  assert.equal(t, golden('win32', a).replace(/\n$/, ''));
});

test('C2 win32: a linha Run, dividida pelas regras de linha de comando do Windows, dá exatamente o argv do servidor', async () => {
  const c = await cena('win32');
  await sim(c);
  const a = alvo(c.proj, c.bin);
  const cmd = comandoVbs(readFileSync(c.f.entrada, 'utf8'));
  assert.ok(cmd, 'sem a linha CreateObject("WScript.Shell").Run "...", 0, False');
  assert.deepEqual(argvWindows(cmd).map(fwd), ARGV(a.bin, a.dataDir, a.port).map(fwd));
});

test('C2 win32: nenhum comando do sistema corre (sem registo, sem schtasks, sem admin)', async () => {
  const c = await cena('win32');
  await sim(c);
  assert.deepEqual(c.f.regs.cmds.filter((x) => x.cmd !== 'id'), [], 'comandos: ' + JSON.stringify(c.f.regs.cmds));
});

const unitDe = (c) => {
  const a = alvo(c.proj, c.bin);
  assert.ok(/%/.test(a.bin) && /%/.test(a.dataDir) && / /.test(a.dataDir), 'o cenário linux tem de ter % e espaços nos caminhos');
  const u = unit(readFileSync(c.f.entrada, 'utf8'));
  const v = (sec, key) => u.filter((x) => x.sec === sec && x.key === key).map((x) => x.value);
  return { a, u, v };
};
for (const [nome, o] of [['com XDG_CONFIG_HOME', {}], ['sem XDG_CONFIG_HOME (~/.config)', { env: { XDG_CONFIG_HOME: undefined } }]]) {
  test(`C2 linux ${nome}: a unit systemd --user do golden, com cada % escrito como %%`, async () => {
    const c = await cena('linux', o);
    await sim(c);
    const pasta = o.env ? join(c.sb.home, '.config', 'systemd', 'user') : join(c.sb.xdgc, 'systemd', 'user');
    assert.ok(existsSync(join(pasta, UNIT)), 'a unit não está em ' + pasta);
    const { a, u, v } = unitDe(c);
    const g = unit(golden('linux', a));
    for (const { sec, key, value } of g) assert.deepEqual(v(sec, key), [value], `[${sec}] ${key}`);
    assert.deepEqual([...new Set(u.map((x) => x.sec))], ['Unit', 'Service', 'Install'], 'as secções');
    assert.equal(u.filter((x) => /^ExecStart/.test(x.key)).length, 1, 'mais de um ExecStart*');
  });
}

test('C2 linux: depois de escrever a unit, corre systemctl --user daemon-reload e depois enable --now <unit>, pela ordem, e só isso', async () => {
  const c = await cena('linux');
  await sim(c);
  const final = readFileSync(c.f.entrada, 'utf8');
  const s = c.f.regs.cmds.filter((x) => x.cmd === 'systemctl');
  assert.deepEqual(s.map((x) => x.args), [['--user', 'daemon-reload'], ['--user', 'enable', '--now', UNIT]]);
  for (const x of s) assert.equal(x.bytes, final, `a unit não estava escrita (com os bytes finais) no ${x.args.join(' ')}`);
  assert.deepEqual(c.f.regs.cmds.filter((x) => x.cmd === 'launchctl'), []);
});

test('C2 darwin: a LaunchAgent do golden (Label, ProgramArguments, RunAtLoad, KeepAlive), XML válido com o & escapado', async () => {
  const c = await cena('darwin');
  await sim(c);
  assert.ok(mesmoCaminho(c.f.entrada, join(c.sb.home, 'Library/LaunchAgents', ENTRADA.darwin)));
  const a = alvo(c.proj, c.bin);
  assert.ok(/&/.test(a.bin) && /&/.test(a.dataDir) && / /.test(a.dataDir), 'o cenário darwin tem de ter & e espaços nos caminhos');
  const d = plist(readFileSync(c.f.entrada, 'utf8'));
  assert.equal(d.Label, LABEL);
  assert.deepEqual(d.ProgramArguments, ARGV(a.bin, a.dataDir, a.port));
  assert.equal(d.RunAtLoad, true);
  assert.equal(d.KeepAlive, true);
});

test('C2 darwin: corre launchctl bootstrap gui/<uid> <plist>, com o uid de id -u, depois de escrever o plist', async () => {
  const c = await cena('darwin');
  await sim(c);
  const final = readFileSync(c.f.entrada, 'utf8');
  const l = c.f.regs.cmds.filter((x) => x.cmd === 'launchctl');
  assert.equal(l.length, 1, 'launchctl: ' + JSON.stringify(l.map((x) => x.args)));
  assert.equal(l[0].args.length, 3);
  assert.deepEqual(l[0].args.slice(0, 2), ['bootstrap', 'gui/' + UID]);
  assert.ok(mesmoCaminho(l[0].args[2], c.f.entrada), 'o plist do bootstrap: ' + l[0].args[2]);
  assert.equal(l[0].bytes, final, 'o plist não estava escrito (com os bytes finais) no bootstrap');
  const iId = c.f.regs.cmds.findIndex((x) => x.cmd === 'id' && x.args.join(' ') === '-u'), iL = c.f.regs.cmds.indexOf(l[0]);
  assert.ok(iId >= 0 && iId < iL, 'o uid não veio de id -u antes do bootstrap');
  assert.deepEqual(c.f.regs.cmds.filter((x) => x.cmd === 'systemctl'), []);
});

test('C2 depois de um --autostart no, um --autostart yes deixa uma só linha autostart = "yes" e cria a entrada', async () => {
  const c = await cena('win32');
  const r = await autostart(c.proj, c.f.sys, 'no');
  assert.equal(r.code, 0, r.out);
  await sim(c);
  assert.deepEqual(linhasAutostart(c.proj).map((l) => l.trim().replace(/\s*=\s*/, ' = ')), ['autostart = "yes"']);
  assert.ok(existsSync(c.f.entrada));
});