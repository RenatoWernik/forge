// F-21a critério 3: a frescura no `check.cjs --env`, linha nova `Graphify: graph.json built at HEAD`. A linha dos hooks do graphify fica como está.
// Oráculo: um repositório git temporário real e um graph.json escrito pelo teste, nos 5 casos da tabela, mais o JSON inválido (`(unreadable)`).
// O que reprova sempre: um `ok` falso. Classes atacadas: built_at_commit que é só um prefixo do HEAD, o sha do HEAD noutro campo, o campo ausente,
// JSON válido que não é um objeto, graph.json que é uma pasta, um commit novo depois do grafo. O check nunca reconstrói o grafo (só `hook status`).
// Resposta do orquestrador na #73: com built_at_commit null, o <x> do stale é «no commit» (o mesmo texto do C1).
// Decisão do selo (#73, 2026-10-31 21:17): a frescura compara o HEAD com o head de graphify-out/forge-fresh.json e, só se o selo faltar, com o
// built_at_commit do graph.json; sem nenhum dos dois, `built at no commit`. A tabela da issue continua para o graph.json: ausente = missing,
// JSON inválido = unreadable, nunca ok, mesmo com um selo no HEAD. Ponta a ponta: graph.mjs update com graphify 0 e graph.json intocado ⇒ fresco.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { NO_COMMIT, L_FRESCA, L_HOOKS, D_MISSING, D_NO_COMMIT, D_STALE, D_UNREADABLE, SELO, caixa, apaga, checkEnv, linhasCom, repo, git, grafo, grafoJson, grafoDe, selo, leSelo, escreve, STACK } from './helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const sb = caixa();
lixo.push(sb.dir);
const OUTRO = 'feedfacefeedfacefeedfacefeedfacefeedface';
const OK = 'ok    ' + L_FRESCA;
const FAIL = (d) => 'FAIL  ' + L_FRESCA + ' ' + d;
const frescura = (proj) => {
  const r = checkEnv(proj, sb);
  const ls = linhasCom(r, L_FRESCA);
  assert.equal(ls.length, 1, `a linha «${L_FRESCA}» aparece ${ls.length} vezes:\n` + r.out.slice(0, 3000));
  assert.ok(!STACK.test(r.out), 'stack trace no --env:\n' + r.out.slice(0, 3000));
  return { r, l: ls[0] };
};
const head = (p) => git(p, 'rev-parse', 'HEAD');

test('C3 sem commit e sem graph.json: FAIL com «(missing: run node .claude/graph.mjs update)»', async () => {
  const p = await repo(lixo, 0);
  assert.equal(frescura(p).l, FAIL(D_MISSING));
});

for (const [nome, g] of [['built_at_commit null', grafoDe(null)], ['built_at_commit qualquer', grafoDe(OUTRO)]]) {
  test(`C3 sem commit e com graph.json (${nome}): ok com «(no commit yet)»`, async () => {
    const p = await repo(lixo, 0);
    grafoJson(p, g);
    assert.equal(frescura(p).l, OK + ' ' + D_NO_COMMIT);
  });
}

test('C3 com commit e sem graph.json: FAIL com «(missing: …)»', async () => {
  const p = await repo(lixo, 1);
  assert.equal(frescura(p).l, FAIL(D_MISSING));
});

test('C3 com commit e built_at_commit == HEAD: ok', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(head(p)));
  assert.equal(frescura(p).l, OK);
});

test('C3 com commit e built_at_commit != HEAD: FAIL com «(stale: built at <x>, HEAD is <sha>; run node .claude/graph.mjs update)»', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(OUTRO));
  assert.equal(frescura(p).l, FAIL(D_STALE(OUTRO, head(p))));
});

test('C3 com commit e built_at_commit null: FAIL com «(stale: built at no commit, HEAD is <sha>; run node .claude/graph.mjs update)»', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(null));
  assert.equal(frescura(p).l, FAIL(D_STALE(NO_COMMIT, head(p))));
});

test('C3 graph.json com JSON inválido: FAIL com «(unreadable)», nunca ok', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, '{"built_at_commit": "' + head(p) + '", ');
  assert.equal(frescura(p).l, FAIL(D_UNREADABLE));
});

// O QUE REPROVA: um ok falso
test('C3 ok falso: built_at_commit que é só o prefixo curto do HEAD é stale (comparação exata)', async () => {
  const p = await repo(lixo, 1);
  const curto = head(p).slice(0, 7);
  grafoJson(p, grafoDe(curto));
  assert.equal(frescura(p).l, FAIL(D_STALE(curto, head(p))));
});

test('C3 ok falso: o sha do HEAD noutro campo do graph.json não conta (built_at_commit é outro)', async () => {
  const p = await repo(lixo, 1);
  const g = grafoDe(OUTRO);
  g.nodes.push({ id: head(p), label: 'commit ' + head(p) });
  g.graph = { commit: head(p) };
  grafoJson(p, g);
  assert.equal(frescura(p).l, FAIL(D_STALE(OUTRO, head(p))));
});

for (const [nome, conteudo] of [
  ['sem o campo built_at_commit, com o HEAD noutro campo', (h) => JSON.stringify({ nodes: [], links: [], commit: h })],
  ['o JSON null', () => 'null'],
  ['um array com o HEAD', (h) => JSON.stringify([h])],
  ['uma string com o HEAD', (h) => JSON.stringify(h)],
]) {
  test(`C3 ok falso: graph.json ${nome} dá FAIL`, async () => {
    const p = await repo(lixo, 1);
    grafoJson(p, conteudo(head(p)));
    assert.ok(frescura(p).l.startsWith('FAIL  ' + L_FRESCA + ' ('), 'devia ser FAIL');
  });
}

test('C3 ok falso: graph.json que é uma pasta dá FAIL', async () => {
  const p = await repo(lixo, 1);
  mkdirSync(join(p, 'graphify-out/graph.json'), { recursive: true });
  assert.ok(frescura(p).l.startsWith('FAIL  ' + L_FRESCA + ' ('), 'devia ser FAIL');
});

test('C3 ok falso: um commit novo depois do grafo deixa-o stale contra o HEAD novo', async () => {
  const p = await repo(lixo, 1);
  const antigo = head(p);
  grafoJson(p, grafoDe(antigo));
  assert.equal(frescura(p).l, OK, 'controlo: no HEAD do grafo devia ser ok');
  writeFileSync(join(p, 'critico-novo.txt'), 'novo');
  git(p, 'add', 'critico-novo.txt');
  git(p, 'commit', '-q', '-m', 'critico novo');
  assert.notEqual(head(p), antigo);
  assert.equal(frescura(p).l, FAIL(D_STALE(antigo, head(p))));
});

// O SELO DO FORGE (decisão de 2026-10-31 21:17)
test('C3 selo no HEAD e built_at_commit de outro commit (o graphify deixou o graph.json intocado): ok', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(OUTRO));
  selo(p, head(p));
  assert.equal(frescura(p).l, OK);
});

test('C3 selo no HEAD e built_at_commit null: ok', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(null));
  selo(p, head(p));
  assert.equal(frescura(p).l, OK);
});

test('C3 o selo manda: selo de outro commit e built_at_commit == HEAD dá FAIL stale «built at <head do selo>»', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(head(p)));
  selo(p, OUTRO);
  assert.equal(frescura(p).l, FAIL(D_STALE(OUTRO, head(p))));
});

test('C3 sem commit, com graph.json e selo: ok com «(no commit yet)»', async () => {
  const p = await repo(lixo, 0);
  grafoJson(p, grafoDe(null));
  selo(p, null);
  assert.equal(frescura(p).l, OK + ' ' + D_NO_COMMIT);
});

// O QUE REPROVA: um ok falso com o selo
test('C3 ok falso: selo no HEAD mas sem graph.json dá FAIL «(missing: …)»', async () => {
  const p = await repo(lixo, 1);
  selo(p, head(p));
  assert.equal(frescura(p).l, FAIL(D_MISSING));
});

test('C3 ok falso: selo no HEAD mas graph.json com JSON inválido dá FAIL «(unreadable)»', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, '{"nodes": [');
  selo(p, head(p));
  assert.equal(frescura(p).l, FAIL(D_UNREADABLE));
});

test('C3 ok falso: selo com o prefixo curto do HEAD é stale (comparação exata)', async () => {
  const p = await repo(lixo, 1);
  const curto = head(p).slice(0, 7);
  grafoJson(p, grafoDe(OUTRO));
  selo(p, curto);
  assert.equal(frescura(p).l, FAIL(D_STALE(curto, head(p))));
});

test('C3 ok falso: o HEAD noutro campo do selo não conta (head é outro)', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(OUTRO));
  escreve(p, SELO, JSON.stringify({ head: OUTRO, at: head(p), commit: head(p) }));
  assert.equal(frescura(p).l, FAIL(D_STALE(OUTRO, head(p))));
});

test('C3 ok falso: selo com JSON inválido e built_at_commit de outro commit dá FAIL', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(OUTRO));
  escreve(p, SELO, '{"head": "' + head(p) + '", ');
  assert.ok(frescura(p).l.startsWith('FAIL  ' + L_FRESCA + ' ('), 'devia ser FAIL');
});

test('C3 ok falso: um commit novo depois do selo deixa-o stale contra o HEAD novo, «built at <head do selo>»', async () => {
  const p = await repo(lixo, 1);
  const antigo = head(p);
  grafoJson(p, grafoDe(null));
  selo(p, antigo);
  assert.equal(frescura(p).l, OK, 'controlo: no HEAD do selo devia ser ok');
  writeFileSync(join(p, 'critico-novo.txt'), 'novo');
  git(p, 'add', 'critico-novo.txt');
  git(p, 'commit', '-q', '-m', 'critico novo');
  assert.equal(frescura(p).l, FAIL(D_STALE(antigo, head(p))));
});

// PONTA A PONTA: o caso do CP0 que o dev mediu com o graphify real (#73, 2026-10-31 21:16)
for (const saida of ['No relevant changes; graphify-out left untouched.', 'No code-graph topology changes detected; outputs left untouched.']) {
  test(`C3 ponta a ponta: graph.mjs update com graphify 0 e graph.json intocado («${saida}») ⇒ ok no --env; o graph.json fica byte a byte`, async () => {
    const p = await repo(lixo, 1);
    const antes = JSON.stringify(grafoDe(null));
    grafoJson(p, antes);
    assert.equal(frescura(p).l, FAIL(D_STALE(NO_COMMIT, head(p))), 'controlo: antes do update devia ser stale');
    const u = grafo(p, sb, ['update'], { cenario: { code: 0, out: saida + '\n', err: '' } });
    assert.equal(u.status, 0, u.out);
    assert.equal((leSelo(p) || {}).head, head(p), 'o update não gravou o selo no HEAD');
    assert.equal(readFileSync(join(p, 'graphify-out/graph.json'), 'utf8'), antes, 'o graph.mjs mexeu no graph.json');
    assert.equal(frescura(p).l, OK);
  });
}

test('C3 o check nunca reconstrói o grafo: as únicas chamadas ao graphify do --env são «hook status»', async () => {
  const p = await repo(lixo, 1);
  grafoJson(p, grafoDe(OUTRO));
  const { r } = frescura(p);
  assert.deepEqual(r.graphify.filter((c) => JSON.stringify(c.args) !== '["hook","status"]'), [], JSON.stringify(r.graphify));
});

// GUARDA (verde na base): a linha dos hooks do graphify fica como está, com o prefixo Graphify:
test('GUARDA C3: a linha «Graphify: post-commit and post-checkout hooks installed» continua no --env, uma vez, com o nome igual', async () => {
  const p = await repo(lixo, 1);
  const r = checkEnv(p, sb);
  assert.deepEqual(linhasCom(r, 'Graphify: post-commit'), ['FAIL  ' + L_HOOKS], r.out.slice(0, 3000));
});