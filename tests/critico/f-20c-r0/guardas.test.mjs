// Ronda −1 do F-20c (#72): guardas dos oráculos. Verdes na base: provam que os parsers e os goldens dizem o que o contrato diz,
// para que um ataque vermelho seja culpa da entrega e não do oráculo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { golden, comandoVbs, argvWindows, unit, plist, ARGV, W, P, semCr, projeto, caixaCheck, ambiente, correCheck, repo, apaga, L_INV, PLATAFORMAS } from './helpers.mjs';

const BIN = 'C:/Program Files/ai-memory/ai-memory.exe', DD = 'C:/Users/a b/AppData/Local/forge/ai-memory/acme--billing';

test('guarda: argvWindows segue as regras de linha de comando do Windows (aspas, barras antes de aspas, "" dentro de aspas)', () => {
  assert.deepEqual(argvWindows('"C:/Program Files/x.exe" --data-dir "C:/a b/c" serve'), ['C:/Program Files/x.exe', '--data-dir', 'C:/a b/c', 'serve']);
  assert.deepEqual(argvWindows('x.exe a\\\\"b c"'), ['x.exe', 'a\\b c']);
  assert.deepEqual(argvWindows('x.exe a\\"b'), ['x.exe', 'a"b']);
  assert.deepEqual(argvWindows('x.exe "a""b" c\\d'), ['x.exe', 'a"b', 'c\\d']);
  assert.deepEqual(argvWindows('"C:\\a b\\x.exe"   y'), ['C:\\a b\\x.exe', 'y']);
});

test('guarda: o golden win32 tem 2 linhas e a linha Run dá exatamente o argv do contrato', () => {
  const t = golden('win32', { bin: BIN, dataDir: DD, port: 51234 });
  const ls = semCr(t).replace(/\n$/, '').split('\n');
  assert.equal(ls.length, 2);
  assert.equal(ls[0], `' forge: starts the ai-memory server of ${W}/${P} at logon, hidden. Delete this file to stop it.`);
  assert.deepEqual(argvWindows(comandoVbs(t)), ARGV(BIN, DD, 51234));
});

test('guarda: o golden linux tem as chaves do contrato e escreve cada % como %%', () => {
  const u = unit(golden('linux', { bin: '/opt/100% x/ai-memory', dataDir: '/home/a b/100%/d', port: 51234 }));
  const v = (sec, key) => u.filter((x) => x.sec === sec && x.key === key).map((x) => x.value);
  assert.deepEqual(v('Unit', 'Description'), [`ai-memory server of the forge project ${W}/${P}`]);
  assert.deepEqual(v('Service', 'ExecStart'), [`"/opt/100%% x/ai-memory" --data-dir "/home/a b/100%%/d" serve --transport http --bind 127.0.0.1:51234 --workspace ${W} --project ${P}`]);
  assert.deepEqual(v('Service', 'Type'), ['simple']);
  assert.deepEqual(v('Service', 'Restart'), ['on-failure']);
  assert.deepEqual(v('Service', 'RestartSec'), ['5s']);
  assert.deepEqual(v('Install', 'WantedBy'), ['default.target']);
});

test('guarda: o golden darwin, com & no caminho, é XML válido e devolve o Label, o argv e os dois true; um & cru é recusado', () => {
  const bin = "/Users/R&D 'x'/ai-memory", dd = '/Users/R&D/Library/Application Support/forge/ai-memory/acme--billing';
  const t = golden('darwin', { bin, dataDir: dd, port: 51234 });
  assert.ok(!t.includes('R&D'), 'o golden não escapou o &');
  const d = plist(t);
  assert.equal(d.Label, `com.forge.ai-memory.${W}.${P}`);
  assert.deepEqual(d.ProgramArguments, ARGV(bin, dd, 51234));
  assert.equal(d.RunAtLoad, true);
  assert.equal(d.KeepAlive, true);
  assert.throws(() => plist(t.replace('R&amp;D', 'R&D')), /&/);
});
const limpar = [];
after(() => { for (const f of limpar) f(); });
test('guarda: com o espião deste pacote, o git real corre no --env (a linha info das tags cp-* já existente lista as tags do repo temporário)', async () => {
  const proj = await projeto(), sb = caixaCheck();
  limpar.push(() => { apaga(proj); apaga(sb.dir); });
  repo(proj, join(sb.dir, 'githome'), ['cp-0', 'cp-1', 'v1.0']);
  const r = await correCheck(proj, ambiente(sb));
  assert.ok(r.linhas.includes('info  cp-* tags: cp-0 cp-1'), 'o git não correu pelo espião:\n' + r.linhas.filter((l) => /cp-/.test(l)).join('\n'));
});

for (const plat of PLATAFORMAS) {
  test(`guarda: com a plataforma forçada em ${plat}, o check corre até ao fim e a linha invariants de um projeto gerado diz ok`, async () => {
    const proj = await projeto(), sb = caixaCheck();
    limpar.push(() => { apaga(proj); apaga(sb.dir); });
    const r = await correCheck(proj, ambiente(sb), { args: [], plataforma: plat });
    assert.ok(r.linhas.some((l) => l.startsWith('ok    ' + L_INV)), r.out.slice(0, 2000));
    assert.equal(r.status, 0, 'o check sem --env falha com a plataforma forçada:\n' + r.linhas.filter((l) => l.startsWith('FAIL')).join('\n'));
  });
}