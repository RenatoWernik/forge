// F-21a critério 2: `node .claude/graph.mjs docs [--mark]` compara o sha256 do conteúdo de specs/*/spec.md, specs/*/plan.md, CONTEXT.md, GLOSSARY.md e
// docs/adr/*.md com o carimbo graphify-out/forge-docs.json ({caminho: sha256}). Imprime `docs: unchanged` ou
// `docs: changed <n> files, <w> words: <caminhos separados por vírgula>`, sempre com exit 0; <w> conta os \S+ dos ficheiros mudados; um ficheiro novo ou
// apagado conta como mudado; o tasks.md nunca conta; --mark grava o carimbo e imprime `docs: marked <n> files`.
// Oráculo: a fixture da issue (spec, plan, um ADR e um tasks.md) e os seus 5 passos; mais as classes à volta dos padrões (só um nível em specs/*/,
// só .md direto em docs/adr/, CONTEXT.md e GLOSSARY.md na raiz), a raiz vazia e a chamada fora da raiz.
// Leitura: a ordem e o espaço depois da vírgula não estão no contrato, por isso os caminhos comparam-se como conjunto, em barras normais.
// Um ficheiro apagado não tem conteúdo a ler: conta 0 palavras. O docs nunca lança processos (nem o graphify).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UNCHANGED, CHANGED, MARKED, CARIMBO, caixa, apaga, grafo, raizNova, escreve, palavras, fwd } from './helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const sb = caixa();
lixo.push(sb.dir);

const F = { spec: 'specs/001-faturas/spec.md', plan: 'specs/001-faturas/plan.md', adr: 'docs/adr/0001-moeda.md', tasks: 'specs/001-faturas/tasks.md' };
const C = {
  spec: '# Faturas\r\n\r\nO utilizador  emite\tfaturas em €\u00A0com IVA.\nPalavra-composta e ação — fim.\n',
  plan: '# Plano\n\n- passo um\n- passo dois\n',
  adr: '# ADR 0001: moeda\n\nUsamos EUR sempre.\n',
  tasks: '- [ ] T001 criar a fatura\n',
};
const fixture = async () => { const r = await raizNova(lixo); for (const k of Object.keys(F)) escreve(r, F[k], C[k]); return r; };
const docs = (raiz, ...args) => {
  const r = grafo(raiz, sb, ['docs', ...args], { cenario: { code: 0, out: '', err: '' } });
  assert.equal(r.status, 0, 'o docs não saiu com 0:\n' + r.out);
  assert.deepEqual(r.chamadas, [], 'o docs lançou processos: ' + JSON.stringify(r.chamadas));
  return r;
};
const so = (r, l) => assert.deepEqual(r.linhas, [l], r.out);
const changed = (r) => {
  assert.equal(r.linhas.length, 1, r.out);
  const m = r.linhas[0].match(CHANGED);
  assert.ok(m, 'não é «docs: changed <n> files, <w> words: <caminhos>»: ' + r.linhas[0]);
  return { n: Number(m[1]), w: Number(m[2]), caminhos: m[3].split(',').map((s) => fwd(s.trim()).replace(/^\.\//, '')).sort() };
};
const W = (...ks) => ks.reduce((a, k) => a + palavras(C[k]), 0);

test('C2 sem carimbo: «changed 3 files» com a soma exata das palavras de spec, plan e ADR (o tasks.md não conta), exit 0', async () => {
  const raiz = await fixture();
  assert.deepEqual(changed(docs(raiz)), { n: 3, w: W('spec', 'plan', 'adr'), caminhos: [F.spec, F.plan, F.adr].sort() });
});

test('C2 --mark: «docs: marked 3 files», cria graphify-out/forge-docs.json com {caminho: sha256 do conteúdo} dos 3; depois o docs diz «unchanged»', async () => {
  const raiz = await fixture();
  so(docs(raiz, '--mark'), MARKED(3));
  const f = join(raiz, CARIMBO);
  assert.ok(existsSync(f), CARIMBO + ' não foi gravado');
  const j = JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
  const norm = Object.fromEntries(Object.entries(j).map(([k, v]) => [fwd(k).replace(/^\.\//, ''), String(v).toLowerCase()]));
  assert.deepEqual(Object.keys(norm).sort(), [F.spec, F.plan, F.adr].sort());
  for (const k of ['spec', 'plan', 'adr']) assert.equal(norm[F[k]], createHash('sha256').update(readFileSync(join(raiz, F[k]))).digest('hex'), 'sha256 de ' + F[k]);
  so(docs(raiz), UNCHANGED);
});

test('C2 depois do --mark, mudar só o tasks.md (marcas [X]) dá «unchanged»', async () => {
  const raiz = await fixture();
  docs(raiz, '--mark');
  writeFileSync(join(raiz, F.tasks), '- [X] T001 criar a fatura\n- [X] T002 outra\n');
  so(docs(raiz), UNCHANGED);
});

test('C2 depois do --mark, mudar um byte do ADR (mesmo tamanho e mesmas palavras) dá «changed 1 files» com as palavras do ADR', async () => {
  const raiz = await fixture();
  docs(raiz, '--mark');
  writeFileSync(join(raiz, F.adr), C.adr.replace('EUR', 'EUX'));
  assert.deepEqual(changed(docs(raiz)), { n: 1, w: W('adr'), caminhos: [F.adr] });
});

test('C2 depois do --mark, apagar o plan dá «changed 1 files» (0 palavras); --mark grava 2 e volta a «unchanged»', async () => {
  const raiz = await fixture();
  docs(raiz, '--mark');
  rmSync(join(raiz, F.plan));
  assert.deepEqual(changed(docs(raiz)), { n: 1, w: 0, caminhos: [F.plan] });
  so(docs(raiz, '--mark'), MARKED(2));
  so(docs(raiz), UNCHANGED);
});

test('C2 depois do --mark, um ADR novo conta como mudado, com as suas palavras', async () => {
  const raiz = await fixture();
  docs(raiz, '--mark');
  const novo = '# ADR 0002: arredondamento\n\nArredonda ao cêntimo, metade para cima.\n';
  escreve(raiz, 'docs/adr/0002-arredondamento.md', novo);
  assert.deepEqual(changed(docs(raiz)), { n: 1, w: palavras(novo), caminhos: ['docs/adr/0002-arredondamento.md'] });
});

test('C2 os padrões exatos: CONTEXT.md e GLOSSARY.md da raiz contam; specs/spec.md, specs/a/b/spec.md, specs/x/research.md, docs/adr/sub/*.md, docs/adr/*.txt e tasks.md não', async () => {
  const raiz = await raizNova(lixo);
  const ctx = '# Context\n\nTermos do domínio.\n', glo = '# Glossary\n\nFatura: documento.\n';
  escreve(raiz, 'CONTEXT.md', ctx);
  escreve(raiz, 'GLOSSARY.md', glo);
  for (const d of ['specs/spec.md', 'specs/a/b/spec.md', 'specs/a/b/plan.md', 'specs/001-x/research.md', 'specs/001-x/tasks.md', 'docs/adr/sub/0009.md', 'docs/adr/0010.txt', 'docs/CONTEXT.md', 'docs/GLOSSARY.md', 'README.md']) escreve(raiz, d, '# isco ' + d + '\n');
  assert.deepEqual(changed(docs(raiz)), { n: 2, w: palavras(ctx) + palavras(glo), caminhos: ['CONTEXT.md', 'GLOSSARY.md'] });
});

test('C2 a raiz vazia (o CP0): sem docs e sem carimbo, «docs: unchanged»; --mark dá «docs: marked 0 files»; exit 0', async () => {
  const raiz = await raizNova(lixo);
  so(docs(raiz), UNCHANGED);
  so(docs(raiz, '--mark'), MARKED(0));
  so(docs(raiz), UNCHANGED);
});

test('C2 corre sempre na raiz: lançado de dentro de .claude/, lê os docs e grava o carimbo na raiz', async () => {
  const raiz = await fixture();
  const dentro = (...a) => { const r = grafo(raiz, sb, ['docs', ...a], { cwd: join(raiz, '.claude'), cenario: { code: 0, out: '', err: '' } }); assert.equal(r.status, 0, r.out); return r; };
  assert.deepEqual(changed(dentro()), { n: 3, w: W('spec', 'plan', 'adr'), caminhos: [F.spec, F.plan, F.adr].sort() });
  so(dentro('--mark'), MARKED(3));
  assert.ok(existsSync(join(raiz, CARIMBO)), 'o carimbo não ficou em <raiz>/' + CARIMBO);
  assert.ok(!existsSync(join(raiz, '.claude', CARIMBO)), 'o carimbo foi para .claude/');
  so(docs(raiz), UNCHANGED);
});

test('C2 sempre exit 0: um carimbo com JSON inválido não faz o docs falhar (e a saída é uma das duas formas)', async () => {
  const raiz = await fixture();
  escreve(raiz, CARIMBO, '{ isto não é json');
  const r = docs(raiz);
  assert.equal(r.linhas.length, 1, r.out);
  assert.ok(r.linhas[0] === UNCHANGED || CHANGED.test(r.linhas[0]), r.linhas[0]);
});