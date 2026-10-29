// F-04 critério 4: num projeto do corpus, a `reason` de cada papel aparece no forge.json e no corpo da nota notes/n0001
// (do tipo `decisao`) que a skill manda semear. Oráculo: igualdade das razões com as respostas.
// «cada papel» é um «todos»: corre nos 8 projetos do corpus (scripts/corpus/answers) e, porque o corpus repete as mesmas 5
// razões em todos os ficheiros, também em 12 respostas geradas com seed fixa, com razões distintas por papel e por projeto
// (acentos, aspas, apóstrofos, <, &, %). Uma razão fixa no código, trocada entre papéis ou de outro projeto não passa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ROLES, PONTE, loadPonte, loadCorpus, generated, generate, step, TITLES } from './helpers.mjs';

const CASOS = () => [...loadCorpus(), ...generated(404, 12)];

test('C4: o corpus de respostas existe e tem os 8 projetos', () => {
  assert.equal(loadCorpus().length, 8, loadCorpus().map((c) => c.name).join(', '));
});

test('C4: o forge.json de cada projeto (corpus + gerados) grava a razão de cada papel, igual à resposta', async () => {
  const errado = [];
  for (const { name, value } of CASOS()) {
    const { fj } = await generate(value);
    for (const r of ROLES) if (fj.models?.[r]?.reason !== value.models[r].reason) errado.push(`${name} ${r}: ${JSON.stringify(fj.models?.[r]?.reason)}`);
  }
  assert.deepEqual(errado, []);
});

// Resposta 1: a ponte tests/ponte/f-04.mjs só reexporta o produtor do pacote (ver helpers.mjs)
test('C4: existe a ponte tests/ponte/f-04.mjs, e ela só reexporta do pacote', () => {
  assert.ok(existsSync(PONTE), 'falta tests/ponte/f-04.mjs (resposta 1): o corpo de notes/n0001 não tem uma origem verificável');
  const src = readFileSync(PONTE, 'utf8');
  for (const proibido of ['forge.json', 'reason', 'models']) assert.ok(!src.includes(proibido), `a ponte menciona «${proibido}»: tem de reexportar a nota do pacote, não reconstruí-la`);
  const origens = [...src.matchAll(/\b(?:from|import)\s*\(?\s*(['"])(.+?)\1/g)].map((m) => m[2]);
  assert.ok(origens.length > 0, 'a ponte não importa nem reexporta nada do pacote');
  assert.deepEqual(origens.filter((o) => !/^(\.\.\/)+scripts\/[\w.-]+\.m?js$/.test(o)), [], 'a ponte importa de fora de scripts/ do pacote');
});

test('C4: a nota notes/n0001 de cada projeto é do tipo `decisao` e o corpo tem a razão de cada papel, à letra', async () => {
  assert.ok(existsSync(PONTE), 'falta tests/ponte/f-04.mjs (resposta 1)');
  const { notaDecisao } = await loadPonte();
  assert.equal(typeof notaDecisao, 'function', 'a ponte não exporta notaDecisao(dest)');
  const errado = [];
  for (const { name, value } of CASOS()) {
    const { dest } = await generate(value);
    const nota = await notaDecisao(dest);
    if (nota?.kind !== 'decisao') { errado.push(`${name}: kind ${JSON.stringify(nota?.kind)}`); continue; }
    if (typeof nota.body !== 'string') { errado.push(`${name}: body não é texto`); continue; }
    for (const r of ROLES) {
      if (!nota.body.includes(value.models[r].reason)) errado.push(`${name} ${r}: a razão «${value.models[r].reason}» não está no corpo`);
      if (!new RegExp(`(?<![\\w])${r}(?![\\w])`).test(nota.body)) errado.push(`${name}: o corpo não nomeia o papel ${r}`);
    }
  }
  assert.deepEqual(errado, []);
});

test('C4: a nota de um projeto não traz as razões de outro (a ponte lê o projeto de `dest`)', async () => {
  assert.ok(existsSync(PONTE), 'falta tests/ponte/f-04.mjs (resposta 1)');
  const { notaDecisao } = await loadPonte();
  const [a, b] = generated(808, 2);
  const pa = await generate(a.value), pb = await generate(b.value);
  const na = await notaDecisao(pa.dest), nb = await notaDecisao(pb.dest);
  for (const r of ROLES) {
    assert.ok(!String(na?.body).includes(b.value.models[r].reason), `a nota de A traz a razão de ${r} de B`);
    assert.ok(!String(nb?.body).includes(a.value.models[r].reason), `a nota de B traz a razão de ${r} de A`);
  }
});

test('C4: o passo do painel manda semear notes/n0001 como `decisao` com a razão de cada papel', () => {
  const painel = step(TITLES[5]);
  assert.ok(painel, 'sem o passo ' + TITLES[5]);
  const linha = painel.body.split('\n').find((l) => l.includes('notes/n0001'));
  assert.ok(linha, 'a skill não manda semear notes/n0001 no passo do painel');
  assert.ok(/decisao/.test(linha), 'a linha de notes/n0001 não diz kind `decisao`: ' + linha);
  assert.ok(/reason|razão|razões/i.test(linha), 'a linha de notes/n0001 não diz que o corpo leva a razão de cada papel: ' + linha);
});
