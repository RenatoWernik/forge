// V-03 critério C1 (o inventário) e a fase 2 do executor (spec §4.4), num mini-repo git temporário com o scripts/executor.mjs e os outros
// módulos de scripts/ deste repo, o tests/critico/_comum/ deste repo e duas suítes:
//   alvo-r0/a.test.mjs: alfa-um, alfa-dois, alfa-tres e o grupo-gama com gama-um e gama-dois (5 testes);
//   lote-r0/r.test.mjs: «lote: o alvo (a*) continua verde» (pass ≥ 4) e «lote: o alvo (a*) continua verde, sem lote», que conta as vezes
//   que corre num ficheiro fora do repo. «antes»: o primeiro corre o alvo num filho `node --test`, como os regressao de hoje; «depois»:
//   chama doLote(t, 'alvo-r0').
// Oráculos:
//   - depois, limpo: o executor sai com 0, a unidade do lote fica pass sem falhas, o teste «sem lote» corre UMA vez (o --test-name-pattern da
//     fase 2 é exato: ancorado e escapado, e o título tem parênteses e um asterisco) e o inventário (antes → depois) sai com 0;
//   - depois sem alfa-dois, sem gama-um (nome completo, dentro do grupo), com alfa-tres a falhar ou com alfa-um num skip novo: o inventário
//     sai ≠ 0 e nomeia o teste (leitura da PERGUNTA 1); com alfa-tres a falhar, o teste do lote FALHA na fase 2 e o executor sai com 1.
// Cada executor corre com um TEMP próprio: as vagas globais ficam lá dentro, nunca as da máquina.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { soNoTicket } from '../_comum/ambito.mjs';
import { ROOT, crit, tmp, limpa, ambiente, git, lerJson } from './helpers.mjs';

after(limpa);
const INVENTARIO = join(ROOT, 'scripts', 'inventario.mjs');
const LOTE = join(ROOT, crit('_comum', 'lote.mjs'));
const TITULO = 'lote: o alvo (a*) continua verde';

const alvo = (o = {}) => ["import { test, describe } from 'node:test';",
  o.skip ? "test('alfa-um', (t) => t.skip('motivo novo'));" : "test('alfa-um', () => {});",
  o.semDois ? '' : "test('alfa-dois', () => {});",
  o.falha ? "test('alfa-tres', () => { throw new Error('alfa-tres falha'); });" : "test('alfa-tres', () => {});",
  "describe('grupo-gama', () => {", o.semGama ? '' : "  test('gama-um', () => {});", "  test('gama-dois', () => {});", '});', ''].join('\n');
const asserts = "assert.equal(r.status, 0, r.out); assert.ok(r.pass >= 4, r.out);";
const lote = (depois) => ["import { test } from 'node:test';", "import assert from 'node:assert/strict';", "import { spawnSync } from 'node:child_process';",
  "import { appendFileSync } from 'node:fs';", depois ? "import { doLote } from '../_comum/lote.mjs';" : '',
  "const ALVO = ['tests', 'critico', 'alvo-r0', 'a.test.mjs'].join('/');",
  "const corre = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; const r = spawnSync(process.execPath, ['--' + 'test', '--test-reporter=tap', ALVO], { encoding: 'utf8', env }); const out = (r.stdout || '') + (r.stderr || ''); return { status: r.status, out, pass: +(out.match(/^# pass (\\d+)/m) || [])[1] }; };",
  depois ? `test(${JSON.stringify(TITULO)}, (t) => { const r = doLote(t, 'alvo-r0'); if (!r) return; ${asserts} });` : `test(${JSON.stringify(TITULO)}, () => { const r = corre(); ${asserts} });`,
  `test(${JSON.stringify(TITULO + ', sem lote')}, () => { appendFileSync(process.env.V03_CONTADOR, 'x\\n'); });`, ''].join('\n');
const MANIFESTO = { versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 4, orcamento_s: 200, suites: [
  { nome: 'alvo-r0', tipo: 'node-test', ficheiros: [crit('alvo-r0', '*.test.mjs')], limite_s: 90 },
  { nome: 'lote-r0', tipo: 'node-test', ficheiros: [crit('lote-r0', '*.test.mjs')], limite_s: 90 }] };

let mini = null;
const escreve = (rel, txt) => { mkdirSync(dirname(join(mini, rel)), { recursive: true }); writeFileSync(join(mini, rel), txt); };
// grava a versão, faz commit e corre o executor (--todas); devolve { status, out, sha, res (o JSON), ficheiro, vezes (do «sem lote») }
function versao(nome, o, depois) {
  escreve(crit('alvo-r0', 'a.test.mjs'), alvo(o));
  escreve(crit('lote-r0', 'r.test.mjs'), lote(depois));
  git(mini, ['add', '-A']); git(mini, ['commit', '-q', '--allow-empty', '-m', nome]);
  const sha = git(mini, ['rev-parse', 'HEAD']).trim(), t = tmp('v03-exec-'), contador = join(t, 'contador.txt');
  writeFileSync(contador, '');
  const r = spawnSync(process.execPath, ['scripts/executor.mjs', '--todas'], { cwd: mini, encoding: 'utf8', timeout: 240000,
    env: ambiente({ TEMP: t, TMP: t, TMPDIR: t, V03_CONTADOR: contador }) });
  const ficheiro = join(mini, '.forge', 'resultados', `${sha}-limpa-p1.json`);
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), sha, ficheiro, res: existsSync(ficheiro) ? lerJson(ficheiro) : null,
    vezes: readFileSync(contador, 'utf8').split('\n').filter(Boolean).length };
}
const inventario = (antes, depois) => {
  const r = spawnSync(process.execPath, ['scripts/inventario.mjs', '--antes', antes, '--depois', depois], { cwd: mini, encoding: 'utf8', env: ambiente(), timeout: 60000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const unidadeLote = (v) => v.res?.unidades.find((u) => u.ficheiro === crit('lote-r0', 'r.test.mjs'));

let A = null;
const V = {};
before(() => {
  if (!existsSync(LOTE) || !existsSync(INVENTARIO)) return;
  mini = join(tmp('v03-mini-'), 'r');
  for (const f of globSync('scripts/*.mjs', { cwd: ROOT }).filter((x) => !x.endsWith('.test.mjs'))) escreve(f.replaceAll('\\', '/'), readFileSync(join(ROOT, f)));
  cpSync(join(ROOT, crit('_comum')), join(mini, crit('_comum')), { recursive: true });
  escreve('scripts/suites.json', JSON.stringify(MANIFESTO, null, 2));
  escreve('.gitignore', '.forge/\n');
  git(mini, ['init', '-q']);
  A = versao('antes', {}, false);
  for (const [k, o] of Object.entries({ limpo: {}, semDois: { semDois: true }, semGama: { semGama: true }, falha: { falha: true }, skip: { skip: true } })) V[k] = versao(k, o, true);
});
const exige = () => {
  assert.ok(existsSync(LOTE), 'falta tests/critico/_comum/lote.mjs');
  assert.ok(existsSync(INVENTARIO), 'falta scripts/inventario.mjs');
  assert.equal(A.status, 0, 'controlo: o executor da versão «antes» (filho aninhado) sai com 0\n' + A.out.slice(-2000));
  assert.ok(A.res, 'controlo: a versão «antes» não gravou o resultado');
};

test('fase 2: depois, limpo, o executor sai com 0, a unidade do lote fica pass e o teste do lote corre na fase 2', () => {
  exige();
  const v = V.limpo;
  assert.equal(v.status, 0, v.out.slice(-2500));
  const u = unidadeLote(v);
  assert.ok(u, 'sem a unidade do r.test.mjs no resultado');
  assert.equal(u.estado, 'pass', JSON.stringify(u));
  assert.equal(u.fail, 0, JSON.stringify(u));
  assert.equal(v.res.completo, true);
});
test('fase 2: o --test-name-pattern é exato (ancorado e escapado): o teste «sem lote», cujo título começa pelo do lote, corre uma só vez', () => {
  exige();
  assert.equal(A.vezes, 1, 'controlo: na versão «antes» corre uma vez');
  assert.equal(V.limpo.vezes, 1, 'o teste sem lote correu ' + V.limpo.vezes + ' vezes');
});
test('fase 2: com alfa-tres a falhar no alvo, o teste do lote FALHA na fase 2 (a unidade fica com fail > 0) e o executor sai com 1', () => {
  exige();
  const v = V.falha, u = unidadeLote(v);
  assert.equal(v.status, 1, v.out.slice(-2500));
  assert.ok(u && u.fail > 0 && u.estado !== 'pass', 'a unidade do lote: ' + JSON.stringify(u));
});
test('C1: inventário antes → depois limpo sai com 0 (o skip do lote resolvido na fase 2 não conta como skip novo)', () => {
  exige();
  const r = inventario(A.ficheiro, V.limpo.ficheiro);
  assert.equal(r.status, 0, r.out.slice(-2500));
});
for (const [k, nome, o] of [['semDois', 'alfa-dois', 'um teste apagado'], ['semGama', 'gama-um', 'um teste apagado dentro do grupo (nome completo)'],
  ['falha', 'alfa-tres', 'um teste ok que deixa de ter execução ok'], ['skip', 'alfa-um', 'um skip novo com outro motivo']]) {
  test(`C1: inventário antes → depois com ${o} sai ≠ 0 e nomeia «${nome}»`, () => {
    exige();
    assert.ok(V[k].res, `a versão ${k} não gravou o resultado\n` + V[k].out.slice(-1500));
    const r = inventario(A.ficheiro, V[k].ficheiro);
    assert.notEqual(r.status, 0, r.out.slice(-2500));
    assert.ok(r.out.includes(nome), `a saída não nomeia ${nome}:\n` + r.out.slice(-2500));
  });
}
test('ÂMBITO: C1 real — o inventário do «antes» do V-01 C5 (FORGE_V03_ANTES) ao resultado do V-03 (FORGE_V03_DEPOIS) sai com 0', (t) => {
  if (soNoTicket(t, 'v-03')) return;
  const [antes, depois] = [process.env.FORGE_V03_ANTES, process.env.FORGE_V03_DEPOIS];
  if (!antes || !depois) return t.skip('C1 real: FORGE_V03_ANTES e FORGE_V03_DEPOIS não definidos (verificado pelo crítico da R1)');
  const r = spawnSync(process.execPath, [INVENTARIO, '--antes', antes, '--depois', depois], { cwd: ROOT, encoding: 'utf8', env: ambiente(), timeout: 120000, maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, ((r.stdout || '') + (r.stderr || '')).slice(-3000));
});