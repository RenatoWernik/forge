// Ronda −1 do F-20c (#72), C4: a linha `ai-memory: autostart` do `node .claude/check.cjs --env`.
// Oráculo: os 6 casos da tabela do contrato, em cada uma das 3 plataformas, com a plataforma forçada pelo espião pré-carregado (process.platform)
// e o HOME, o APPDATA e o XDG_CONFIG_HOME falsos. As entradas são escritas a partir dos goldens (golden/), não pelo memoria.mjs: a linha é provada
// sozinha. Acrescentos que só leem a própria tabela: a entrada de OUTRO projeto não é a deste; «no» sem o start-ai-memory.mjs não é ok;
// outro data-dir não é ok; no linux sem XDG_CONFIG_HOME, a entrada vive em ~/.config.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PLATAFORMAS, ENTRADA, L_AUTO, D_AUTO, projeto, caixaCheck, ambiente, binFalso, AIM_OK, tomlLocal, golden, correCheck, portaLivre, pastaEntradas, fwd, apaga } from './helpers.mjs';

const limpar = [];
after(() => { for (const f of limpar) f(); });
const OUTRO = { win32: 'forge-ai-memory-outro--x.vbs', linux: 'forge-ai-memory-outro--x.service', darwin: 'com.forge.ai-memory.outro.x.plist' };

// cenário: projeto gerado, [forge] no .ai-memory.local.toml com o autostart dado (undefined = sem a chave), a entrada (ou nenhuma) e o --env forçado
const cenario = async (plat, { autostart, entrada = null, outro = false, semScript = false, semXdg = false } = {}) => {
  const proj = await projeto(), sb = caixaCheck();
  limpar.push(() => { apaga(proj); apaga(sb.dir); });
  const bin = fwd(binFalso(join(sb.dir, 'bin', 'ai-memory.exe'), AIM_OK('3.3.0', sb.dataDir)));
  const port = await portaLivre();
  tomlLocal(proj, { serverUrl: 'http://127.0.0.1:' + port, dataDir: sb.dataDir, autostart });
  const script = join(proj, '.claude/start-ai-memory.mjs');
  if (semScript) rmSync(script, { force: true });
  else if (!existsSync(script)) writeFileSync(script, '// critico: o script do F-20b\n');
  const env = ambiente(sb, { AI_MEMORY_BIN: bin, ...(semXdg ? { XDG_CONFIG_HOME: undefined } : {}) });
  const pasta = pastaEntradas(plat, { home: sb.home, appdata: env.APPDATA, xdgc: env.XDG_CONFIG_HOME });
  const atual = { bin, dataDir: sb.dataDir, port };
  if (entrada) { mkdirSync(pasta, { recursive: true }); writeFileSync(join(pasta, ENTRADA[plat]), golden(plat, { ...atual, ...entrada(atual) })); }
  if (outro) { mkdirSync(pasta, { recursive: true }); writeFileSync(join(pasta, OUTRO[plat]), golden(plat, { ...atual, w: 'outro', p: 'x' })); }
  const r = await correCheck(proj, env, { plataforma: plat });
  const ls = r.linhas.filter((l) => /^(ok {4}|FAIL {2})/.test(l) && l.slice(6).startsWith(L_AUTO));
  assert.equal(ls.length, 1, `linhas «${L_AUTO}» no --env: ${JSON.stringify(ls)}\n${r.out.slice(0, 1500)}`);
  return ls[0];
};
const ok = (l) => assert.ok(l.startsWith('ok    ' + L_AUTO), 'não diz ok: ' + l);
const falha = (l, d) => { assert.ok(l.startsWith('FAIL  ' + L_AUTO), 'não diz FAIL: ' + l); if (d) assert.ok(l.endsWith(' ' + d), `detalhe errado (esperado ${d}): ${l}`); };
const mesma = () => ({});

for (const plat of PLATAFORMAS) {
  test(`C4 ${plat}: "yes" e a entrada com o bin, o data-dir e 127.0.0.1:<port> atuais: ok`, async () => {
    ok(await cenario(plat, { autostart: 'yes', entrada: mesma }));
  });
  test(`C4 ${plat}: "yes" sem a entrada: FAIL (yes, but the startup entry is missing ...)`, async () => {
    falha(await cenario(plat, { autostart: 'yes' }), D_AUTO.semEntrada);
  });
  test(`C4 ${plat}: "yes" e a entrada com outra porta: FAIL (yes, but the startup entry does not match ...)`, async () => {
    falha(await cenario(plat, { autostart: 'yes', entrada: (a) => ({ port: a.port + 1 }) }), D_AUTO.diferente);
  });
  test(`C4 ${plat}: "yes" e a entrada com outro binário: FAIL (yes, but the startup entry does not match ...)`, async () => {
    falha(await cenario(plat, { autostart: 'yes', entrada: (a) => ({ bin: fwd(join(dirname(a.bin), 'outro', 'ai-memory.exe')) }) }), D_AUTO.diferente);
  });
  test(`C4 ${plat}: "no", sem a entrada e com o .claude/start-ai-memory.mjs: ok`, async () => {
    ok(await cenario(plat, { autostart: 'no' }));
  });
  test(`C4 ${plat}: "no" e a entrada presente: FAIL (no, but a startup entry exists ...)`, async () => {
    falha(await cenario(plat, { autostart: 'no', entrada: mesma }), D_AUTO.sobra);
  });
  test(`C4 ${plat}: a [forge] sem a chave autostart: FAIL (not chosen ...)`, async () => {
    falha(await cenario(plat, { autostart: undefined, entrada: mesma }), D_AUTO.semChave);
  });
  test(`C4 ${plat}: "yes" e só a entrada de OUTRO projeto forge: FAIL (yes, but the startup entry is missing ...)`, async () => {
    falha(await cenario(plat, { autostart: 'yes', outro: true }), D_AUTO.semEntrada);
  });
  test(`C4 ${plat}: "no" e só a entrada de OUTRO projeto forge: ok`, async () => {
    ok(await cenario(plat, { autostart: 'no', outro: true }));
  });
  test(`C4 ${plat}: "no", sem a entrada e sem o .claude/start-ai-memory.mjs: nunca ok`, async () => {
    falha(await cenario(plat, { autostart: 'no', semScript: true }));
  });
  test(`C4 ${plat}: "yes" e a entrada com outro data-dir: nunca ok`, async () => {
    falha(await cenario(plat, { autostart: 'yes', entrada: (a) => ({ dataDir: a.dataDir.replace(/aim-data$/, 'outro-data') }) }));
  });
}

test('C4 linux sem XDG_CONFIG_HOME: a entrada em ~/.config/systemd/user conta (ok), e sem ela FAIL', async () => {
  ok(await cenario('linux', { autostart: 'yes', entrada: mesma, semXdg: true }));
  falha(await cenario('linux', { autostart: 'yes', semXdg: true }), D_AUTO.semEntrada);
});