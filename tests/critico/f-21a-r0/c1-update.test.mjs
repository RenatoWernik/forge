// F-21a critério 1: `node .claude/graph.mjs update` corre `graphify update .` na raiz (a pasta-mãe de .claude/) e traduz o resultado:
// 0 → `graph: updated at <built_at_commit>` (lido de graphify-out/graph.json; `no commit` quando é null), exit 0; ≠ 0 com `No code files found` na saída
// → `graph: nothing to index yet`, exit 0; outro ≠ 0 → as últimas 20 linhas da saída do graphify, exit 1; ENOENT → `graph: graphify not found`, exit 1.
// Oráculo: o espião faz de graphify nos 4 casos, com a saída real da 0.9.97 na pasta vazia; o comando corrido é graphify com ["update", "."] e o cwd na raiz.
// O que reprova sempre: o graph.mjs a correr a passagem com LLM. Nenhuma chamada ao graphify pode ter outros args, e o código não pode nomear
// os subcomandos extract, label nem cluster-only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { GRAPH, UPDATED, NO_COMMIT, NOTHING, NOT_FOUND, VAZIA_1, VAZIA_2, STACK, caixa, apaga, grafo, grafoJson, grafoDe, raizNova } from './helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const sb = caixa();
lixo.push(sb.dir);
const SHA = 'c0ffee1234567890abcdef1234567890abcdef12';
const VELHO = '0123456789abcdef0123456789abcdef01234567';
const todas = [];
const corre = (raiz, cenario, opts = {}) => { const r = grafo(raiz, sb, ['update'], { cenario, ...opts }); todas.push(...r.graphify); return r; };
const igual = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
// a única chamada ao graphify: o binário graphify, args ["update", "."], cwd na raiz
const umaChamada = (r, raiz) => {
  assert.equal(r.graphify.length, 1, 'chamadas ao graphify: ' + JSON.stringify(r.graphify));
  assert.deepEqual(r.graphify[0].args, ['update', '.']);
  assert.ok(igual(r.graphify[0].cwd, raiz), `o graphify correu em ${r.graphify[0].cwd}, não na raiz ${raiz}`);
};
const linhas = (n, de = 1) => Array.from({ length: n }, (_, i) => `graphify erro linha ${de + i}`);

test('C1 graphify sai com 0: «graph: updated at <built_at_commit>» do graph.json que o graphify acabou de escrever (não o anterior), exit 0', async () => {
  const raiz = await raizNova(lixo);
  grafoJson(raiz, grafoDe(VELHO));
  const r = corre(raiz, { code: 0, out: '', err: '', grava: grafoDe(SHA) });
  assert.deepEqual(r.linhas, [UPDATED(SHA)], r.out);
  assert.equal(r.status, 0, r.out);
  umaChamada(r, raiz);
});

test('C1 graphify sai com 0 e built_at_commit é null: «graph: updated at no commit», exit 0', async () => {
  const raiz = await raizNova(lixo);
  const r = corre(raiz, { code: 0, out: '', err: '', grava: grafoDe(null) });
  assert.deepEqual(r.linhas, [UPDATED(NO_COMMIT)], r.out);
  assert.equal(r.status, 0, r.out);
  umaChamada(r, raiz);
});

for (const [nome, cen] of [
  ['as duas linhas no stdout', { code: 1, out: VAZIA_1 + '\n' + VAZIA_2 + '\n', err: '' }],
  ['a primeira no stdout e a de «No code files found» no stderr', { code: 1, out: VAZIA_1 + '\n', err: VAZIA_2 + '\n' }],
]) {
  test(`C1 pasta vazia (saída real da 0.9.97, ${nome}): «graph: nothing to index yet», exit 0`, async () => {
    const raiz = await raizNova(lixo);
    const r = corre(raiz, cen);
    assert.deepEqual(r.linhas, [NOTHING], r.out);
    assert.equal(r.status, 0, r.out);
    umaChamada(r, raiz);
  });
}

test('C1 ≠ 0 só com «Nothing to update or rebuild failed» (sem «No code files found») é uma falha: as linhas do graphify, exit 1', async () => {
  const raiz = await raizNova(lixo);
  const r = corre(raiz, { code: 1, out: VAZIA_1 + '\n', err: '' });
  assert.deepEqual(r.linhas, [VAZIA_1], r.out);
  assert.equal(r.status, 1, r.out);
});

for (const [nome, cen, esperado] of [
  ['30 linhas no stdout, terminadas em \\n, código 2', { code: 2, out: linhas(30).join('\n') + '\n', err: '' }, linhas(20, 11)],
  ['25 linhas no stderr, código 1', { code: 1, out: '', err: linhas(25).join('\r\n') + '\r\n' }, linhas(20, 6)],
  ['3 linhas, código 3', { code: 3, out: linhas(3).join('\n'), err: '' }, linhas(3)],
]) {
  test(`C1 outro ≠ 0 (${nome}): as últimas 20 linhas da saída do graphify, exit 1`, async () => {
    const raiz = await raizNova(lixo);
    const r = corre(raiz, cen);
    assert.deepEqual(r.linhas, esperado, r.out);
    assert.equal(r.status, 1, r.out);
    umaChamada(r, raiz);
  });
}

test('C1 graphify não existe (ENOENT): «graph: graphify not found», exit 1, sem stack trace', async () => {
  const raiz = await raizNova(lixo);
  const r = corre(raiz, null);
  assert.deepEqual(r.linhas, [NOT_FOUND], r.out);
  assert.equal(r.status, 1, r.out);
  assert.ok(!STACK.test(r.out), r.out);
});

test('C1 corre sempre na raiz: lançado de dentro de .claude/, o graphify corre na pasta-mãe de .claude/ e o graph.json lido é o da raiz', async () => {
  const raiz = await raizNova(lixo);
  const r = corre(raiz, { code: 0, out: '', err: '', grava: grafoDe(SHA) }, { cwd: join(raiz, '.claude') });
  assert.deepEqual(r.linhas, [UPDATED(SHA)], r.out);
  assert.equal(r.status, 0, r.out);
  umaChamada(r, raiz);
  assert.ok(!existsSync(join(raiz, '.claude', 'graphify-out')), 'graphify-out/ apareceu dentro de .claude/');
});

// O QUE REPROVA: a passagem com LLM
test('C1 nunca a passagem com LLM: todas as chamadas ao graphify dos cenários acima foram exatamente «update .»', () => {
  assert.ok(todas.length >= 8, 'controlo: só ' + todas.length + ' chamadas registadas');
  assert.deepEqual(todas.filter((c) => JSON.stringify(c.args) !== '["update","."]'), []);
});

test('C1 nunca a passagem com LLM: o graph.mjs não nomeia o subcomando label, extract sem --code-only, cluster-only sem --no-label, nem a skill /graphify', () => {
  assert.ok(existsSync(GRAPH), 'templates/.claude/graph.mjs não existe');
  const src = readFileSync(GRAPH, 'utf8');
  const sub = (n) => new RegExp('([\'"`])' + n + '\\1|\\bgraphify\\s+' + n + '\\b').test(src);
  assert.ok(!sub('label'), 'o subcomando label em graph.mjs');
  assert.ok(!sub('extract') || src.includes('--code-only'), 'extract sem --code-only em graph.mjs');
  assert.ok(!sub('cluster-only') || src.includes('--no-label'), 'cluster-only sem --no-label em graph.mjs');
  assert.ok(!/['"`]\/graphify\b/.test(src), 'a skill /graphify em graph.mjs');
});