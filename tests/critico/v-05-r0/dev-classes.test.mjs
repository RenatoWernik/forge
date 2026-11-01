// V-05 (#129), testes do dev por classe (além dos ataques do crítico, que não se tocam): o que o C1 não cobre.
// - o âmbito conta o nome antigo de uma renomeação (sem isso, mover um ficheiro de fora para dentro do âmbito escapava);
// - um diff vazio nunca dá ok (afetadas vazias);
// - erros de uso dão 2 e nunca chamam o gh;
// - o orçamento: o executor deixa uma unidade por correr, o check-ticket dá 3 (sem publicar) e o --continuar acaba o que falta e dá 0.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cenario, correr, ghFalso, gitOk, linhas, PASSOS, escreve, saida, tmp, limpa } from './helpers.mjs';

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

test('classe: o orçamento do executor não chega: código 3 sem publicar; com --continuar acaba o que falta e dá 0, com os 6 ok', async () => {
  const d = cenario((r) => {
    const m = JSON.parse(readFileSync(join(r, 'scripts/suites.json'), 'utf8'));
    Object.assign(m, { paralelo: 1, orcamento_s: 7 });
    m.suites = m.suites.map((s) => ({ ...s, limite_s: 6 }));
    m.suites.push({ nome: 'b-r0', tipo: 'node-test', ficheiros: ['tests/critico/b-r0/*.test.mjs'], limite_s: 6 });
    escreve(r, 'scripts/suites.json', JSON.stringify(m, null, 2) + '\n');
    escreve(r, 'tests/critico/b-r0/y.test.mjs', 'import test from "node:test";\ntest("b: verde", () => {});\n');
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
