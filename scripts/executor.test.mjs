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
import { contagens } from './executor.mjs'; // V-08: numa linha à parte, a guarda do f-21b exige as linhas da base intactas
import { contagensTap, linhaDe } from './executor.mjs';

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
// Os problemas dos blocos de um manifesto lido de `raiz`: [texto]. O manifesto real já não tem blocos (o lote do V-03 tirou-os), por isso a regra
// prova-se também sobre um manifesto de fixture.
const problemasDeBlocos = (raiz, manifesto) => {
  const out = [];
  for (const s of manifesto.suites.filter((x) => x.blocos)) {
    for (const [f, blocos] of Object.entries(s.blocos)) {
      const titulos = [...readFileSync(join(raiz, f), 'utf8').matchAll(/^test\((['"`])(.*?)\1/gm)].map((m) => m[2]);
      if (!titulos.length) out.push(`${f}: nenhum test('...') estático`);
      const padroes = blocos.map((b) => b.padrao ?? b), res = padroes.map((b) => new RegExp(b));
      out.push(...titulos.filter((t) => !res.some((r) => r.test(t))).map((t) => `${f}: teste fora de todos os blocos: ${t}`));
      out.push(...padroes.filter((b, i) => !titulos.some((t) => res[i].test(t))).map((b) => `${f}: bloco que não casa com nenhum teste: ${b}`));
    }
  }
  return out;
};
test('blocos do manifesto: todo o teste do ficheiro casa com algum bloco, e cada bloco casa com algum teste', () => {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  assert.deepEqual(problemasDeBlocos(raiz, JSON.parse(readFileSync(join(raiz, 'scripts/suites.json'), 'utf8'))), []);
});
test('blocos de um manifesto de fixture: apanha o teste fora dos blocos e o bloco que não casa com nada', () => {
  const raiz = tmp();
  mkdirSync(join(raiz, 't'));
  writeFileSync(join(raiz, 't', 'x.test.mjs'), "test('alfa um', () => {});\ntest('beta dois', () => {});\n");
  const manifesto = (blocos) => ({ suites: [{ nome: 's', ficheiros: ['t/*.test.mjs'], blocos: { 't/x.test.mjs': blocos } }] });
  assert.deepEqual(problemasDeBlocos(raiz, manifesto(['^alfa', { padrao: '^beta', limite_s: 5 }])), []);
  assert.deepEqual(problemasDeBlocos(raiz, manifesto(['^alfa'])), ['t/x.test.mjs: teste fora de todos os blocos: beta dois']);
  assert.deepEqual(problemasDeBlocos(raiz, manifesto(['^alfa', '^beta', '^gama'])), ['t/x.test.mjs: bloco que não casa com nenhum teste: ^gama']);
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

// V-08 (#132): a suíte `comando`. O comportamento no projeto gerado é provado por tests/critico/v-08-r0/; aqui as classes de entradas do manifesto e do TAP.
test('contagens: `comando` com formato codigo conta pelo código de saída; com formato tap lê o sumário do node ou, sem ele, as linhas ok e not ok do nível 0; sem testes nunca é pass', () => {
  const cmd = (formato) => ({ tipo: 'comando', formato });
  const estado = (s, out, status) => estadoDe(status, contagens(s, out, status));
  assert.equal(estado(cmd('codigo'), '', 0), 'pass');
  assert.equal(estado(cmd('codigo'), 'tap falso\nok 1 - x\n', 4), 'fail');
  assert.deepEqual(contagens(cmd('tap'), TAP, 1).pass, 1); // com sumário: o do node
  const semSumario = 'TAP version 13\nok 1 - a\nnot ok 2 - b\n    ok 1 - interno\nok 3 - c # SKIP x\n1..3\n';
  const c = contagens(cmd('tap'), semSumario, 1);
  assert.deepEqual([c.pass, c.fail, c.skip], [1, 1, 1]);
  assert.equal(estadoDe(1, c), 'fail');
  assert.equal(estado(cmd('tap'), '', 0), 'erro'); // um comando que sai 0 sem escrever TAP não prova nada
  assert.equal(estado(cmd('tap'), 'ok 1 - a\n', 1), 'erro'); // saída ≠ 0 sem falhas no TAP
  assert.deepEqual(contagens({ tipo: 'node-test' }, TAP, 1), lerTap(TAP)); // o node-test não muda
});

test('uso: uma suíte `comando` sem texto nem lista, com formato desconhecido, ou um tipo desconhecido, dão a saída 2 e nomeiam a suíte', () => {
  const d = tmp();
  mkdirSync(join(d, 'scripts')); // o manifesto é lido antes do git: não é preciso repo
  for (const suite of [{ comando: ' ' }, { comando: [] }, { comando: ['node', 3] }, { comando: 7 }, { comando: ['node', '-v'], formato: 'xml' }, { tipo: 'jest' }]) {
    writeFileSync(join(d, 'scripts/suites.json'), JSON.stringify({ versao: 1, paralelo: 1, vagas_globais: 1, carga_sensivel: 1, orcamento_s: 30, suites: [{ nome: 'cx', tipo: 'comando', ...suite }] }));
    const r = executor(d, '--todas');
    assert.equal(r.status, 2, JSON.stringify(suite) + (r.stdout + r.stderr));
    assert.match(r.stdout + r.stderr, /suite cx/);
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

test('exclusiva por ficheiro (lista de globs): só esse ficheiro corre sozinho na máquina; os outros da suíte continuam em paralelo', () => {
  const d = tmp(), reg = join(d, '.forge/intervalos.txt').replaceAll('\\', '/');
  mkdirSync(join(d, 'scripts')); mkdirSync(join(d, 't')); mkdirSync(join(d, '.forge')); // .forge/ está no .gitignore: o registo não suja a árvore
  for (const n of ['a', 'b', 'c']) {
    writeFileSync(join(d, `t/${n}.test.mjs`), `import { test } from 'node:test';\nimport { appendFileSync } from 'node:fs';\n`
      + `test('${n}', async () => { const i = Date.now(); await new Promise((r) => setTimeout(r, 1500)); appendFileSync('${reg}', '${n} ' + i + ' ' + Date.now() + '\\n'); });\n`);
  }
  writeFileSync(join(d, 'scripts/suites.json'), JSON.stringify({ versao: 1, paralelo: 3, vagas_globais: 3, carga_sensivel: 3, orcamento_s: 60,
    suites: [{ nome: 's', tipo: 'node-test', ficheiros: ['t/*.test.mjs'], limite_s: 30, exclusiva: ['t/a.test.mjs'] }] }));
  writeFileSync(join(d, '.gitignore'), '.forge/\n');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'x');
  const r = executor(d, '--todas');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const iv = Object.fromEntries(readFileSync(join(d, '.forge/intervalos.txt'), 'utf8').trim().split('\n').map((l) => { const [n, i, f] = l.split(' '); return [n, [+i, +f]]; }));
  const cruza = (x, y) => x[0] < y[1] && y[0] < x[1];
  assert.ok(!cruza(iv.a, iv.b) && !cruza(iv.a, iv.c), `a (exclusiva) cruzou-se com outra unidade: ${JSON.stringify(iv)}`);
  assert.ok(cruza(iv.b, iv.c), `b e c (não exclusivas) deviam correr em paralelo: ${JSON.stringify(iv)}`);
});

// V-08, Ronda 2 (#132): as classes de entradas do `formato: tap`, do `comando` e do manifesto vazio. O comportamento no projeto gerado: tests/critico/v-08-r0/r2-*.
test('contagensTap: só há pass com prova (plano 1..N e N linhas ok, ou o sumário do node com as N folhas ok); sem prova é «erro» com o motivo; nunca um «ok» solto', () => {
  const estado = (out, status = 0) => { const c = contagensTap(out); return [estadoDe(status, c), c.motivo]; };
  // válido: plano ao nível 0, com e sem sumário; os grupos do node (a folha conta, o grupo não)
  assert.deepEqual(estado('TAP version 13\nok 1 - a\nok 2 - b\n1..2\n'), ['pass', undefined]);
  assert.deepEqual(estado('1..2\nok 1 - a\nok 2 - b # SKIP x\n'), ['pass', undefined]); // o plano pode vir antes
  const grupo = 'TAP version 13\n# Subtest: v1\nok 1 - v1\n# Subtest: grupo\n    # Subtest: g1\n    ok 1 - g1\n    # Subtest: g2\n    ok 2 - g2\n    1..2\nok 2 - grupo\n1..2\n# tests 3\n# suites 1\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.deepEqual(estado(grupo), ['pass', undefined]);
  assert.deepEqual(estado(grupo.replace(/\n1\.\.2\n# tests/, '\n# tests')), ['pass', undefined]); // sem plano ao nível 0: o sumário e as 3 folhas
  // sem prova: erro com o motivo
  for (const [nome, out] of [
    ['ok solto, sem plano nem sumário', 'ok compilou, nao correu nenhum teste\n'],
    ['plano 1..5 com 1 ok', '1..5\nok 1 - a\n'],
    ['plano 1..0', '1..0\n'],
    ['Bail out!', '1..3\nok 1 - a\nBail out! db em baixo\n'],
    ['sumário sem nenhuma linha de teste', '# tests 3\n# pass 3\n# fail 0\n# skipped 0\n# todo 0\n'],
    ['sumário com menos folhas que o # pass', 'ok 1 - a\n# tests 3\n# pass 3\n# fail 0\n# skipped 0\n# todo 0\n'],
    ['saída vazia', ''],
  ]) { const [e, motivo] = estado(out); assert.deepEqual([nome, e, !!motivo], [nome, 'erro', true]); }
  // um not ok é fail, mesmo com saída 0 (e com o plano por cumprir)
  assert.equal(estado('1..2\nok 1 - a\nnot ok 2 - b\n')[0], 'fail');
  assert.equal(estado('1..5\nok 1 - a\nnot ok 2 - b\n')[0], 'fail');
  assert.equal(estado('1..1\nok 1 - a\n', 1)[0], 'erro'); // saída ≠ 0 sem falhas
});

test('linhaDe: um texto vai como está; numa lista, só o que não é seguro leva aspas; no Windows «"», «%» e quebras de linha são erro de uso', () => {
  assert.equal(linhaDe('npm test'), 'npm test');
  assert.equal(linhaDe(['npm', 'test']), 'npm test');
  assert.equal(linhaDe(['npm.cmd', '--version']), 'npm.cmd --version'); // «npm.cmd» entre aspas perde o %~dp0
  const aspas = process.platform === 'win32' ? (s) => `"${s}"` : (s) => `'${s}'`;
  assert.equal(linhaDe(['x', 'a b', 'f(1); g()']), `x ${aspas('a b')} ${aspas('f(1); g()')}`);
  if (process.platform === 'win32') {
    assert.equal(linhaDe(['C:\\Program Files\\x\\y.cmd', 'a b\\']), '"C:\\Program Files\\x\\y.cmd" "a b\\\\"'); // a barra final duplica-se: nunca escapa a aspa de fecho
    for (const mau of ['a"b', '%PATH%', 'a\nb']) assert.throws(() => linhaDe(['x', mau]), /Windows/);
  } else assert.equal(linhaDe(['x', "it's"]), `x 'it'\\''s'`);
  for (const mau of ['', ' ', [], ['a', ''], ['a', 3], 7, null]) assert.throws(() => linhaDe(mau));
});

test('uso: um manifesto com suites: [] dá a saída 2 (0/0 unidades seria um verde sem testes)', () => {
  const d = tmp();
  mkdirSync(join(d, 'scripts'));
  writeFileSync(join(d, 'scripts/suites.json'), JSON.stringify({ versao: 1, paralelo: 1, vagas_globais: 1, carga_sensivel: 1, orcamento_s: 30, suites: [] }));
  for (const a of [['--todas'], ['--afetadas']]) {
    const r = executor(d, ...a);
    assert.equal(r.status, 2, a.join(' ') + (r.stdout + r.stderr));
    assert.match(r.stdout + r.stderr, /suites está vazio/);
  }
});
