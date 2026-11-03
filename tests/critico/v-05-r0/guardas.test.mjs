// Ronda −1 do V-05 (#129): guardas dos oráculos, verdes na base (não precisam do check-ticket). Provam que cada fixture do corpus faz o que o
// cenário diz quando se corre o node --test e o git à mão, e que o gh falso regista o argv exato sem mexer nos outros node. Assim, um
// check-ticket que dá a linha errada num cenário está errado, e não a fixture.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CENARIOS } from './cenarios.mjs';
import { cenario, ambiente, git, gitOk, ghFalso, tokensFalsos, RAMO, MAPA, PASSOS, linhas, limpa } from './helpers.mjs';

after(limpa);

const por = Object.fromEntries(CENARIOS.map((c) => [c.id, c]));
const monta = (id) => cenario(por[id].ramo, por[id].sujo);
// corre os ficheiros de uma suíte do cenário como o executor os corre (cwd na raiz, sem NODE_TEST_CONTEXT); devolve o status e o TAP
const suite = (d, glob) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', glob], { cwd: d, encoding: 'utf8', env: ambiente(), timeout: 120000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const SUITES = ['scripts/*.test.mjs', 'tests/critico/a-r0/*.test.mjs', 'tests/critico/c-r0/*.test.mjs'];

test('guarda: o corpus tem os cenários (a) a (g) do C1, ≥ 7, e cada um diz o código e, quando é vermelho, pelo menos um passo FAIL', () => {
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) assert.ok(por[id], `falta o cenário (${id})`);
  assert.ok(CENARIOS.length >= 7);
  for (const c of CENARIOS) {
    assert.ok([0, 1].includes(c.codigo), c.id);
    if (c.codigo === 1) assert.ok(Object.keys(c.fail ?? {}).length > 0, `${c.id}: vermelho sem FAIL esperado`);
    for (const p of [...(c.ok ?? []), ...Object.keys(c.fail ?? {})]) assert.ok(PASSOS.includes(p), `${c.id}: passo ${p}`);
  }
});

test('guarda: o mapa do cenário segue a §4.3 (versao 1, regras com caminhos e suítes não vazias) e a regra das mutações é esquema: true só da c-r0', () => {
  assert.equal(MAPA.versao, 1);
  for (const r of MAPA.regras) { assert.ok(r.caminhos.length > 0); assert.ok(r.suites.length > 0); }
  assert.deepEqual(MAPA.regras.filter((r) => r.esquema).map((r) => [r.caminhos, r.suites]), [[['scripts/corpus/mutations/**'], ['c-r0']]]);
});

test('guarda: na base do cenário, as 3 suítes (com os lints guardas-critico e do mapa) passam, a árvore está limpa e o ramo é o do ticket', () => {
  const d = cenario();
  for (const g of SUITES) { const r = suite(d, g); assert.equal(r.status, 0, `${g}\n${r.out.slice(-2000)}`); }
  assert.equal(gitOk(d, 'status', '--porcelain'), '');
  assert.equal(gitOk(d, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), RAMO);
  assert.equal(gitOk(d, 'rev-parse', 'origin/main').trim(), gitOk(d, 'rev-parse', 'main').trim());
});

test('guarda: (a) e (j) ficam verdes em todas as suítes; (c) parte a a-r0 e (g) parte a c-r0, sem partir as outras', () => {
  for (const id of ['a', 'j']) { const d = monta(id); for (const g of SUITES) assert.equal(suite(d, g).status, 0, `${id} ${g}`); }
  const c = monta('c');
  assert.notEqual(suite(c, SUITES[1]).status, 0, '(c) a a-r0 não falha');
  assert.equal(suite(c, SUITES[2]).status, 0);
  const g = monta('g');
  assert.notEqual(suite(g, SUITES[2]).status, 0, '(g) a c-r0 não falha com o seed');
  assert.equal(suite(g, SUITES[1]).status, 0);
  assert.equal(suite(g, SUITES[0]).status, 0, '(g) os lints do cenário têm de passar');
});

test('guarda: (d) passa no ramo (origin/main = base) e falha com main = origin/main = HEAD; (k) passa no ramo e faz skip com o motivo na main', () => {
  for (const id of ['d', 'k']) {
    const d = monta(id), f = `tests/critico/a-r0/${id}.test.mjs`;
    const noRamo = suite(d, f);
    assert.equal(noRamo.status, 0, `${id} no ramo:\n${noRamo.out.slice(-1500)}`);
    assert.match(noRamo.out, /^# pass 1$/m, id);
    gitOk(d, 'checkout', '-q', '-B', 'main');
    gitOk(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const depois = suite(d, f);
    if (id === 'd') assert.notEqual(depois.status, 0, '(d) não falha depois do merge');
    else { assert.equal(depois.status, 0, depois.out.slice(-1500)); assert.match(depois.out, /# SKIP âmbito do t-01/); }
  }
});

test('guarda: (e) parte o guardas-critico do cenário com L2 no e.test.mjs; (k), que chama o soNoTicket, não o parte', () => {
  const e = suite(monta('e'), 'scripts/guardas-critico.test.mjs');
  assert.notEqual(e.status, 0);
  assert.match(e.out, /L2 tests\/critico\/a-r0\/e\.test\.mjs/);
  assert.equal(suite(monta('k'), 'scripts/guardas-critico.test.mjs').status, 0);
});

test('guarda: (b) muda o README.md e o x.test.mjs contra o merge-base; (f) e (f2) ficam sujos com o ramo commitado; (h) tem o mapa ilegível; (i) deixa a c-r0 sem ficheiros', () => {
  const nomes = (d) => gitOk(d, 'diff-tree', '-r', '--name-only', gitOk(d, 'merge-base', 'HEAD', 'origin/main').trim(), 'HEAD').split(/\r?\n/).filter(Boolean).sort();
  assert.deepEqual(nomes(monta('b')), ['README.md', 'tests/critico/a-r0/x.test.mjs']);
  for (const id of ['f', 'f2']) {
    const d = monta(id);
    assert.notEqual(gitOk(d, 'status', '--porcelain').trim(), '', id);
    assert.deepEqual(nomes(d), ['tests/critico/a-r0/x.test.mjs'], id);
  }
  const h = monta('h');
  assert.throws(() => JSON.parse(readFileSync(join(h, 'scripts/mapa-suites.json'), 'utf8')));
  assert.notEqual(suite(h, 'scripts/mapa-suites.test.mjs').status, 0);
  const i = monta('i');
  assert.deepEqual(readdirSync(join(i, 'tests/critico/c-r0')).filter((n) => n.endsWith('.test.mjs')), []);
  assert.equal(git(i, 'status', '--porcelain').stdout, '');
});

test('guarda: o gh falso regista o argv exato (com aspas, &, %, $() e uma quebra de linha), não regista o ambiente, e os outros node correm normalmente', () => {
  const gh = ghFalso(), tok = tokensFalsos();
  const corpo = 'CHECK-TICKET: VERDE "x" & %PATH% $(y) --body\nlinha 2';
  const r = spawnSync(gh.bin, ['pr', 'comment', '7', '--body', corpo], { encoding: 'utf8', env: ambiente({ ...gh.env, ...tok }), timeout: 60000 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(gh.chamadas(), [{ argv: ['pr', 'comment', '7', '--body', corpo] }]);
  const n = spawnSync(process.execPath, ['-e', 'console.log("node normal")'], { encoding: 'utf8', env: ambiente({ ...gh.env, ...tok }), timeout: 60000 });
  assert.equal(n.stdout.trim(), 'node normal', n.stderr);
  assert.equal(gh.chamadas().length, 1, 'o node normal ficou registado como gh');
  const log = readFileSync(gh.log, 'utf8');
  for (const v of Object.values(tok)) assert.ok(!log.includes(v), 'o registo do gh falso tem o token');
});

test('guarda: o leitor das linhas dos passos aceita «ok <passo>» e «FAIL <passo> (detalhe)» e ignora o resto', () => {
  const out = ['executor: 3/3 unidades', 'ok árvore limpa', 'ok lint', 'FAIL âmbito (README.md, docs/x.md)', 'ok afetadas no ramo (a-r0)', 'FAIL pós-merge (a-r0: 1 fail (ver log))', 'ok esquema', 'FAIL outra coisa'].join('\n');
  assert.deepEqual(linhas(out).map((l) => [l.estado, l.passo, l.detalhe]), [
    ['ok', 'árvore limpa', ''], ['ok', 'lint', ''], ['FAIL', 'âmbito', 'README.md, docs/x.md'], ['ok', 'afetadas no ramo', 'a-r0'], ['FAIL', 'pós-merge', 'a-r0: 1 fail (ver log)'], ['ok', 'esquema', ''],
  ]);
});