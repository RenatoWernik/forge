// F-31 (#162): nenhum teste nem o executor mata um PID que já não seja o processo que ele lançou. O Windows recicla os PIDs em segundos, e quem guarda o PID
// e o mata no fim (sem o tirar do registo quando o filho sai) acaba a matar processos alheios (medido no V-05 com um espião: o executor de outra worktree e dois
// conhost.exe). Cada helper corrigido corre num processo filho com o spawnSync/process.kill instrumentados.
//   C1  inventário fechado por contagem: cada ficheiro rastreado de tests/ e scripts/ com ocorrências de matar processos está numa tabela
//       { contagem, classe, motivo }; um ficheiro novo, ou uma contagem que muda (para mais ou para menos), reprova;
//   C2  um filho que sai logo: a limpeza não mata nada, mesmo que o sistema diga que o PID «existe» (a reciclagem simula-se fazendo a sonda
//       process.kill(pid, 0) responder sempre que sim);
//   C3  um filho ainda vivo no fim continua a ser morto, e não fica órfão;
//   C5  o executor: depois de o filho de uma unidade sair, o relógio do limite não o mata (a folga de 2 s do exit); uma unidade pendurada continua a ser morta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// --- C1: o inventário ---
// O padrão apanha o comando de matar do Windows, o kill de um processo ou de um handle, o Stop-Process e o pkill/killall, por texto, em qualquer chamada
// (wrappers e `cmd /c` incluídos). Limite escrito: um texto montado por pedaços em runtime não se apanha por texto.
const PADRAO = new RegExp(['task' + 'kill', '\\.kill\\(', 'process\\.kill', 'Stop-Process', 'p' + 'kill', 'kill' + 'all'].join('|'), 'gi');
// classes: filho-vivo = handle do próprio filho, ou guarda de exitCode; identidade = confere a identidade antes de matar (eOQueRegistou);
//          saiu = o PID sai do registo (ou r.saiu) quando o filho sai; texto = nunca executa (regex, corpus, comentário, mensagem)
const TABELA = {
  'scripts/corpus.test.mjs': { contagem: 1, classe: 'filho-vivo', motivo: 'c.kill() no handle do filho lançado, no timeout' },
  'scripts/executor.mjs': { contagem: 5, classe: 'saiu', motivo: 'mataUnidade: r.saiu (exit/close/error) impede o kill depois de o filho sair; a sonda de existência não mata' },
  'scripts/fixtures/executor/arvore/pendura/n.fx.mjs': { contagem: 2, classe: 'texto', motivo: 'comentário da fixture' },
  'scripts/hooks/forge-matar-por-nome.mjs': { contagem: 10, classe: 'texto', motivo: 'o hook que bloqueia matar por nome: reconhece comandos, não os executa' },
  'scripts/hooks/forge-shell.mjs': { contagem: 3, classe: 'texto', motivo: 'analisador de linhas de comando' },
  'scripts/limpa-pids.test.mjs': { contagem: 13, classe: 'texto', motivo: 'este ficheiro: o padrão e os casos plantados montam-se por pedaços; o que sobra é texto desta tabela e dos comentários' },
  'tests/critico/f-06-r0/c3-regras-operacionais.test.mjs': { contagem: 3, classe: 'texto', motivo: 'comentário e regras lidas dos documentos' },
  'tests/critico/f-06-r0/helpers.mjs': { contagem: 6, classe: 'texto', motivo: 'padrões de leitura de documentos' },
  'tests/critico/f-12-r0/helpers.mjs': { contagem: 2, classe: 'filho-vivo', motivo: 'fechar(): só mata o browser se p.exitCode e p.signalCode são null (F-31)' },
  'tests/critico/f-13-r0/c0-ponte.test.mjs': { contagem: 11, classe: 'texto', motivo: 'entradas do hook de matar por nome' },
  'tests/critico/f-13-r0/c4-scaffold.test.mjs': { contagem: 2, classe: 'texto', motivo: 'entradas do hook' },
  'tests/critico/f-13-r0/c5-isolamento.test.mjs': { contagem: 1, classe: 'texto', motivo: 'entrada do hook' },
  'tests/critico/f-13-r0/corpus-comandos.mjs': { contagem: 111, classe: 'texto', motivo: 'corpus de comandos para o hook, sem execução' },
  'tests/critico/f-13-r0/helpers.mjs': { contagem: 1, classe: 'filho-vivo', motivo: 'p.kill() no handle do filho lançado, no timeout' },
  'tests/critico/f-22b-r0/helpers.mjs': { contagem: 1, classe: 'filho-vivo', motivo: 'c.kill() no handle do filho lançado, no timeout' },
  'tests/critico/v-01-r0/a8-limpa-pid-reciclado.test.mjs': { contagem: 3, classe: 'filho-vivo', motivo: 'kill() nos handles dos processos que o teste lançou; um comentário' },
  'tests/critico/v-01-r0/a9-numero-repetido-processo-nosso.test.mjs': { contagem: 2, classe: 'filho-vivo', motivo: 'p.kill() nos handles que o teste lançou' },
  'tests/critico/v-01-r0/c2-arvore.test.mjs': { contagem: 8, classe: 'texto', motivo: 'varre o código do executor à procura de matar por nome' },
  'tests/critico/v-01-r0/c9b-morte-12x.test.mjs': { contagem: 2, classe: 'texto', motivo: 'comentários (a morte vem de mataArvore, com identidade)' },
  'tests/critico/v-01-r0/guardas.test.mjs': { contagem: 2, classe: 'filho-vivo', motivo: 'kill do filho que o teste lançou e registou; um comentário' },
  'tests/critico/v-01-r0/helpers.mjs': { contagem: 5, classe: 'identidade', motivo: 'mataArvore/limpa conferem hora de criação e linha de comando (eOQueRegistou)' },
  'tests/critico/v-01-r0/limpa-identidade.test.mjs': { contagem: 3, classe: 'filho-vivo', motivo: 'kill() nos handles que o teste lançou' },
  'tests/critico/v-01-r0/r1-a4-c9-carga.test.mjs': { contagem: 2, classe: 'filho-vivo', motivo: 'p.kill() nos processos de carga que o teste lançou; um comentário' },
  'tests/critico/v-08-r0/r4-mecanismos.test.mjs': { contagem: 1, classe: 'identidade', motivo: 'mataMotor: só mata o PID do ficheiro de motor cujo batimento (mesmo PID e nonce, < 3 s) o confirma vivo, um motor que o próprio teste lançou pelo executor' },
  'tests/critico/v-05-r0/dev-classes.test.mjs': { contagem: 1, classe: 'texto', motivo: 'comentário que descreve a medição com o espião' },
  'tests/critico/v-05-r0/helpers.mjs': { contagem: 4, classe: 'saiu', motivo: 'mataArvore só recebe PIDs de PIDS, que a lanca() retira em exit/error; a sonda de existência (sinal 0) não mata' },
  'tests/critico/v-06-r0/helpers.mjs': { contagem: 5, classe: 'saiu', motivo: 'o PID sai de PIDS no acaba() do filho (F-31); a sonda de existência não mata' },
};
const CLASSES = ['filho-vivo', 'identidade', 'saiu', 'texto'];
// o que há para ver: tudo o que o git rastreia (ou vai rastrear) em tests/ e scripts/, sem exceções
function ficheirosDoRepo() {
  const r = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'tests', 'scripts'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  return new Map(r.stdout.split('\0').filter(Boolean).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
}
const conta = (texto) => (texto.match(PADRAO) ?? []).length;
function problemas(ficheiros) {
  const p = [];
  for (const [f, texto] of ficheiros) {
    const n = conta(texto), e = TABELA[f];
    if (n && !e) p.push(`${f}: ${n} ocorrência(s) sem classe`);
    else if (e && e.contagem !== n) p.push(`${f}: ${n} ocorrência(s), a tabela diz ${e.contagem}`);
  }
  for (const f of Object.keys(TABELA)) if (!ficheiros.has(f)) p.push(`${f}: está na tabela e não existe`);
  return p;
}
test('C1: o inventário está fechado: cada ficheiro com ocorrências tem classe e a contagem exata', () => {
  assert.deepEqual(Object.values(TABELA).filter((e) => !CLASSES.includes(e.classe) || !e.motivo).length, 0, 'classe inválida ou sem motivo');
  assert.deepEqual(problemas(ficheirosDoRepo()), []);
});
test('C1 (plantados): um uso a mais, num ficheiro classificado ou novo, em qualquer forma, reprova', () => {
  const base = ficheirosDoRepo();
  const com = (f, extra) => new Map([...base, [f, (base.get(f) ?? '') + `\n${extra}\n`]]);
  const TK = 'task' + 'kill';
  const plantados = {
    'kill de PID num ficheiro já classificado': com('tests/critico/f-12-r0/helpers.mjs', "process" + ".kill(pid, 'SIGKILL');"),
    'o wrapper do executor, num ficheiro novo': com('scripts/novo-wrapper.mjs', `lancaProcSync('${TK}', ['/PID', '1', '/T', '/F']);`),
    'cmd /c, num ficheiro novo': com('tests/critico/x-r0/novo.mjs', `spawnSync('cmd', ['/c', '${TK} /PID 123 /T /F']);`),
    'kill() de um handle, num ficheiro novo': com('tests/critico/x-r0/novo2.mjs', 'filho' + '.kill();'),
    'um uso a menos num ficheiro classificado': new Map([...base, ['scripts/corpus.test.mjs', (base.get('scripts/corpus.test.mjs') ?? '').replace(/\.kill\(/g, '.parar(')]]),
  };
  assert.deepEqual(problemas(base), [], 'a base está limpa');
  for (const [nome, ficheiros] of Object.entries(plantados)) assert.notDeepEqual(problemas(ficheiros), [], `não apanhou: ${nome}`);
});

// --- o filho instrumentado (C2 e C3 dos helpers) ---
// as chamadas ficam registadas; com simula(true) não se executam e a sonda de existência diz sempre que o PID existe (= foi reciclado)
const INSTRUMENTA = `
import { createRequire } from 'node:module';
import * as modulo from 'node:module';
const require = createRequire(import.meta.url);
const cp = require('node:child_process');
const chamadas = [];
let simula = false;
const spawnSyncReal = cp.spawnSync;
cp.spawnSync = (cmd, args, ...resto) => {
  if (/${'task' + 'kill'}/i.test(String(cmd))) { chamadas.push({ via: 'comando', pid: Number(args[args.indexOf('/PID') + 1]) }); if (simula) return { status: 0 }; }
  return spawnSyncReal(cmd, args, ...resto);
};
modulo.syncBuiltinESMExports();
const matarReal = process['ki' + 'll'].bind(process);
process['ki' + 'll'] = (pid, sinal = 'SIGTERM') => {
  if (sinal === 0) return simula ? true : matarReal(pid, 0);
  chamadas.push({ via: 'sinal', pid: Math.abs(pid), sinal });
  return simula ? true : matarReal(pid, sinal);
};
globalThis.__i = { chamadas, simula: (v) => { simula = v; }, matarReal };
`;
const CENARIO_V06 = `
await import(process.env.INSTRUMENTA);
const h = await import(process.env.HELPERS);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const m = h.montaCenario(h.corpus().find((c) => c.nome === 'reprovado'));
const saida = {};
if (process.env.MODO === 'saiu-logo') {
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
if (process.env.MODO !== 'saiu-logo') { await espera(1500); saida.vivos = saida.chamadas.map((c) => c.pid).filter((pid) => { try { globalThis.__i.matarReal(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }); }
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
const vivos = globalThis.__i.chamadas.map((c) => c.pid).filter((pid) => { try { globalThis.__i.matarReal(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } });
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
test('C2 e C3 (f-12-r0): o fechar() mata o browser que ainda corre e, depois de ele sair, não mata ninguém', { timeout: 300000 }, (t) => {
  // o Chrome recusa o pipe de DevTools com um USERPROFILE falso (o executor põe um a cada unidade; o manifesto do f-12-r0 pede o real): usa-se o do sistema
  const r = filho(CENARIO_F12, 'tests/critico/f-12-r0/helpers.mjs', { USERPROFILE: userInfo().homedir });
  if (r.semBrowser) return t.skip(r.semBrowser);
  assert.ok(r.primeira >= 1, 'o fechar() não matou o browser que ainda corria');
  assert.deepEqual(r.vivos, [], `o browser ficou vivo: ${r.vivos}`);
  assert.equal(r.segunda, 0, `o 2.º fechar() matou um PID que já saíra: ${JSON.stringify(r.chamadas)}`);
});

// --- C5: o executor ---
// O espião é pré-carregado por NODE_OPTIONS no executor (o `node --test` de uma unidade não carrega pré-carregamentos): regista cada morte e deixa-a passar.
// Com SPY_SEGURA adia o evento `close` das unidades em 5 s, que é o que um descendente (um browser) que segura os pipes faz: o `exit` chega primeiro, a
// unidade sai aos ~2 s, o relógio do limite (3 s) cai dentro da folga de 2 s que o executor espera antes de a dar por acabada.
const ESPIAO = `
import { createRequire } from 'node:module';
import * as modulo from 'node:module';
import { appendFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const log = (o) => appendFileSync(process.env.SPY_LOG, JSON.stringify(o) + '\\n');
if (/executor\\.mjs$/.test(process.argv[1] ?? '')) {
  const cp = require('node:child_process');
  const real = cp.spawnSync;
  cp.spawnSync = (c, a, ...r) => { if (/${'task' + 'kill'}/i.test(String(c))) log({ pid: Number(a[a.indexOf('/PID') + 1]) }); return real(c, a, ...r); };
  if (process.env.SPY_SEGURA) {
    const spawnReal = cp.spawn;
    cp.spawn = (...a) => {
      const p = spawnReal(...a);
      if (!String(a[1]?.join(' ')).includes('--test')) return p;
      const emite = p.emit.bind(p);
      p.emit = (ev, ...r) => (ev === 'close' ? (setTimeout(() => emite(ev, ...r), 5000), true) : emite(ev, ...r));
      return p;
    };
  }
  modulo.syncBuiltinESMExports();
  const matar = process['ki' + 'll'].bind(process);
  process['ki' + 'll'] = (pid, s = 'SIGTERM') => { if (s !== 0) log({ pid: Math.abs(pid) }); return matar(pid, s); };
}
`;
function corridaExecutor({ unidade, limite_s, segura }) {
  const d = mkdtempSync(join(tmpdir(), 'f31-exec-'));
  try {
    const repo = join(d, 'repo'), temp = join(d, 'temp'), log = join(d, 'espiao.jsonl'), espiao = join(d, 'espiao.mjs');
    mkdirSync(join(repo, 'scripts'), { recursive: true }); mkdirSync(join(repo, 's')); mkdirSync(temp);
    writeFileSync(espiao, ESPIAO);
    writeFileSync(join(repo, '.gitignore'), '.forge/\n');
    writeFileSync(join(repo, 'scripts/suites.json'), JSON.stringify({ versao: 1, paralelo: 1, vagas_globais: 2, carga_sensivel: 2, orcamento_s: 90,
      suites: [{ nome: 'u', tipo: 'node-test', ficheiros: ['s/*.test.mjs'], limite_s }] }));
    writeFileSync(join(repo, 's/a.test.mjs'), unidade);
    const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@x.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, encoding: 'utf8' });
    git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'base');
    const env = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, SPY_LOG: log, NODE_OPTIONS: `--import=${pathToFileURL(espiao).href}`, ...(segura ? { SPY_SEGURA: '1' } : {}) };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/executor.mjs'), '--suites', 'u', '--raiz', repo], { cwd: repo, env, encoding: 'utf8', timeout: 150000, windowsHide: true });
    const pasta = join(repo, '.forge', 'resultados');
    const res = existsSync(pasta) ? readdirSync(pasta).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(join(pasta, n), 'utf8'))) : [];
    const pid = res[0]?.unidades?.[0]?.pid;
    assert.ok(Number.isInteger(pid), `o executor não deixou a unidade com PID (código ${r.status}):\n${(r.stdout ?? '').slice(-800)}\n${(r.stderr ?? '').slice(-800)}`);
    const mortes = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).pid) : [];
    return { pid, mortes, estado: res[0].unidades[0].estado };
  } finally { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}
// a unidade espera até aos ~1,8 s do processo dela, para sair ~1 s antes do limite de 3 s
const PASSA = "import test from 'node:test';\ntest('a', async () => { while (process.uptime() < 1.8) await new Promise((r) => setTimeout(r, 50)); });\n";
test('C5: o filho da unidade sai ~1 s antes do limite, dentro da folga de 2 s do exit: o executor não o mata', { timeout: 200000 }, () => {
  const r = corridaExecutor({ unidade: PASSA, limite_s: 3, segura: true });
  assert.deepEqual(r.mortes.filter((p) => p === r.pid), [], `o executor matou o PID ${r.pid} depois de a unidade sair (mortes: ${r.mortes})`);
});
test('C5 (controlo): uma unidade pendurada continua a ser morta no limite, com a árvore', { timeout: 200000 }, () => {
  const r = corridaExecutor({ unidade: "import test from 'node:test';\ntest('a', () => new Promise(() => setInterval(() => {}, 1000)));\n", limite_s: 2, segura: false });
  assert.ok(r.mortes.includes(r.pid), `o executor não matou a unidade pendurada ${r.pid}`);
  assert.equal(r.estado, 'limite');
  assert.throws(() => process['ki' + 'll'](r.pid, 0), 'a unidade pendurada ficou viva');
});
