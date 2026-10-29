// F-10 critério 5 e âmbito: o scaffold gera um .checkpoints/painel.json inicial válido (projeto, modo, zero tickets) em cada
// conjunto do corpus, e o projeto gerado recebe uma cópia do leitor idêntica, byte a byte, à fonte única do pacote.
// Oráculo: os 8 conjuntos de scripts/corpus/answers, mais um nome de projeto com acentos numa pasta com espaços e acentos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { api, tmp, buildProject, corpusAnswers, ROOT, walk } from './helpers.mjs';

const projetos = new Map();
const gerar = async (nome, answers, pasta = 'p') => {
  if (!projetos.has(nome)) projetos.set(nome, await buildProject(answers, join(tmp(), pasta)));
  return projetos.get(nome);
};

test('C5: cada conjunto do corpus gera .checkpoints/painel.json válido, com o projeto, um modo e zero tickets', async () => {
  const u = await api();
  const sets = corpusAnswers();
  assert.ok(sets.length >= 8, 'corpus de respostas: ' + sets.length);
  for (const s of sets) {
    const dest = await gerar(s.name, s.value);
    const f = join(dest, '.checkpoints/painel.json');
    assert.ok(existsSync(f), s.name + ': .checkpoints/painel.json não foi gerado');
    const raw = readFileSync(f, 'utf8');
    assert.ok(!raw.startsWith('﻿'), s.name + ': o painel.json gerado começa por BOM');
    const o = JSON.parse(raw);
    assert.deepEqual(u.validar(o), [], s.name);
    assert.equal(o.versao, 1, s.name);
    assert.equal(o.projeto, s.value.projectName, s.name);
    assert.equal(typeof o.modo, 'string', s.name + ': sem modo');
    assert.ok(o.modo.length > 0, s.name + ': modo vazio');
    assert.deepEqual(o.tickets, [], s.name);
  }
});

test('C5: um projeto com acentos e espaços no nome, numa pasta com espaços e acentos, tem o nome exato no painel.json', async () => {
  const u = await api();
  const [s] = corpusAnswers();
  const dest = await gerar('acentos', { ...s.value, projectName: 'Ação Ünï 2' }, 'pasta com espaços/ação');
  const o = JSON.parse(readFileSync(join(dest, '.checkpoints/painel.json'), 'utf8'));
  assert.deepEqual(u.validar(o), []);
  assert.equal(o.projeto, 'Ação Ünï 2');
});

test('C5: o leitor do painel gerado lê o painel.json inicial sem erro (0 %, sem agentes)', async () => {
  const u = await api();
  const [s] = corpusAnswers();
  const dest = await gerar(s.name, s.value);
  const m = u.ler(readFileSync(join(dest, '.checkpoints/painel.json'), 'utf8'), {}, Date.UTC(2026, 9, 29));
  assert.equal(u.percentagem(m), 0);
  assert.deepEqual(u.agentes(m), []);
});

test('âmbito: o projeto gerado recebe uma cópia do leitor idêntica, byte a byte, à fonte do pacote', async () => {
  const u = await api();
  const fonte = readFileSync(u.leitorFonte);
  for (const s of corpusAnswers()) {
    const copia = join(await gerar(s.name, s.value), u.leitorNoProjeto);
    assert.ok(existsSync(copia), s.name + ': não há ' + u.leitorNoProjeto);
    assert.ok(readFileSync(copia).equals(fonte), s.name + ': a cópia difere da fonte');
  }
});

test('âmbito: o leitor tem uma só fonte no pacote (nenhum outro ficheiro fora de tests/ tem o mesmo conteúdo)', async () => {
  const u = await api();
  const fonte = readFileSync(u.leitorFonte);
  const iguais = walk(ROOT).filter((f) => !/^(\.git|tests|node_modules)([\\/]|$)/.test(relative(ROOT, f)) && f !== u.leitorFonte && readFileSync(f).equals(fonte));
  assert.deepEqual(iguais.map((f) => relative(ROOT, f)), []);
});

// --- Ambíguos ---
test('C5 (PERGUNTA 6): o modo do painel.json inicial vem da resposta do setup (forge.json v2, F-03), e não de um valor fixo', { todo: 'PERGUNTA 6: de onde vem o modo antes do F-03?' }, async () => {
  const [s] = corpusAnswers();
  for (const modo of ['rigoroso', 'acelerado']) {
    const dest = await buildProject({ ...s.value, modo }, join(tmp(), 'm'));
    assert.equal(JSON.parse(readFileSync(join(dest, '.checkpoints/painel.json'), 'utf8')).modo, modo);
  }
});
