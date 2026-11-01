// Ronda −1 do F-20c (#72), C3: «Não» (`memoria.mjs --apply --dest <projeto> --autostart no`) em win32, linux e darwin.
// Oráculo: a pasta Startup, a systemd/user e a LaunchAgents falsas contêm um ficheiro do utilizador, a entrada de OUTRO projeto forge
// (forge-ai-memory-outro--x.*) e nomes que começam pelo deste projeto mas não são ele (o nome exato do C2 é o único a sair). Depois do «no»,
// os sha256 desses ficheiros ficam iguais e só a entrada deste projeto desaparece. Linux: disable --now antes de apagar e daemon-reload depois;
// darwin: bootout gui/<uid>/<Label> antes de apagar. O start-ai-memory.mjs e o data-dir ficam.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PLATAFORMAS, ENTRADA, UNIT, LABEL, UID, caixa, projeto, sysF20c, autostart, plano, forge, linhasAutostart, proibidos, golden, instantaneo, apaga } from './helpers.mjs';

const limpar = [];
after(async () => { for (const f of limpar) await f(); });
const ALHEIOS = {
  win32: ['minha-app.vbs', 'forge-ai-memory-outro--x.vbs', 'forge-ai-memory-acme--billing2.vbs', 'forge-ai-memory-acme--billing.vbs.bak'],
  linux: ['minha-app.service', 'forge-ai-memory-outro--x.service', 'forge-ai-memory-acme--billing2.service', 'forge-ai-memory-acme--billing.service.bak'],
  darwin: ['com.exemplo.minha-app.plist', 'forge-ai-memory-outro--x.plist', 'com.forge.ai-memory.outro.x.plist', 'com.forge.ai-memory.acme.billing2.plist', 'com.forge.ai-memory.acme.billing.extra.plist'],
};
// cenário: o projeto já com a [forge] (um primeiro --autostart no), a pasta das entradas com os alheios e, se `nossa`, a entrada deste projeto (golden)
const cena = async (plat, { nossa = true } = {}) => {
  const sb = caixa(plat), proj = await projeto(), f = sysF20c(sb, plat);
  limpar.push(async () => { await f.fecha(); apaga(proj); apaga(sb.dir); });
  const pl = await plano(proj, f.sys);
  assert.equal(pl.code, 0, 'o --plan falhou: ' + pl.out);
  const r0 = await autostart(proj, f.sys, 'no');
  assert.equal(r0.code, 0, 'o primeiro --autostart no falhou: ' + r0.out);
  const pasta = dirname(f.entrada);
  mkdirSync(pasta, { recursive: true });
  for (const n of ALHEIOS[plat]) writeFileSync(join(pasta, n), 'alheio ' + n + '\n');
  const g = forge(proj);
  if (nossa) writeFileSync(f.entrada, golden(plat, { bin: pl.json.bin, dataDir: g.dataDir, port: g.port }));
  f.regs.cmds.length = 0;
  return { sb, proj, f, pasta };
};
const nao = async (c) => { const r = await autostart(c.proj, c.f.sys, 'no'); assert.equal(r.code, 0, '--autostart no saiu com ' + r.code + ': ' + r.out); return r; };
const alheios = (c, plat) => { const s = instantaneo([c.pasta]); delete s[c.pasta + '|' + ENTRADA[plat]]; return s; };

for (const plat of PLATAFORMAS) {
  test(`C3 ${plat}: remove só a entrada deste projeto; o ficheiro do utilizador, a do outro projeto e os nomes parecidos ficam com o mesmo sha256`, async () => {
    const c = await cena(plat);
    const antes = alheios(c, plat);
    assert.equal(Object.keys(antes).length, ALHEIOS[plat].length);
    await nao(c);
    assert.ok(!existsSync(c.f.entrada), 'a entrada deste projeto ficou');
    assert.deepEqual(instantaneo([c.pasta]), antes, 'os ficheiros alheios mudaram');
    assert.deepEqual(readdirSync(c.pasta).sort(), [...ALHEIOS[plat]].sort());
  });

  test(`C3 ${plat}: grava autostart = "no" uma só vez; o start-ai-memory.mjs e o data-dir ficam`, async () => {
    const c = await cena(plat, { nossa: false });
    const r = await autostart(c.proj, c.f.sys, 'yes');
    assert.equal(r.code, 0, r.out);
    const dd = forge(c.proj).dataDir;
    writeFileSync(join(dd, 'memoria-do-utilizador.db'), 'dados que nunca se perdem\n');
    const antes = instantaneo([dd]);
    assert.ok(Object.keys(antes).length > 1, 'o data-dir está vazio no cenário');
    await nao(c);
    assert.deepEqual(linhasAutostart(c.proj).map((l) => l.trim().replace(/\s*=\s*/, ' = ')), ['autostart = "no"']);
    assert.ok(existsSync(join(c.proj, '.claude/start-ai-memory.mjs')), 'o .claude/start-ai-memory.mjs saiu');
    assert.deepEqual(instantaneo([dd]), antes, 'o data-dir mudou');
    assert.deepEqual(proibidos(c.f), [], 'comandos proibidos: ' + JSON.stringify(proibidos(c.f)));
  });

  test(`C3 ${plat}: sem a entrada deste projeto, o «no» não cria nem muda nada na pasta das entradas`, async () => {
    const c = await cena(plat, { nossa: false });
    const antes = instantaneo([c.pasta]);
    await nao(c);
    assert.deepEqual(instantaneo([c.pasta]), antes);
    assert.ok(!existsSync(c.f.entrada));
  });

  test(`C3 ${plat}: depois de um --autostart yes, o --autostart no apaga a entrada criada e deixa uma só linha autostart = "no"`, async () => {
    const c = await cena(plat, { nossa: false });
    const antes = instantaneo([c.pasta]);
    const r = await autostart(c.proj, c.f.sys, 'yes');
    assert.equal(r.code, 0, r.out);
    assert.ok(existsSync(c.f.entrada), 'o yes não criou a entrada');
    await nao(c);
    assert.ok(!existsSync(c.f.entrada), 'o no não apagou a entrada');
    assert.deepEqual(instantaneo([c.pasta]), antes);
    assert.deepEqual(linhasAutostart(c.proj).map((l) => l.trim().replace(/\s*=\s*/, ' = ')), ['autostart = "no"']);
  });
}

test('C3 win32: o «no» não corre nenhum comando do sistema', async () => {
  const c = await cena('win32');
  await nao(c);
  assert.deepEqual(c.f.regs.cmds.filter((x) => x.cmd !== 'id'), []);
});

test('C3 linux: systemctl --user disable --now <unit> com a unit ainda lá, depois daemon-reload com ela já apagada; nada sobre outras units', async () => {
  const c = await cena('linux');
  await nao(c);
  const s = c.f.regs.cmds.filter((x) => x.cmd === 'systemctl');
  const iD = s.findIndex((x) => x.args.join(' ') === '--user disable --now ' + UNIT), iR = s.findIndex((x) => x.args.join(' ') === '--user daemon-reload');
  assert.ok(iD >= 0, 'sem systemctl --user disable --now ' + UNIT + ': ' + JSON.stringify(s.map((x) => x.args)));
  assert.ok(iR > iD, 'o daemon-reload não vem depois do disable: ' + JSON.stringify(s.map((x) => x.args)));
  assert.equal(s[iD].existe, true, 'a unit já não existia no disable');
  assert.equal(s[iR].existe, false, 'a unit ainda existia no daemon-reload');
  for (const x of s) for (const a of x.args) assert.ok(!/outro|billing2|minha-app|\.bak/.test(a), 'systemctl sobre outra unit: ' + x.args.join(' '));
});

test('C3 darwin: launchctl bootout gui/<uid>/<Label> com o plist ainda lá; nada sobre outras LaunchAgents', async () => {
  const c = await cena('darwin');
  await nao(c);
  const l = c.f.regs.cmds.filter((x) => x.cmd === 'launchctl');
  const i = l.findIndex((x) => x.args.join(' ') === `bootout gui/${UID}/${LABEL}`);
  assert.ok(i >= 0, 'sem launchctl bootout gui/' + UID + '/' + LABEL + ': ' + JSON.stringify(l.map((x) => x.args)));
  assert.equal(l[i].existe, true, 'o plist já não existia no bootout');
  for (const x of l) for (const a of x.args) assert.ok(!/outro|billing2|billing\.extra|minha-app/.test(a), 'launchctl sobre outra LaunchAgent: ' + x.args.join(' '));
  const iId = c.f.regs.cmds.findIndex((x) => x.cmd === 'id' && x.args.join(' ') === '-u');
  assert.ok(iId >= 0 && iId < c.f.regs.cmds.indexOf(l[i]), 'o uid não veio de id -u antes do bootout');
});