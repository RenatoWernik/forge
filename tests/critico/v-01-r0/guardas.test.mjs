// Ronda −1 do V-01 (#125): guardas dos oráculos. Verdes na base: provam que as fixtures, o validador e o arnês dizem o que o contrato diz,
// e que cada ataque morde (um executor que deixa passar o NODE_TEST_CONTEXT, ou que mata só o filho, é apanhado).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, globSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, repo, lerJson, ambiente, contagensTap, sobreposicaoMax, validaResultado, esperaAte, espera, vivo, registaPid, mataArvore, limpa } from './helpers.mjs';

after(limpa);

const CASOS = readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

test('guarda: cada caso de scripts/fixtures/executor/ tem um manifesto v1 e cada `ficheiros` casa com ficheiros do caso', () => {
  assert.ok(CASOS.length >= 10, `só ${CASOS.length} casos`);
  for (const c of CASOS) {
    const m = lerJson(join(FIXTURES, c, 'scripts/suites.json'));
    assert.equal(m.versao, 1, c);
    for (const k of ['paralelo', 'vagas_globais', 'carga_sensivel', 'orcamento_s']) assert.ok(Number.isInteger(m[k]) && m[k] > 0, `${c}: ${k}`);
    for (const s of m.suites) {
      assert.equal(s.tipo, 'node-test', `${c}/${s.nome}`);
      assert.ok(s.limite_s <= m.orcamento_s, `${c}/${s.nome}: limite_s maior do que o orçamento`);
      assert.ok(s.ficheiros.flatMap((g) => globSync(g, { cwd: join(FIXTURES, c) })).length > 0, `${c}/${s.nome}: nenhum ficheiro`);
    }
  }
});

test('guarda: o TAP do node para contagens/mista dá # pass 3, # fail 1, # skipped 2, # todo 1, com os motivos motivo-um e motivo-dois', () => {
  const d = repo('contagens');
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'mista/m.fx.mjs'], { cwd: d, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  assert.deepEqual(contagensTap(r.stdout), { pass: 3, fail: 1, skip: 2, todo: 1 }, r.stdout);
  assert.match(r.stdout, /^ok \d+ - s1 # SKIP motivo-um$/m);
  assert.match(r.stdout, /^ok \d+ - s2 # SKIP motivo-dois$/m);
});

test('guarda: um node --test com NODE_TEST_CONTEXT herdado não corre nada e sai com 0, por isso o C1 apanha um executor que o deixa passar', () => {
  const d = repo('env');
  const com = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'sonda/a.fx.mjs'], { cwd: d, encoding: 'utf8', env: ambiente({ NODE_TEST_CONTEXT: 'child-v8' }), timeout: 60000 });
  assert.equal(com.status, 0);
  assert.equal(existsSync(join(d, '.sonda/env-sonda_a.fx.mjs.json')), false, 'a sonda correu com NODE_TEST_CONTEXT herdado');
  assert.equal(contagensTap(com.stdout).pass, null);
  const sem = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'sonda/a.fx.mjs'], { cwd: d, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  assert.equal(sem.status, 0, sem.stdout + sem.stderr);
  assert.ok(existsSync(join(d, '.sonda/env-sonda_a.fx.mjs.json')));
  assert.equal(contagensTap(sem.stdout).pass, 1);
  assert.match(sem.stdout, /^# SONDA \{/m, 'a sonda imprime o env no TAP');
});

test('guarda: matar só o filho node --test deixa o neto vivo, por isso o C2 só passa matando a árvore', async () => {
  const d = repo('arvore');
  const filho = spawn(process.execPath, ['--test', '--test-reporter=tap', 'pendura/n.fx.mjs'], { cwd: d, env: ambiente(), stdio: 'ignore', windowsHide: true });
  registaPid(filho.pid);
  const f = join(d, '.sonda/pids.json');
  assert.ok(await esperaAte(() => existsSync(f), 30000), 'a fixture pendura não gravou os PIDs');
  await espera(300);
  const pids = lerJson(f);
  for (const k of ['neto', 'corredor']) registaPid(pids[k]);
  assert.equal(pids.pai, filho.pid, 'o pai do processo do ficheiro de teste é o filho node --test');
  process.kill(filho.pid);
  await esperaAte(() => !vivo(filho.pid), 10000);
  await espera(1000);
  assert.equal(vivo(pids.neto), true, 'o neto morreu com o filho: a fixture não prova que é preciso matar a árvore');
});

test('guarda: matar a árvore do filho (taskkill /PID /T no Windows, o grupo em POSIX) mata o corredor e o neto, por isso o C2 é possível', async () => {
  const d = repo('arvore');
  const filho = spawn(process.execPath, ['--test', '--test-reporter=tap', 'pendura/n.fx.mjs'], { cwd: d, env: ambiente(), stdio: 'ignore', windowsHide: true,
    detached: process.platform !== 'win32' });
  registaPid(filho.pid);
  const f = join(d, '.sonda/pids.json');
  assert.ok(await esperaAte(() => existsSync(f), 30000), 'a fixture pendura não gravou os PIDs');
  await espera(300);
  const pids = lerJson(f);
  for (const k of ['neto', 'corredor']) registaPid(pids[k]);
  mataArvore(filho.pid);
  assert.ok(await esperaAte(() => !vivo(pids.neto) && !vivo(pids.corredor) && !vivo(filho.pid), 5000), 'a árvore não morreu em 5 s');
});

test('guarda: a varredura de intervalos conta o máximo aberto ao mesmo tempo, e um fim no instante de um início fecha primeiro', () => {
  const i = (ini, fim) => ({ ini, fim });
  assert.equal(sobreposicaoMax([]), 0);
  assert.equal(sobreposicaoMax([i(0, 3), i(1, 4), i(2, 5)]), 3);
  assert.equal(sobreposicaoMax([i(0, 2), i(2, 4), i(4, 6)]), 1);
  assert.equal(sobreposicaoMax([i(0, 10), i(1, 2), i(3, 4), i(5, 6)]), 2);
  assert.equal(sobreposicaoMax([i(0, 10), i(1, 2), i(3, 9)], 2.5, 3.5), 2);
});

test('guarda: o validador aceita o exemplo da spec §4.2 e rejeita pid em falta, árvore sem hash, contagens da suíte erradas e estado inválido', () => {
  const u = { suite: 'f-02-r0', ficheiro: 'tests/critico/f-02-r0/c2-mutacoes.test.mjs', bloco: null, estado: 'pass', pass: 4, fail: 0, skip: 0, todo: 0,
    skips: [{ teste: 'x', motivo: 'y' }], duracoes: { x: 1234 }, duracao_s: 118.2, concorrentes_max: 3, pid: 1234, inicio: '2026-11-01T10:00:00.000Z',
    tap: '.forge/resultados/logs/f-02-r0.tap' };
  const r = { versao: 1, sha: 'a'.repeat(40), arvore: 'limpa', node: 'v24.22.1', comando: 'node scripts/executor.mjs --todas',
    inicio: '2026-11-01T10:00:00.000Z', fim: '2026-11-01T10:05:00.000Z', completo: true, unidades: [u],
    suites: { 'f-02-r0': { estado: 'pass', pass: 4, fail: 0, skip: 0 } } };
  assert.deepEqual(validaResultado(r), []);
  assert.deepEqual(validaResultado({ ...r, arvore: 'suja:' + 'b'.repeat(64) }), []);
  const sem = (o, k) => { const c = { ...o }; delete c[k]; return c; };
  assert.ok(validaResultado({ ...r, unidades: [sem(u, 'pid')] }).some((x) => x.includes('pid')));
  assert.ok(validaResultado({ ...r, unidades: [sem(u, 'inicio')] }).some((x) => x.includes('inicio')));
  assert.ok(validaResultado({ ...r, arvore: 'suja:xyz' }).some((x) => x.includes('arvore')));
  assert.ok(validaResultado({ ...r, suites: { 'f-02-r0': { estado: 'pass', pass: 5, fail: 0, skip: 0 } } }).some((x) => x.includes('suites.f-02-r0.pass')));
  assert.ok(validaResultado({ ...r, unidades: [{ ...u, estado: 'ok' }] }).some((x) => x.includes('estado')));
  assert.ok(validaResultado({ ...r, unidades: [{ ...u, estado: 'em_curso' }] }).some((x) => x.includes('completo')));
});