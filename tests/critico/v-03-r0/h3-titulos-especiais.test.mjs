// V-03 R2, teste da classe da falha 2 da R1: a fase 2 do executor corre TODOS os testes do lote, qualquer que seja o título. Num mini-repo com o
// executor e o lote.mjs desta árvore, um ficheiro tem um teste doLote por título, com `\ ( ) [ ] . * ? + ^ $ | { }`, `#`, aspas, um espaço
// final e acentos; cada corpo falha sempre depois do doLote. Se a fase 2 correr o teste, a unidade conta um fail por título; se algum não correr,
// o executor marca `nao_executados` e a unidade nunca fica pass. Mais as duas funções puras: escapaRegex casa só o texto exato e desfazTap
// inverte o escape do TAP do node.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { desfazTap, escapaRegex } from '../../../scripts/executor.mjs';

const pai = mkdtempSync(join(tmpdir(), 'v03-h3-')), d = join(pai, 'r');
after(() => rmSync(pai, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
const escreve = (rel, txt) => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), txt); };
const TITULOS = ['barra \\ invertida', 'parênteses (a) e [b] e {c}', 'ponto . estrela * interrogação ? mais +', 'cima ^ dólar $ barra | e #cardinal',
  'aspas "duplas" e \'simples\'', 'acentos ção — ñ', 'espaço no fim ', 'tudo \\ ( ) [ ] . * ? + ^ $ | { } #', 'duas barras \\\\ e \\n literal'];

test('a fase 2 corre o teste de cada título especial: nenhum fica por correr e nenhum dá pass', () => {
  for (const f of ['scripts/executor.mjs', 'tests/critico/_comum/lote.mjs']) { mkdirSync(dirname(join(d, f)), { recursive: true }); cpSync(join(ROOT, f), join(d, f)); }
  escreve('scripts/suites.json', JSON.stringify({ versao: 1, paralelo: 2, vagas_globais: 4, carga_sensivel: 2, orcamento_s: 300, suites: [
    { nome: 'alvo', tipo: 'node-test', ficheiros: ['tests/critico/x-alvo/*.test.mjs'], limite_s: 60 },
    { nome: 'conv', tipo: 'node-test', ficheiros: ['tests/critico/x-conv/*.test.mjs'], limite_s: 60 } ] }));
  escreve('tests/critico/x-alvo/a.test.mjs', "import { test } from 'node:test';\ntest('a', () => {});\n");
  escreve('tests/critico/x-conv/b.test.mjs', "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { doLote } from '../_comum/lote.mjs';\n"
    + TITULOS.map((t) => `test(${JSON.stringify(t)}, (t) => { const r = doLote(t, 'alvo', { corre: () => ({ status: 1 }) }); if (!r) return; assert.fail('a fase 2 correu'); });\n`).join(''));
  escreve('.gitignore', '.forge/\n');
  const g = (...a) => spawnSync('git', ['-c', 'user.name=c', '-c', 'user.email=c@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'h3');
  const r = spawnSync(process.execPath, ['scripts/executor.mjs', '--todas'], { cwd: d, encoding: 'utf8', timeout: 240000, env: { ...process.env, TMP: pai, TEMP: pai, TMPDIR: pai } });
  const pasta = join(d, '.forge', 'resultados'), json = readdirSync(pasta).filter((x) => x.endsWith('.json'))[0];
  const u = JSON.parse(readFileSync(join(pasta, json), 'utf8')).unidades.find((x) => x.ficheiro.endsWith('b.test.mjs'));
  assert.deepEqual(u.nao_executados ?? [], [], r.stdout);
  assert.equal(u.fail, TITULOS.length, `um fail por título; a unidade: ${JSON.stringify({ estado: u.estado, pass: u.pass, fail: u.fail })}\n${r.stdout}`);
  assert.equal(u.estado, 'fail');
});

test('escapaRegex: o padrão casa só o texto exato, com cada carácter especial', () => {
  for (const t of TITULOS) {
    assert.ok(new RegExp(`^(?:${escapaRegex(t)})$`).test(t), JSON.stringify(t));
    assert.ok(!new RegExp(`^(?:${escapaRegex(t)})$`).test(t + 'x'), JSON.stringify(t) + ' + x');
  }
  assert.ok(!new RegExp(`^(?:${escapaRegex('a.c')})$`).test('abc'));
  assert.ok(!new RegExp(`^(?:${escapaRegex('a|b')})$`).test('a'));
});

test('desfazTap: inverte o escape do TAP do node (barra, cardinal e controlos)', () => {
  assert.equal(desfazTap('a \\\\ b \\# c \\n d \\t e'), 'a \\ b # c \n d \t e');
  assert.equal(desfazTap('\\\\n'), '\\n');
  assert.equal(desfazTap('sem escape (a) [b]'), 'sem escape (a) [b]');
});
