// V-08, Ronda 3 (CONTRATO REESCRITO, 13:13): os mecanismos A, B e C, cada um com um oráculo finito.
//   A. diretivas TAP por especificação: o corpus de corpus-tap.mjs, por TAP em texto e por node --test real;
//   B. a saída 3 nunca é sem fim: o motor é morto pelo PID em 13 instantes (e a janela «última unidade final, escreve(true) por fazer»); a cadeia --continuar acaba em 0 ou 1
//      em ≤ 6 chamadas e cada unidade aparece uma só vez; o mesmo por check-ticket em 4 instantes; controlo: um motor vivo a trabalhar devolve 3 sem cair no contador;
//   C. nomes de log sem colisão: a-b + c com a + b-c, e Unit com unit.
// O motor só se mata se o ficheiro de batimento dele (PID + nonce, com menos de 3 s) o identifica: o PID é o de um motor que este teste lançou (pelo executor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contagensTap } from '../../../scripts/executor.mjs';
import { LINHAS } from './corpus-tap.mjs';
import { gerar, conjunto, preCondicao, repo, git, commita, escreve, comSuites, correAteFim, resultado, ambiente, lerJson, MANIFESTO, fim } from './helpers.mjs';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const nodeE = (js) => [process.execPath, '-e', js];
const estados = (res) => Object.fromEntries(Object.entries(res.suites ?? {}).map(([n, s]) => [n, s.estado]));
const comManifesto = (P, campos) => writeFileSync(join(P, MANIFESTO), JSON.stringify({ ...lerJson(join(P, MANIFESTO)), ...campos }, null, 2) + '\n');
const projeto = async (suites, campos = {}, antes = () => {}) => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  antes(P);
  comSuites(P, suites);
  if (Object.keys(campos).length) comManifesto(P, campos);
  return { P, sha: repo(P) };
};

// ---------- A ----------
test('A (corpus, TAP em texto): uma linha ok com diretiva skip/todo (qualquer caixa, com ou sem espaço, com a palavra a continuar) não conta; as outras contam', () => {
  for (const { linha, conta } of LINHAS) {
    const sozinha = contagensTap(`1..1\n${linha}\n`);
    if (conta) assert.equal(sozinha.pass, 1, `«${linha}» devia contar: ${JSON.stringify(sozinha)}`);
    else assert.match(sozinha.motivo ?? '', /nenhum teste correu/, `«${linha}» não devia contar: ${JSON.stringify(sozinha)}`);
    const comOutro = contagensTap(`1..2\n${linha}\nok 2 - b\n`);
    assert.equal(comOutro.pass, conta ? 2 : 1, `«${linha}» + um ok que corre: ${JSON.stringify(comOutro)}`);
  }
});

test('A (executor): o corpus por um comando que escreve TAP, e por node --test real (skip, describe.skip, todo), dá erro «nenhum teste correu» ou pass como o corpus manda', async () => {
  const tap = (nome, texto) => ({ nome, tipo: 'comando', comando: nodeE(`console.log(${JSON.stringify(texto).replaceAll('"', "'")})`), formato: 'tap', limite_s: 60 });
  const casos = LINHAS.map((l, i) => ({ ...l, nome: `corpus${i}` }));
  const real = (nome, ficheiro) => ({ nome, tipo: 'comando', comando: [process.execPath, '--test', '--test-reporter=tap', ficheiro], formato: 'tap', limite_s: 60 });
  const { P, sha } = await projeto([
    ...casos.map((c) => tap(c.nome, `1..1\n${c.linha}`)),
    real('node-skip', 't/s.test.mjs'), real('node-describe-skip', 't/d.test.mjs'), real('node-todo', 't/t.test.mjs'), real('node-ok-e-skip', 't/o.test.mjs'),
  ], {}, (P) => {
    escreve(P, 't/s.test.mjs', "import { test } from 'node:test';\ntest('a', { skip: 'x' }, () => {});\ntest('b', { skip: 'y' }, () => {});\n");
    escreve(P, 't/d.test.mjs', "import { describe, test } from 'node:test';\ndescribe.skip('g', () => { test('a', () => {}); });\n");
    escreve(P, 't/t.test.mjs', "import { test } from 'node:test';\ntest.todo('a');\n");
    escreve(P, 't/o.test.mjs', "import { test } from 'node:test';\ntest('a', { skip: 'x' }, () => {});\ntest('b', () => {});\n");
  });
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 1, `código ${r.status}` + fim(r));
  assert.deepEqual(estados(resultado(P, sha)), { ...Object.fromEntries(casos.map((c) => [c.nome, c.conta ? 'pass' : 'erro'])), 'node-skip': 'erro', 'node-describe-skip': 'erro', 'node-todo': 'erro', 'node-ok-e-skip': 'pass' });
});

// ---------- B ----------
const UNIDADES = (n, ms) => Array.from({ length: n }, (_, i) => ({ nome: `u${i + 1}`, tipo: 'comando', comando: nodeE(`setTimeout(() => {}, ${ms})`), formato: 'codigo', limite_s: 60 }));
const exec = (P, args, env = {}) => {
  const r = spawnSync(process.execPath, ['.claude/executor.mjs', ...args], { cwd: P, encoding: 'utf8', env: ambiente(env), timeout: 200000, windowsHide: true });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
// o motor vivo deste projeto: o ficheiro dele (PID, nonce) e o batimento (mesmo PID e nonce, com menos de 3 s)
const motorVivo = (P) => {
  const d = join(P, '.forge/motor');
  if (!existsSync(d)) return null;
  for (const n of readdirSync(d).filter((x) => /-p1\.json$/.test(x))) {
    try {
      const m = JSON.parse(readFileSync(join(d, n), 'utf8')), b = JSON.parse(readFileSync(join(d, `${n}.bat`), 'utf8'));
      if (!m.fim && b.pid === m.pid && b.nonce === m.nonce && Date.now() - b.t < 3000) return m;
    } catch { /* ainda sem batimento */ }
  }
  return null;
};
const mataMotor = (P) => { const m = motorVivo(P); if (!m) return false; try { process.kill(m.pid, 'SIGKILL'); return true; } catch { return false; } };
const resultadoAtual = (P) => {
  const d = join(P, '.forge/resultados');
  const f = existsSync(d) ? readdirSync(d).filter((n) => /-p1\.json$/.test(n)) : [];
  return f.length ? JSON.parse(readFileSync(join(d, f[0]), 'utf8')) : null;
};
const confere = (P, ultimo, quando, esperadas) => {
  assert.ok(ultimo.n <= 6, `${quando}: ${ultimo.n} chamadas (> 6)`);
  assert.ok([0, 1].includes(ultimo.status), `${quando}: terminou com ${ultimo.status} ao fim de ${ultimo.n} chamada(s), e não com 0 ou 1\n${ultimo.out.slice(-600)}`);
  const r = resultadoAtual(P);
  assert.ok(r, `${quando}: sem resultado`);
  const nomes = r.unidades.map((u) => u.suite).sort();
  assert.deepEqual(nomes, esperadas, `${quando}: cada unidade uma só vez`);
  if (ultimo.status === 0) { assert.equal(r.completo, true, `${quando}: saída 0 com o resultado incompleto`); assert.ok(r.unidades.every((u) => u.estado === 'pass'), `${quando}: saída 0 sem tudo pass`); }
};

test('B (executor): o motor morto pelo PID em 12 instantes, do arranque ao fim, e na janela «última unidade final, escreve(true) por fazer»: a cadeia --continuar acaba em 0 ou 1 em ≤ 6 chamadas, nunca 3 sem fim, cada unidade uma só vez', { timeout: 420000 }, async () => {
  const n = 6, esperadas = UNIDADES(n, 400).map((u) => u.nome);
  const { P } = await projeto(UNIDADES(n, 400));
  const INSTANTES = [0, 300, 700, 1100, 1500, 1900, 2300, 2700, 3100, 3500, 3900, 4600];
  for (const [i, t] of INSTANTES.entries()) { // do 2.º em diante há um resultado anterior do mesmo sha
    const t0 = Date.now();
    exec(P, ['--todas', '--paralelo', '1', '--orcamento', '0.3']);
    await espera(Math.max(0, t - (Date.now() - t0)));
    mataMotor(P);
    let ultimo, k = 0;
    do { ultimo = { ...exec(P, ['--todas', '--paralelo', '1', '--continuar']), n: ++k }; } while (ultimo.status === 3 && k < 6);
    confere(P, ultimo, `instante ${t} ms (#${i + 1})`, esperadas);
  }
  // a janela: o gancho de teste atrasa o último escreve 5 s; com todas as unidades finais e o resultado incompleto, mata-se o motor
  exec(P, ['--todas', '--paralelo', '1', '--orcamento', '0.3'], { FORGE_TESTE_ATRASO_FINAL_MS: '5000' });
  let janela = false;
  for (let k = 0; k < 120 && !janela; k++) {
    await espera(250);
    const r = resultadoAtual(P);
    if (r && !r.completo && r.unidades.length === n && r.unidades.every((u) => ['pass', 'fail', 'limite', 'erro'].includes(u.estado))) janela = mataMotor(P);
  }
  assert.ok(janela, 'não se apanhou a janela (última unidade final, resultado incompleto)');
  assert.equal(resultadoAtual(P).completo, false, 'o resultado devia estar incompleto antes da cadeia');
  let ultimo, k = 0;
  do { ultimo = { ...exec(P, ['--todas', '--paralelo', '1', '--continuar']), n: ++k }; } while (ultimo.status === 3 && k < 6);
  confere(P, ultimo, 'janela', esperadas);
  assert.equal(ultimo.status, 0, 'a janela devia fechar o resultado com 0: ' + ultimo.out.slice(-300));
});

test('B (check-ticket): o motor do ramo morto pelo PID em 4 instantes: a cadeia --continuar acaba em 0 ou 1 em ≤ 6 chamadas, nunca 3 sem fim', { timeout: 540000 }, async () => {
  const n = 8, esperadas = UNIDADES(n, 1200).map((u) => u.nome);
  const { P } = await projeto(UNIDADES(n, 1200), { paralelo: 1, vagas_globais: 6, orcamento_s: 5 });
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 'a.txt', 'a\n');
  commita(P, 'ticket');
  for (const t of [0, 1500, 3000, 4500]) {
    const sp = spawnSync(process.execPath, ['.claude/check-ticket.mjs', '--ambito', '**', '--base', 'main'], { cwd: P, encoding: 'utf8', env: ambiente(), timeout: 300000, windowsHide: true });
    assert.equal(sp.status, 3, `a 1.ª chamada devia ficar incompleta (3): ${sp.stdout}${sp.stderr}`.slice(0, 600));
    await espera(t);
    mataMotor(P);
    let ultimo, k = 0;
    do { ultimo = { ...(() => { const r = spawnSync(process.execPath, ['.claude/check-ticket.mjs', '--ambito', '**', '--base', 'main', '--continuar'], { cwd: P, encoding: 'utf8', env: ambiente(), timeout: 300000, windowsHide: true }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; })(), n: ++k }; } while (ultimo.status === 3 && k < 6);
    assert.ok(k <= 6 && [0, 1].includes(ultimo.status), `instante ${t} ms: terminou com ${ultimo.status} ao fim de ${k} chamada(s)\n${ultimo.out.slice(-600)}`);
    if (ultimo.status === 0) { const r = resultadoAtual(P); assert.deepEqual(r.unidades.map((u) => u.suite).sort(), esperadas, `instante ${t} ms: cada unidade uma só vez`); }
    // uma corrida nova (sem --continuar) recomeça do zero
    git(P, 'commit', '-q', '--allow-empty', '-m', `volta ${t}`);
  }
});

test('B (controlo): um motor vivo a trabalhar devolve 3 as vezes que forem precisas sem cair no contador de chamadas sem progresso; no fim acaba com 0', { timeout: 200000 }, async () => {
  const { P } = await projeto([{ nome: 'longa', tipo: 'comando', comando: nodeE('setTimeout(() => {}, 9000)'), formato: 'codigo', limite_s: 60 }]);
  let r = exec(P, ['--todas', '--orcamento', '1']);
  const codigos = [r.status];
  for (let i = 0; i < 4 && r.status === 3; i++) { r = exec(P, ['--todas', '--continuar', '--orcamento', '1']); codigos.push(r.status); assert.doesNotMatch(r.out, /morreram sem concluir/, `chamada ${i + 2}: o contador apanhou um motor vivo`); }
  assert.ok(codigos.filter((c) => c === 3).length >= 3, 'esperava-se 3 pelo menos 3 vezes com o motor vivo: ' + codigos);
  do { r = exec(P, ['--todas', '--continuar']); } while (r.status === 3);
  assert.equal(r.status, 0, r.out);
});

// ---------- C ----------
test('C: o log de cada unidade leva os 8 primeiros hex do sha256 de suite\\0ficheiro\\0bloco: a-b + c com a + b-c, e Unit com unit, dão logs distintos (também sem distinguir maiúsculas)', async () => {
  const no = (nome, ficheiro) => ({ nome, tipo: 'node-test', ficheiros: [ficheiro], limite_s: 60 });
  const cmd = (nome) => ({ nome, tipo: 'comando', comando: nodeE('0'), formato: 'codigo', limite_s: 60 });
  const { P, sha } = await projeto([no('a-b', 'c.test.mjs'), no('a', 'b-c.test.mjs'), cmd('Unit'), cmd('unit')], {}, (P) => {
    for (const f of ['c.test.mjs', 'b-c.test.mjs']) escreve(P, f, "import { test } from 'node:test';\ntest('x', () => {});\n");
  });
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 0, `código ${r.status}` + fim(r));
  const taps = resultado(P, sha).unidades.map((u) => u.tap);
  assert.equal(taps.length, 4);
  assert.equal(new Set(taps.map((t) => t.toLowerCase())).size, 4, 'dois logs com o mesmo caminho: ' + JSON.stringify(taps));
  assert.ok(taps.every((t) => /-[0-9a-f]{8}\.tap$/.test(t)), 'sem os 8 hex no fim: ' + JSON.stringify(taps));
  for (const t of taps) assert.ok(existsSync(join(P, t)), `o log ${t} não existe`);
});
