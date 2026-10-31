// F-21a critério 1: `node .claude/graph.mjs update` corre `graphify update .` na raiz (a pasta-mãe de .claude/) e traduz o resultado:
// 0 → `graph: updated at <x>`, exit 0; ≠ 0 com `No code files found` na saída → `graph: nothing to index yet`, exit 0; outro ≠ 0 → as últimas
// 20 linhas da saída do graphify, exit 1; ENOENT → `graph: graphify not found`, exit 1.
// Decisão do orquestrador (#73, 2026-10-31 21:17): depois de um graphify com código 0, o graph.mjs grava graphify-out/forge-fresh.json { head, at }
// de forma atómica, sem tocar no graph.json; o <x> é o head do selo (lido do selo do forge, com o graph.json como recurso; `no commit` sem commit).
// Oráculo: o espião faz de graphify nos 4 casos, com as saídas reais da 0.9.97 (pasta vazia; «left untouched» quando o grafo não muda); um repositório
// git temporário real dá o HEAD; o comando corrido é graphify com ["update", "."] e o cwd na raiz.
// Selo: só um graphify com código 0 o grava (nos outros casos um selo antigo fica byte a byte e nenhum nasce); o graph.json fica como o graphify o
// deixou; não fica nenhum ficheiro temporário em graphify-out/. A atomicidade em si não é observável de fora (lacuna).
// O que reprova sempre: o graph.mjs a correr a passagem com LLM. Nenhuma chamada ao graphify pode ter outros args, e o código não pode nomear
// os subcomandos com LLM.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { GRAPH, UPDATED, NO_COMMIT, NOTHING, NOT_FOUND, VAZIA_1, VAZIA_2, SELO, STACK, caixa, apaga, grafo, grafoJson, grafoDe, raizNova, raizRepo, git, selo, leSelo } from './helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const sb = caixa();
lixo.push(sb.dir);
const SHA = 'c0ffee1234567890abcdef1234567890abcdef12';
const VELHO = '0123456789abcdef0123456789abcdef01234567';
const ANTIGO = '2020-01-01T00:00:00.000Z';
// saídas reais da 0.9.97 quando o grafo não muda (comentário do dev na #73)
const INTOCADO = ['No relevant changes; graphify-out left untouched.', 'No code-graph topology changes detected; outputs left untouched.'];
const todas = [];
const corre = (raiz, cenario, opts = {}) => { const r = grafo(raiz, sb, ['update'], { cenario, ...opts }); todas.push(...r.graphify); return r; };
const igual = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
const head = (raiz) => git(raiz, 'rev-parse', 'HEAD');
// a única chamada ao graphify: o binário graphify, args ["update", "."], cwd na raiz
const umaChamada = (r, raiz) => {
  assert.equal(r.graphify.length, 1, 'chamadas ao graphify: ' + JSON.stringify(r.graphify));
  assert.deepEqual(r.graphify[0].args, ['update', '.']);
  assert.ok(igual(r.graphify[0].cwd, raiz), `o graphify correu em ${r.graphify[0].cwd}, não na raiz ${raiz}`);
};
const linhas = (n, de = 1) => Array.from({ length: n }, (_, i) => `graphify erro linha ${de + i}`);
// o selo depois de um graphify com 0: { head: HEAD, at: ISO desta corrida }, e graphify-out/ só com graph.json e forge-fresh.json
const seloNovo = (raiz, h, t0) => {
  const s = leSelo(raiz);
  assert.ok(s && typeof s === 'object', SELO + ' não foi gravado');
  assert.equal(s.head, h, 'o head do selo não é o HEAD');
  assert.ok(typeof s.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s.at) && !Number.isNaN(Date.parse(s.at)), 'at não é uma data ISO: ' + s.at);
  assert.ok(Date.parse(s.at) >= t0 - 5000, 'at não é desta corrida: ' + s.at);
  assert.deepEqual(readdirSync(join(raiz, 'graphify-out')).sort(), ['forge-fresh.json', 'graph.json'], 'ficheiros em graphify-out/ (temporários deixados?)');
};
const seloAntigo = (raiz) => { selo(raiz, VELHO, ANTIGO); return readFileSync(join(raiz, SELO), 'utf8'); };
const seloIntacto = (raiz, antes) => assert.equal(readFileSync(join(raiz, SELO), 'utf8'), antes, 'o selo mudou sem um graphify com código 0');
const semSelo = (raiz) => assert.ok(!existsSync(join(raiz, SELO)), 'nasceu um selo sem um graphify com código 0');

test('C1 graphify sai com 0 e reescreve o graph.json: «graph: updated at <HEAD>» (do selo, não do built_at_commit), selo novo { head, at }, graph.json como o graphify o escreveu', async () => {
  const raiz = await raizRepo(lixo);
  const h = head(raiz);
  seloAntigo(raiz);
  grafoJson(raiz, grafoDe(VELHO));
  const escrito = JSON.stringify(grafoDe(SHA));
  const t0 = Date.now();
  const r = corre(raiz, { code: 0, out: '', err: '', grava: escrito });
  assert.deepEqual(r.linhas, [UPDATED(h)], r.out);
  assert.equal(r.status, 0, r.out);
  umaChamada(r, raiz);
  seloNovo(raiz, h, t0);
  assert.equal(readFileSync(join(raiz, 'graphify-out/graph.json'), 'utf8'), escrito, 'o graph.mjs mexeu no graph.json');
});

for (const saida of INTOCADO) {
  test(`C1 graphify sai com 0 e deixa o graph.json intocado («${saida}»): «graph: updated at <HEAD>», selo no HEAD, graph.json byte a byte`, async () => {
    const raiz = await raizRepo(lixo);
    const h = head(raiz);
    const antes = JSON.stringify(grafoDe(null));
    grafoJson(raiz, antes);
    const t0 = Date.now();
    const r = corre(raiz, { code: 0, out: saida + '\n', err: '' });
    assert.deepEqual(r.linhas, [UPDATED(h)], r.out);
    assert.equal(r.status, 0, r.out);
    umaChamada(r, raiz);
    seloNovo(raiz, h, t0);
    assert.equal(readFileSync(join(raiz, 'graphify-out/graph.json'), 'utf8'), antes, 'o graph.mjs mexeu no graph.json');
  });
}

test('C1 graphify sai com 0 num repositório sem commit (built_at_commit null): «graph: updated at no commit», exit 0', async () => {
  const raiz = await raizNova(lixo);
  git(raiz, 'init', '-q', '-b', 'main');
  const r = corre(raiz, { code: 0, out: '', err: '', grava: grafoDe(null) });
  assert.deepEqual(r.linhas, [UPDATED(NO_COMMIT)], r.out);
  assert.equal(r.status, 0, r.out);
  umaChamada(r, raiz);
});

for (const [nome, cen] of [
  ['as duas linhas no stdout', { code: 1, out: VAZIA_1 + '\n' + VAZIA_2 + '\n', err: '' }],
  ['a primeira no stdout e a de «No code files found» no stderr', { code: 1, out: VAZIA_1 + '\n', err: VAZIA_2 + '\n' }],
]) {
  test(`C1 pasta vazia (saída real da 0.9.97, ${nome}): «graph: nothing to index yet», exit 0, e nenhum selo nasce`, async () => {
    const raiz = await raizRepo(lixo);
    const r = corre(raiz, cen);
    assert.deepEqual(r.linhas, [NOTHING], r.out);
    assert.equal(r.status, 0, r.out);
    umaChamada(r, raiz);
    semSelo(raiz);
  });
}

test('C1 ≠ 0 só com «Nothing to update or rebuild failed» (sem «No code files found») é uma falha: as linhas do graphify, exit 1, selo antigo intacto', async () => {
  const raiz = await raizRepo(lixo);
  const antes = seloAntigo(raiz);
  const r = corre(raiz, { code: 1, out: VAZIA_1 + '\n', err: '' });
  assert.deepEqual(r.linhas, [VAZIA_1], r.out);
  assert.equal(r.status, 1, r.out);
  seloIntacto(raiz, antes);
});

for (const [nome, cen, esperado] of [
  ['30 linhas no stdout, terminadas em \\n, código 2', { code: 2, out: linhas(30).join('\n') + '\n', err: '' }, linhas(20, 11)],
  ['25 linhas no stderr, código 1', { code: 1, out: '', err: linhas(25).join('\r\n') + '\r\n' }, linhas(20, 6)],
  ['3 linhas, código 3', { code: 3, out: linhas(3).join('\n'), err: '' }, linhas(3)],
]) {
  test(`C1 outro ≠ 0 (${nome}): as últimas 20 linhas da saída do graphify, exit 1, selo antigo intacto`, async () => {
    const raiz = await raizRepo(lixo);
    const antes = seloAntigo(raiz);
    const r = corre(raiz, cen);
    assert.deepEqual(r.linhas, esperado, r.out);
    assert.equal(r.status, 1, r.out);
    umaChamada(r, raiz);
    seloIntacto(raiz, antes);
  });
}

test('C1 graphify não existe (ENOENT): «graph: graphify not found», exit 1, sem stack trace, e nenhum selo nasce', async () => {
  const raiz = await raizRepo(lixo);
  const r = corre(raiz, null);
  assert.deepEqual(r.linhas, [NOT_FOUND], r.out);
  assert.equal(r.status, 1, r.out);
  assert.ok(!STACK.test(r.out), r.out);
  semSelo(raiz);
});

test('C1 corre sempre na raiz: lançado de dentro de .claude/, o graphify corre na pasta-mãe de .claude/ e o selo fica na raiz', async () => {
  const raiz = await raizRepo(lixo);
  const h = head(raiz);
  const t0 = Date.now();
  const r = corre(raiz, { code: 0, out: '', err: '', grava: grafoDe(SHA) }, { cwd: join(raiz, '.claude') });
  assert.deepEqual(r.linhas, [UPDATED(h)], r.out);
  assert.equal(r.status, 0, r.out);
  umaChamada(r, raiz);
  seloNovo(raiz, h, t0);
  assert.ok(!existsSync(join(raiz, '.claude', 'graphify-out')), 'graphify-out/ apareceu dentro de .claude/');
});

// O QUE REPROVA: a passagem com LLM
test('C1 nunca a passagem com LLM: todas as chamadas ao graphify dos cenários acima foram exatamente «update .»', () => {
  assert.ok(todas.length >= 10, 'controlo: só ' + todas.length + ' chamadas registadas');
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