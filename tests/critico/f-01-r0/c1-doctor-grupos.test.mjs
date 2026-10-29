// F-01 critério 1: o registo do doctor não tem o claude-mem e os grupos são exatamente os 6 (igualdade de conjuntos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, copyPackage, runNodeTest, readJson, TERM_RE } from './helpers.mjs';

const SIX = ['gauntlet-loop', 'ai-memory', 'ponytail', 'sdd', 'matt-pocock', 'graphify'];
// O uv é um pré-requisito, não um componente do framework: ver PERGUNTA 1 no comentário da Ronda −1.
const PREREQ = 'prerequisite';
const registry = (root = ROOT) => readJson(join(root, 'components.json')).components;

test('C1: os grupos do registo real (fora o pré-requisito) são exatamente os 6, sem claude-mem nem tdd à parte', () => {
  const groups = [...new Set(registry().map((c) => c.group))].filter((g) => g !== PREREQ).sort();
  assert.deepEqual(groups, [...SIX].sort());
});

test('C1: nenhum componente do registo menciona o claude-mem em nenhum campo (id, name, source, installed, latest, comandos)', () => {
  const bad = registry().filter((c) => TERM_RE.test(JSON.stringify(c))).map((c) => c.id);
  assert.deepEqual(bad, []);
});

test('C1: o grupo do pré-requisito só tem o uv (não serve de esconderijo a outro componente)', () => {
  assert.deepEqual(registry().filter((c) => c.group === PREREQ).map((c) => c.id), ['uv']);
});

// Oráculo do dev: o scripts/doctor.test.mjs tem de usar igualdade de conjuntos. Cada caso planta um componente numa cópia.
const plant = (group) => {
  const dir = copyPackage();
  const file = join(dir, 'components.json');
  const j = readJson(file);
  const donor = j.components.find((c) => c.id === 'ponytail');
  j.components.push({ ...donor, id: 'critico-plantado', name: 'Critico plantado', group });
  writeFileSync(file, JSON.stringify(j, null, 2));
  return runNodeTest(dir, 'scripts/doctor.test.mjs');
};
const drop = (group) => {
  const dir = copyPackage();
  const file = join(dir, 'components.json');
  const j = readJson(file);
  j.components = j.components.filter((c) => c.group !== group);
  writeFileSync(file, JSON.stringify(j, null, 2));
  return runNodeTest(dir, 'scripts/doctor.test.mjs');
};

const precondition = () => {
  assert.ok(existsSync(join(ROOT, 'scripts/doctor.test.mjs')), 'scripts/doctor.test.mjs não existe');
  const clean = runNodeTest(copyPackage(), 'scripts/doctor.test.mjs');
  assert.equal(clean.status, 0, 'pré-condição: o doctor.test.mjs tem de passar numa cópia limpa\n' + clean.out.slice(-1500));
  const sameGroup = plant('ponytail');
  assert.equal(sameGroup.status, 0, 'controlo: um componente extra num grupo permitido não pode partir o teste\n' + sameGroup.out.slice(-1500));
};

test('C1 oráculo: o doctor.test.mjs falha quando volta um componente do grupo claude-mem', () => {
  precondition();
  assert.notEqual(plant('claude-mem').status, 0, 'o teste do doctor aceitou o grupo claude-mem: só verifica inclusão');
});

test('C1 oráculo: o doctor.test.mjs falha com um grupo tdd separado (o tdd vem no matt-pocock)', () => {
  precondition();
  assert.notEqual(plant('tdd').status, 0, 'o teste do doctor aceitou um 7.º grupo tdd');
});

test('C1 oráculo: o doctor.test.mjs falha quando falta um dos 6 grupos (graphify, ponytail)', () => {
  precondition();
  for (const g of ['graphify', 'ponytail']) assert.notEqual(drop(g).status, 0, 'o teste do doctor aceitou o registo sem ' + g);
});
