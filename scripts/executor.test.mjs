// Testes do executor paralelo (V-01, #125): o TAP, os estados e o uso da linha de comandos. O comportamento (isolamento, limite, retoma, vagas)
// é provado pelos ataques de tests/critico/v-01-r0/. Os executores lançados aqui têm um TEMP privado: não tocam nas vagas da máquina.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estadoDe, estadoSuite, lerTap } from './executor.mjs';

const EXECUTOR = fileURLToPath(new URL('./executor.mjs', import.meta.url));
const pastas = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'forge-exec-teste-')); pastas.push(d); return d; };
after(() => { for (const d of pastas) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

const TAP = `TAP version 13
# Subtest: a
ok 1 - a
  ---
  duration_ms: 1.7
  ...
# Subtest: b
ok 2 - b # SKIP porque sim
  ---
  duration_ms: 0.2
  ...
not ok 3 - c
  ---
  duration_ms: 12
  ...
ok 4 - d # TODO depois
1..4
# tests 4
# pass 1
# fail 1
# skipped 1
# todo 1
`;

test('lerTap: contagens das linhas # pass|fail|skipped|todo, motivos de # SKIP e duration_ms por teste', () => {
  const c = lerTap(TAP);
  assert.deepEqual([c.pass, c.fail, c.skip, c.todo], [1, 1, 1, 1]);
  assert.deepEqual(c.skips, [{ teste: 'b', motivo: 'porque sim' }]);
  assert.deepEqual(c.duracoes, { a: 2, b: 0, c: 12 });
  assert.deepEqual(lerTap('sem resumo').pass, null);
});

test('estadoDe: sem contagens, sem nenhum teste ou saída ≠ 0 sem falhas é «erro» (falso verde), nunca «pass»', () => {
  const c = (pass, fail, skip = 0, todo = 0) => ({ pass, fail, skip, todo });
  assert.equal(estadoDe(0, c(3, 0)), 'pass');
  assert.equal(estadoDe(0, c(0, 0, 1)), 'pass');
  assert.equal(estadoDe(1, c(3, 1)), 'fail');
  assert.equal(estadoDe(1, c(3, 0)), 'erro');
  assert.equal(estadoDe(0, c(0, 0)), 'erro');
  assert.equal(estadoDe(0, { pass: null, fail: null }), 'erro');
});

test('estadoSuite: o pior das unidades; «em_curso» enquanto faltar alguma por correr', () => {
  assert.equal(estadoSuite(['pass', 'pass'], false), 'pass');
  assert.equal(estadoSuite(['pass', 'pass'], true), 'em_curso');
  assert.equal(estadoSuite(['pass', 'limite', 'fail'], true), 'fail');
  assert.equal(estadoSuite(['pass', 'erro'], false), 'erro');
});

// um bloco que não cobre um teste do ficheiro deixa-o por correr sem ninguém ver (risco 1 da spec): todo `test('título'` estático do ficheiro
// com blocos tem de casar com algum bloco. O --test-name-pattern casa com o nome do teste e dos pais (a raiz tem nome vazio), por isso
// um padrão negativo `^(?!...)` casaria tudo e não serve de «resto»: os blocos enumeram-se.
test('blocos do manifesto: todo o teste do ficheiro casa com algum bloco, e cada bloco casa com algum teste', () => {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const comBlocos = JSON.parse(readFileSync(join(raiz, 'scripts/suites.json'), 'utf8')).suites.filter((s) => s.blocos);
  assert.ok(comBlocos.length > 0);
  for (const s of comBlocos) {
    for (const [f, blocos] of Object.entries(s.blocos)) {
      const titulos = [...readFileSync(join(raiz, f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].map((m) => m[2]);
      assert.ok(titulos.length > 0, `${f}: nenhum test('...') estático`);
      const padroes = blocos.map((b) => b.padrao ?? b), res = padroes.map((b) => new RegExp(b));
      assert.deepEqual(titulos.filter((t) => !res.some((r) => r.test(t))), [], `${f}: testes fora de todos os blocos`);
      assert.deepEqual(padroes.filter((b, i) => !titulos.some((t) => res[i].test(t))), [], `${f}: blocos que não casam com nenhum teste`);
    }
  }
});

const executor = (raiz, ...args) => {
  const t = tmp();
  return spawnSync(process.execPath, [EXECUTOR, ...args, '--raiz', raiz], { cwd: raiz, encoding: 'utf8', timeout: 120000, env: { ...process.env, TEMP: t, TMP: t, TMPDIR: t } });
};

test('uso: sem --todas/--suites, suite desconhecida, --afetadas e argumentos estranhos dão a saída 2, sem correr nada', () => {
  const d = tmp();
  for (const a of [[], ['--suites', 'nada'], ['--todas', '--afetadas'], ['--todas', '--passe', '3'], ['--todas', '--xpto']]) {
    const r = executor(d, ...a);
    assert.equal(r.status, 2, `${a.join(' ')}: ${r.stdout}${r.stderr}`);
  }
});

test('blocos: cada padrão do manifesto é uma unidade com --test-name-pattern, e o bloco fica no resultado', () => {
  const d = tmp();
  mkdirSync(join(d, 'scripts')); mkdirSync(join(d, 't'));
  writeFileSync(join(d, 't/x.test.mjs'), "import { test } from 'node:test';\ntest('alfa um', () => {});\ntest('beta dois', () => {});\n");
  writeFileSync(join(d, 'scripts/suites.json'), JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 2, carga_sensivel: 2, orcamento_s: 60,
    suites: [{ nome: 's', tipo: 'node-test', ficheiros: ['t/*.test.mjs'], limite_s: 30, blocos: { 't/x.test.mjs': ['^alfa', '^beta'] } }] }));
  writeFileSync(join(d, '.gitignore'), '.forge/\n');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'x');
  const r = executor(d, '--todas');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const res = JSON.parse(readFileSync(join(d, '.forge/resultados', readdirSync(join(d, '.forge/resultados')).find((n) => n.endsWith('.json'))), 'utf8'));
  assert.deepEqual(res.unidades.map((u) => [u.bloco, u.estado, u.pass]).sort(), [['^alfa', 'pass', 1], ['^beta', 'pass', 1]]);
});

test('limite_s de um bloco ({padrao, limite_s}) substitui o da suíte, e o limite_s não tem de caber no orcamento_s (é só o kill)', () => {
  const d = tmp();
  mkdirSync(join(d, 'scripts')); mkdirSync(join(d, 't'));
  writeFileSync(join(d, 't/x.test.mjs'), "import { test } from 'node:test';\ntest('lento um', async () => { await new Promise((r) => setTimeout(r, 4000)); });\ntest('rapido dois', () => {});\n");
  writeFileSync(join(d, 'scripts/suites.json'), JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 2, carga_sensivel: 2, orcamento_s: 30,
    suites: [{ nome: 's', tipo: 'node-test', ficheiros: ['t/*.test.mjs'], limite_s: 2, blocos: { 't/x.test.mjs': [{ padrao: '^lento', limite_s: 900 }, '^rapido'] } }] }));
  writeFileSync(join(d, '.gitignore'), '.forge/\n');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'x');
  const r = executor(d, '--todas');
  assert.equal(r.status, 0, r.stdout + r.stderr); // o bloco lento (4 s) passa o limite_s 2 da suíte porque o dele é 900
  const res = JSON.parse(readFileSync(join(d, '.forge/resultados', readdirSync(join(d, '.forge/resultados')).find((n) => n.endsWith('.json'))), 'utf8'));
  assert.deepEqual(res.unidades.map((u) => [u.bloco, u.estado]).sort(), [['^lento', 'pass'], ['^rapido', 'pass']]);
});
