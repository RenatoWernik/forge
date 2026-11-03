// V-05 (#129), testes do dev por classe (além dos ataques do crítico, que não se tocam): o que o C1 não cobre.
// - o âmbito conta o nome antigo de uma renomeação (sem isso, mover um ficheiro de fora para dentro do âmbito escapava);
// - um diff vazio nunca dá ok (afetadas vazias);
// - erros de uso dão 2 e nunca chamam o gh;
// - o orçamento: o executor deixa uma unidade por correr, o check-ticket dá 3 (sem publicar) e o --continuar acaba o que falta e dá 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cenario, correr, ROOT, ghFalso, gitOk, lanca, linhas, PASSOS, pidsLancados, escreve, saida, tmp, limpa } from './helpers.mjs';

after(limpa);

const A = ['tests/critico/a-r0/**'];
const passo = (r, p) => linhas(r.out).find((l) => l.passo === p);

test('classe: o nome antigo de uma renomeação conta para o âmbito (README.md movido para dentro do âmbito)', async () => {
  const d = cenario((r) => gitOk(r, 'mv', 'README.md', 'tests/critico/a-r0/leia-me.md'));
  const r = await correr(d, ['--ambito', ...A, '--base', 'origin/main']);
  assert.equal(r.status, 1, saida(r));
  assert.equal(passo(r, 'âmbito').estado, 'FAIL', saida(r));
  assert.ok(passo(r, 'âmbito').linha.includes('README.md'), passo(r, 'âmbito').linha);
});

test('classe: um diff vazio contra a base nunca dá ok nas afetadas', async () => {
  const d = cenario();
  const r = await correr(d, ['--ambito', ...A, '--base', 'origin/main']);
  assert.equal(r.status, 1, saida(r));
  for (const p of ['afetadas no ramo', 'pós-merge']) assert.equal(passo(r, p).estado, 'FAIL', saida(r));
});

test('classe: uma base que não existe dá FAIL em vez de rebentar, com as 6 linhas', async () => {
  const d = cenario((r) => escreve(r, 'tests/critico/a-r0/x.test.mjs', 'import test from "node:test";\ntest("a", () => {});\n'));
  const r = await correr(d, ['--ambito', ...A, '--base', 'origin/nao-existe']);
  assert.equal(r.status, 1, saida(r));
  assert.deepEqual(linhas(r.out).map((l) => l.passo), PASSOS, saida(r));
  assert.equal(passo(r, 'âmbito').estado, 'FAIL');
});

test('classe: erros de uso dão 2 e não chamam o gh (sem --ambito, --publicar que não é um PR, opção desconhecida)', async () => {
  const d = cenario((r) => escreve(r, 'tests/critico/a-r0/x.test.mjs', 'import test from "node:test";\ntest("a", () => {});\n'));
  for (const args of [[], ['--ambito', ...A, '--publicar', '--body'], ['--ambito', ...A, '--publicar', '7;x'], ['--ambito', ...A, '--nada']]) {
    const gh = ghFalso();
    const r = await correr(d, args, { env: gh.env });
    assert.equal(r.status, 2, `${args.join(' ')}\n${saida(r)}`);
    assert.deepEqual(gh.chamadas(), [], args.join(' '));
    assert.deepEqual(linhas(r.out), [], 'um erro de uso não imprime passos');
  }
});

// medido na ponta (C2 do V-05): o lint corria em paralelo com o motor e fora das vagas; o teste de tempo «corpus < 60 s» (exclusivo) do ramo deu 70,6 s e falhou
test('classe: o lint corre antes dos motores e nunca se sobrepõe a uma unidade (janelas de tempo gravadas), com as 6 linhas pela ordem de sempre', async () => {
  const janelas = join(tmp('v05-janelas-'), 'janelas.jsonl');
  const grava = `import { appendFileSync } from 'node:fs';
const marca = (quem, fase) => appendFileSync(process.env.V05_JANELAS, JSON.stringify({ quem, fase, t: Date.now() }) + '\\n');
const dorme = (ms) => new Promise((f) => setTimeout(f, ms));
`;
  const d = cenario((r) => {
    // o lint do mapa e a unidade da a-r0 demoram o bastante para que uma sobreposição se veja; cada um grava o início e o fim
    // o mesmo ficheiro também é uma unidade da suíte `scripts`: só o executor dá às unidades um TEMP dentro de forge-exec-*, e é assim que se distingue o lint
    escreve(r, 'scripts/mapa-suites.test.mjs', `import test from 'node:test';\n${grava}const quem = /forge-exec-[^\\\\/]+[\\\\/]u\\d+[\\\\/]tmp$/.test(process.env.TEMP ?? '') ? 'unidade' : 'lint';\ntest('lint do cenário (lento)', async () => { marca(quem, 'ini'); await dorme(2500); marca(quem, 'fim'); });\n`);
    escreve(r, 'tests/critico/a-r0/x.test.mjs', `import test from 'node:test';\n${grava}test('a: unidade lenta', async () => { marca('unidade', 'ini'); await dorme(1500); marca('unidade', 'fim'); });\n`);
  });
  const r = await correr(d, ['--ambito', ...A, 'scripts/mapa-suites.test.mjs', '--base', 'origin/main'], { env: { V05_JANELAS: janelas } });
  assert.equal(r.status, 0, saida(r));
  assert.deepEqual(linhas(r.out).map((l) => `${l.estado} ${l.passo}`), PASSOS.map((p) => `ok ${p}`), saida(r));
  const reg = readFileSync(janelas, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const t = (quem, fase) => reg.filter((e) => e.quem === quem && e.fase === fase).map((e) => e.t);
  assert.equal(t('lint', 'ini').length, 1, JSON.stringify(reg));
  assert.ok(t('unidade', 'ini').length >= 2, `a unidade corre no ramo e no pós-merge: ${JSON.stringify(reg)}`);
  assert.ok(Math.max(...t('lint', 'fim')) <= Math.min(...t('unidade', 'ini')), `o lint e uma unidade sobrepuseram-se: ${JSON.stringify(reg)}`);
});

// medido com um espião de taskkill no combinado v-05-r0+v-01-r0: o limpa() deste ficheiro de helpers matava PIDs de check-tickets que já tinham saído, e o Windows
// já os tinha reciclado (conhost.exe; e, noutra corrida, o executor de outra worktree). Sem esperar uma reciclagem: só se mata o que ainda corre.
test('classe: o limpa() só mata o que lançou e ainda corre: o PID de um check-ticket que já saiu deixa de estar registado', async () => {
  const d = cenario();
  const l = lanca(d, ['--nada']); // erro de uso: sai logo com 2
  assert.ok(pidsLancados().includes(l.pid), 'um processo que corre está registado');
  const r = await l.fim;
  assert.equal(r.status, 2, saida(r));
  assert.ok(!pidsLancados().includes(l.pid), `o PID ${l.pid} já saiu e continua registado: o limpa() mataria quem o herdar`);
});

test('classe: o orçamento do executor não chega: código 3 sem publicar; com --continuar acaba o que falta e dá 0, com os 6 ok', async () => {
  const d = cenario((r) => {
    const m = JSON.parse(readFileSync(join(r, 'scripts/suites.json'), 'utf8'));
    Object.assign(m, { orcamento_s: 4 });
    m.suites.push({ nome: 'b-r0', tipo: 'node-test', ficheiros: ['tests/critico/b-r0/*.test.mjs'], limite_s: 60 });
    escreve(r, 'scripts/suites.json', JSON.stringify(m, null, 2) + '\n');
    // uma suíte lenta (10 s) com o orçamento a 4 s: a 1.ª chamada não chega; o motor continua e o --continuar liga-se a ele
    escreve(r, 'tests/critico/b-r0/y.test.mjs', 'import test from "node:test";\ntest("b: lento", async () => { await new Promise((f) => setTimeout(f, 10000)); });\n');
  });
  const args = ['--ambito', ...A, 'tests/critico/b-r0/**', 'scripts/suites.json', '--base', 'origin/main', '--publicar', '7'];
  const gh = ghFalso(), temp = tmp('v05-temp-'); // o mesmo TEMP nas chamadas: o clone do pós-merge vive lá e o --continuar reaproveita-o
  const env = { ...gh.env, TEMP: temp, TMP: temp, TMPDIR: temp };
  const um = await correr(d, args, { env });
  assert.equal(um.status, 3, saida(um));
  assert.ok(linhas(um.out).some((l) => l.passo === 'afetadas no ramo' && l.estado !== 'ok') || /pendente afetadas no ramo/.test(um.out), saida(um));
  assert.deepEqual(gh.chamadas(), [], 'um resultado incompleto não se publica');
  let dois;
  for (let n = 0; n < 8 && dois?.status !== 0; n++) {
    dois = await correr(d, [...args, '--continuar'], { env });
    assert.ok([0, 3].includes(dois.status), saida(dois));
  }
  assert.equal(dois.status, 0, saida(dois));
  assert.deepEqual(linhas(dois.out).map((l) => `${l.estado} ${l.passo}`), PASSOS.map((p) => `ok ${p}`), saida(dois));
  assert.equal(gh.chamadas().length, 1);
});

// V-05 (#129, REDESENHO): a cache por processo do afetadas() (scripts/afetadas.mjs) nunca muda o resultado e nunca atravessa processos.
const AFETADAS = pathToFileURL(join(ROOT, 'scripts/afetadas.mjs')).href;
const CHAMA = `import { afetadas } from ${JSON.stringify(AFETADAS)};
const [raiz, lista] = [process.argv[2], JSON.parse(process.argv[3])];
const ord = (r) => ({ suites: [...r.suites].sort(), porque: Object.fromEntries(Object.entries(r.porque).sort()) });
console.log(JSON.stringify(lista.map((f) => ord(afetadas(f, { raiz })))));
`;
const chama = (script, raiz, lista) => {
  const r = spawnSync(process.execPath, [script, raiz, JSON.stringify(lista)], { encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const amostra = () => {
  // ls-tree e não o outro comando de listar: a amostra só pede os ficheiros rastreados, não depende do diff do ticket (o lint do mapa distingue os dois)
  const todos = gitOk(ROOT, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(Boolean);
  const cada = (re, n) => { const m = todos.filter((f) => re.test(f)); const passo = Math.max(1, Math.floor(m.length / n)); return m.filter((_, i) => i % passo === 0).slice(0, n); };
  return [...cada(/^tests\/critico\/[^/]+\/[^/]+\.test\.mjs$/, 12), ...cada(/^tests\/critico\/[^/]+\/helpers\.mjs$/, 8), ...cada(/^scripts\/[^/]+\.mjs$/, 6),
    ...cada(/^tests\/critico\/_comum\//, 2), 'README.md', 'CHANGELOG.md', ...cada(/\.json$/, 3), 'tests/critico/zz-nao-existe/x.test.mjs', 'nao-existe.txt'];
};

test('classe (cache do afetadas): com a cache quente o resultado é igual ao de um processo novo, para uma amostra de >= 30 ficheiros de categorias diferentes', () => {
  const d = tmp('v05-cache-'), script = join(d, 'chama.mjs');
  writeFileSync(script, CHAMA);
  const fs_ = amostra();
  assert.ok(fs_.length >= 30, `amostra de ${fs_.length}`);
  const quente = chama(script, ROOT, [...fs_, ...fs_].map((f) => [f])); // 2 voltas: a 2.ª já com tudo em memória
  fs_.forEach((f, i) => {
    const novo = chama(script, ROOT, [[f]])[0];
    assert.deepEqual(quente[i], novo, `1.ª volta: ${f}`);
    assert.deepEqual(quente[i + fs_.length], novo, `2.ª volta (cache quente): ${f}`);
  });
  const lote = chama(script, ROOT, [fs_.slice(0, 5), fs_.slice(5, 12)]); // diffs com vários ficheiros também
  assert.deepEqual(lote, chama(script, ROOT, [fs_.slice(0, 5)]).concat(chama(script, ROOT, [fs_.slice(5, 12)])));
});

test('classe (cache do afetadas): num processo novo o resultado acompanha uma alteração dos imports da árvore', () => {
  const d = tmp('v05-cache-arv-'), script = join(d, 'chama.mjs'), r = join(d, 'repo');
  writeFileSync(script, CHAMA);
  const manif = JSON.stringify({ versao: 1, suites: ['a', 'b'].map((n) => ({ nome: n, tipo: 'node-test', ficheiros: [`tests/critico/${n}/*.test.mjs`] })) });
  escreve(r, 'scripts/suites.json', manif);
  escreve(r, 'scripts/mapa-suites.json', JSON.stringify({ versao: 1 }));
  escreve(r, 'tests/critico/a/h.mjs', 'export const x = 1;\n');
  escreve(r, 'tests/critico/a/a.test.mjs', "import { x } from './h.mjs';\n");
  escreve(r, 'tests/critico/b/b.test.mjs', 'export const y = 1;\n');
  const antes = chama(script, r, [['tests/critico/a/h.mjs']])[0].suites;
  escreve(r, 'tests/critico/b/b.test.mjs', "import { x } from '../a/h.mjs';\n");
  const depois = chama(script, r, [['tests/critico/a/h.mjs']])[0].suites;
  assert.deepEqual([antes, depois], [['a'], ['a', 'b']]);
});

test('classe (orçamento): o lint e o clone gastam do orcamento_s: a chamada devolve 3 em orcamento_s mais uma folga curta, nunca em lint + orcamento_s', async () => {
  const ORC = 30;
  const d = cenario((r) => {
    const m = JSON.parse(readFileSync(join(r, 'scripts/suites.json'), 'utf8'));
    Object.assign(m, { orcamento_s: ORC });
    m.suites.push({ nome: 'b-r0', tipo: 'node-test', ficheiros: ['tests/critico/b-r0/*.test.mjs'], limite_s: 120 });
    escreve(r, 'scripts/suites.json', JSON.stringify(m, null, 2) + '\n');
    escreve(r, 'tests/critico/b-r0/y.test.mjs', 'import test from "node:test";\ntest("b: lento", async () => { await new Promise((f) => setTimeout(f, 90000)); });\n');
    // um lint lento (10 s, a passar): é o tempo que o orçamento tem de descontar
    escreve(r, 'scripts/mapa-suites.test.mjs', 'import test from "node:test";\ntest("mapa: lento", async () => { await new Promise((f) => setTimeout(f, 10000)); });\n');
  });
  const t0 = Date.now();
  const r = await correr(d, ['--ambito', ...A, 'tests/critico/b-r0/**', 'scripts/suites.json', '--base', 'origin/main']);
  const s = (Date.now() - t0) / 1000;
  assert.equal(r.status, 3, saida(r));
  assert.ok(s < ORC + 5, `a chamada levou ${s.toFixed(1)} s com orcamento_s ${ORC}: o lint não foi descontado`);
});

// V-05 (#129, RESPOSTA): o lock do `learnings add` (templates/.claude/learn.mjs). No Windows, abrir com `wx` um `.lock` que outro processo está a apagar
// dá EPERM ou EACCES em vez de EEXIST: é «busy, try again» (saída 3), não uma falha (1). Outros erros (ENOSPC) continuam a dar 1.
const LEARN = join(ROOT, 'templates/.claude/learn.mjs');
const FORCA = `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const real = fs.openSync;
fs.openSync = (p, ...r) => { if (String(p).endsWith('.lock')) throw Object.assign(new Error(process.env.CODIGO_FORCADO + ': forçado'), { code: process.env.CODIGO_FORCADO }); return real(p, ...r); };
syncBuiltinESMExports();
`;
for (const [codigo, saidaEsperada, texto] of [['EEXIST', 3, 'learnings: busy, try again'], ['EPERM', 3, 'learnings: busy, try again'], ['EACCES', 3, 'learnings: busy, try again'], ['ENOSPC', 1, 'add: ENOSPC']]) {
  test(`classe (lock do learnings add): openSync do .lock a dar ${codigo} sai com ${saidaEsperada} e «${texto}»`, () => {
    const d = tmp('v05-lock-');
    writeFileSync(join(d, 'forca.mjs'), FORCA);
    writeFileSync(join(d, 'e.json'), JSON.stringify({ DATE: '2026-10-27' }));
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(d, 'forca.mjs')).href, LEARN, 'add', '--json', 'e.json'],
      { cwd: d, encoding: 'utf8', env: { ...process.env, CODIGO_FORCADO: codigo }, windowsHide: true });
    assert.equal(r.status, saidaEsperada, r.stdout + r.stderr);
    assert.ok(r.stderr.includes(texto), r.stderr);
  });
}