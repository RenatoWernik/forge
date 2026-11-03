// F-31 (#162): nenhum helper de teste mata um PID que já não seja o processo que ele lançou. O Windows recicla os PIDs em segundos, e um helper que
// guarda o PID e o mata no fim (sem o tirar do registo quando o filho sai) acaba a matar processos alheios (medido no V-05 com um espião de taskkill: o
// executor de outra worktree e dois conhost.exe). Cada helper corrigido corre num processo filho com o spawnSync/process.kill instrumentados.
//   C1  inventário fechado: todo o uso de taskkill/process.kill em tests/ e scripts/ está classificado (um novo sem classe reprova);
//   C2  um filho que sai logo: a limpeza não chama taskkill nem kill, mesmo que o sistema diga que o PID «existe» (a reciclagem simula-se
//       fazendo a sonda process.kill(pid, 0) responder sempre que sim);
//   C3  um filho ainda vivo no fim continua a ser morto, e não fica órfão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// --- C1 ---
const USO = /(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*['"`]taskkill|process\.kill\(/;
const CLASSES = {
  'scripts/executor.mjs': 'identidade verificada: só os PIDs que o executor lançou, com a identidade conferida (#125)',
  'scripts/fixtures/executor/arvore/pendura/n.fx.mjs': 'texto (comentário), sem execução',
  'tests/critico/f-12-r0/helpers.mjs': 'filho já registado: o fechar() só mata o browser se o filho ainda corre (F-31)',
  'tests/critico/f-13-r0/corpus-comandos.mjs': 'corpus/texto sem execução',
  'tests/critico/v-01-r0/guardas.test.mjs': 'filho já registado: o filho lançado e registado por este teste',
  'tests/critico/v-01-r0/helpers.mjs': 'identidade verificada: eOQueRegistou (hora de criação e linha de comando)',
  'tests/critico/v-05-r0/helpers.mjs': 'filho já registado: o PID sai do registo quando o filho sai (1d33aa4, PR do V-05)',
  'tests/critico/v-06-r0/helpers.mjs': 'filho já registado: o PID sai do registo quando o filho sai (F-31)',
};
test('C1: inventário fechado: todo o uso de taskkill ou process.kill em tests/ e scripts/ tem uma classe', () => {
  const ficheiros = [...globSync('tests/**/*.mjs', { cwd: ROOT }), ...globSync('scripts/**/*.mjs', { cwd: ROOT })].map((f) => f.replaceAll('\\', '/'));
  const comUso = ficheiros.filter((f) => f !== 'scripts/limpa-pids.test.mjs' && USO.test(readFileSync(join(ROOT, f), 'utf8')));
  const sem = comUso.filter((f) => !CLASSES[f]);
  assert.deepEqual(sem, [], `uso de taskkill/process.kill sem classe (filho já registado, identidade verificada, ou texto sem execução): ${sem.join(', ')}`);
});

// --- o filho instrumentado ---
// `taskkill`/`kill` ficam registados; com SIMULA=1 não se executam e a sonda process.kill(pid, 0) diz sempre que o PID existe (= foi reciclado)
const INSTRUMENTA = `
import { createRequire } from 'node:module';
import * as modulo from 'node:module';
const require = createRequire(import.meta.url);
const cp = require('node:child_process');
const chamadas = [];
let simula = false;
const spawnSyncReal = cp.spawnSync;
cp.spawnSync = (cmd, args, ...resto) => {
  if (/taskkill/i.test(String(cmd))) { chamadas.push({ via: 'taskkill', pid: Number(args[args.indexOf('/PID') + 1]) }); if (simula) return { status: 0 }; }
  return spawnSyncReal(cmd, args, ...resto);
};
modulo.syncBuiltinESMExports();
const killReal = process.kill.bind(process);
process.kill = (pid, sinal = 'SIGTERM') => {
  if (sinal === 0) return simula ? true : killReal(pid, 0);
  chamadas.push({ via: 'kill', pid: Math.abs(pid), sinal });
  return simula ? true : killReal(pid, sinal);
};
globalThis.__i = { chamadas, simula: (v) => { simula = v; }, killReal };
`;
const CENARIO_V06 = `
await import(process.env.INSTRUMENTA);
const h = await import(process.env.HELPERS);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const m = h.montaCenario(h.corpus().find((c) => c.nome === 'reprovado'));
const modo = process.env.MODO;
const saida = {};
if (modo === 'saiu-logo') {
  const r = await h.correAvancar(m);               // o avancar recusa e sai
  saida.status = r.status;
  globalThis.__i.simula(true);                      // o PID dele «foi reciclado»
  await h.limpa();
} else {
  const p = h.correAvancar(m, { limite_ms: 120000 }); // ainda corre quando a limpeza chega
  await espera(250);
  await h.limpa();
  const r = await Promise.race([p, espera(15000).then(() => null)]);
  saida.acabou = r !== null;
}
saida.chamadas = globalThis.__i.chamadas;
if (modo !== 'saiu-logo') { await espera(1500); saida.vivos = saida.chamadas.map((c) => c.pid).filter((pid) => { try { globalThis.__i.killReal(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }); }
console.log('RESULTADO ' + JSON.stringify(saida));
`;
const CENARIO_F12 = `
await import(process.env.INSTRUMENTA);
const h = await import(process.env.HELPERS);
if (h.SEM_BROWSER) { console.log('RESULTADO ' + JSON.stringify({ semBrowser: h.SEM_BROWSER })); process.exit(0); }
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await h.sessao();
await s.fechar();                                   // o browser ainda corre: é morto
const primeira = globalThis.__i.chamadas.length;
await espera(1500);
const vivos = globalThis.__i.chamadas.map((c) => c.pid).filter((pid) => { try { globalThis.__i.killReal(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } });
globalThis.__i.simula(true);                        // o PID do browser «foi reciclado»
await s.fechar();                                   // o browser já saiu: não se mata ninguém
console.log('RESULTADO ' + JSON.stringify({ primeira, segunda: globalThis.__i.chamadas.length - primeira, vivos, chamadas: globalThis.__i.chamadas }));
`;
function filho(codigo, helpers, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'f31-'));
  try {
    writeFileSync(join(dir, 'instrumenta.mjs'), INSTRUMENTA);
    writeFileSync(join(dir, 'cenario.mjs'), codigo);
    const env = { ...process.env, INSTRUMENTA: pathToFileURL(join(dir, 'instrumenta.mjs')).href, HELPERS: pathToFileURL(join(ROOT, helpers)).href, ...extra };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [join(dir, 'cenario.mjs')], { cwd: ROOT, env, encoding: 'utf8', timeout: 240000, windowsHide: true, maxBuffer: 1 << 26 });
    const linha = /^RESULTADO (.*)$/m.exec(r.stdout ?? '');
    assert.ok(linha, `o filho não deu resultado (código ${r.status}):\n${(r.stdout ?? '').slice(-1500)}\n${(r.stderr ?? '').slice(-1500)}`);
    return JSON.parse(linha[1]);
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}

// --- C2 e C3: v-06-r0 ---
test('C2 (v-06-r0): um filho que sai logo não é morto pela limpeza, mesmo que o PID tenha sido reciclado', { timeout: 300000 }, () => {
  const r = filho(CENARIO_V06, 'tests/critico/v-06-r0/helpers.mjs', { MODO: 'saiu-logo' });
  assert.equal(r.status, 2, 'o cenário «reprovado» recusa com 2');
  assert.deepEqual(r.chamadas, [], `a limpeza matou PIDs que já tinham saído: ${JSON.stringify(r.chamadas)}`);
});
test('C3 (v-06-r0): um filho ainda vivo no fim é morto pela limpeza, sem órfãos', { timeout: 300000 }, () => {
  const r = filho(CENARIO_V06, 'tests/critico/v-06-r0/helpers.mjs', { MODO: 'vivo' });
  assert.ok(r.chamadas.length >= 1, 'a limpeza não matou o filho que ainda corria');
  assert.deepEqual(r.vivos, [], `ficaram vivos: ${r.vivos}`);
  assert.equal(r.acabou, true, 'o avancar não terminou depois de morto');
});

// --- C2 e C3: f-12-r0 (o browser) ---
test('C2 e C3 (f-12-r0): o fechar() mata o browser que ainda corre e, depois de ele sair, não mata ninguém', { timeout: 300000 }, (t) => {
  // o Chrome recusa o pipe de DevTools com um USERPROFILE falso (o executor põe um a cada unidade; o manifesto do f-12-r0 pede o real): usa-se o do sistema
  const r = filho(CENARIO_F12, 'tests/critico/f-12-r0/helpers.mjs', { USERPROFILE: userInfo().homedir });
  if (r.semBrowser) return t.skip(r.semBrowser);
  assert.deepEqual(r.vivos, [], `o browser ficou vivo: ${r.vivos}`);
  assert.equal(r.segunda, 0, `o 2.º fechar() matou um PID que já saíra: ${JSON.stringify(r.chamadas)}`);
});
