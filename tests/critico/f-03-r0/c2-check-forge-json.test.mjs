// F-03 critério 2: a linha «forge.json» do check.cjs falha em cada mutação do projeto gerado: um papel sem reason, um effort inválido,
// um mode desconhecido e uma escalation vazia.
// Oráculo 1 (independente do dev): o corpus finito BAD abaixo, aplicado ao forge.json de um projeto gerado; cada caso tem de pôr a
//   linha «forge.json» em FAIL e o check a sair com 1. As classes vizinhas (tipos errados, papel novo em falta, forge.json v1, chave
//   duplicada, JSON inválido) estão lá porque são o mesmo defeito escrito de outra forma.
// Oráculo 2 (sem alarme falso): os casos GOOD têm de deixar o check em «All ok.».
// Oráculo 3: as 4 mutações novas no corpus do F-02 (scripts/corpus/mutations), uma por classe, cada uma a fazer falhar a sua linha.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, ANSWERS, generate, check, forgeState, lineState, fails, loadCorpus, defects } from './helpers.mjs';

const FJ = '.claude/forge.json';
let dest, original;
before(async () => {
  ({ dest } = await generate(ANSWERS()));
  original = readFileSync(join(dest, FJ), 'utf8');
});
const parsed = () => JSON.parse(original);
const asText = (o) => JSON.stringify(o, null, 2) + '\n';
const withForge = (text) => { writeFileSync(join(dest, FJ), text); try { return check(dest); } finally { writeFileSync(join(dest, FJ), original); } };
const edit = (f) => () => { const o = parsed(); f(o); return asText(o); };
const escOf = (o) => {
  assert.ok(o.escalation && typeof o.escalation === 'object' && !Array.isArray(o.escalation), 'pré-condição: o forge.json gerado não tem a escalation em objeto');
  return o.escalation;
};
// Resposta à PERGUNTA 8 na #4: a linha verifica a estrutura da escalation (as 4 condições, value inteiro ≥ 1 ou booleano, description
// não vazia), não os limiares; um limiar afinado pelo utilizador passa.
const escBad = (label, f) => [`escalation: ${label}`, edit((o) => f(escOf(o)))];

const BAD = [
  ['mode desconhecido «turbo»', edit((o) => { o.mode = 'turbo'; })],
  ['mode «Rigorous» (fora do enum)', edit((o) => { o.mode = 'Rigorous'; })],
  ['mode em falta', edit((o) => { delete o.mode; })],
  ['mode vazio', edit((o) => { o.mode = ''; })],
  ['mode numérico', edit((o) => { o.mode = 1; })],
  ['mode null', edit((o) => { o.mode = null; })],
  ...ROLES.flatMap((r) => [
    [`${r} sem reason`, edit((o) => { delete o.models[r].reason; })],
    [`${r} com reason vazia`, edit((o) => { o.models[r].reason = ''; })],
    [`${r} com reason só com espaços`, edit((o) => { o.models[r].reason = '   '; })],
    [`${r} com reason numérica`, edit((o) => { o.models[r].reason = 42; })],
    [`${r} com effort «ultra»`, edit((o) => { o.models[r].effort = 'ultra'; })],
    [`${r} com effort «HIGH»`, edit((o) => { o.models[r].effort = 'HIGH'; })],
    [`${r} sem effort`, edit((o) => { delete o.models[r].effort; })],
    [`${r} em falta`, edit((o) => { delete o.models[r]; })],
  ]),
  ['escalation vazia (lista)', edit((o) => { o.escalation = []; })],
  ['escalation vazia (objeto)', edit((o) => { o.escalation = {}; })],
  ['escalation em falta', edit((o) => { delete o.escalation; })],
  ['escalation null', edit((o) => { o.escalation = null; })],
  ['escalation em texto', edit((o) => { o.escalation = 'x'; })],
  ['escalation em lista, com as mesmas 4 condições', edit((o) => { o.escalation = Object.entries(escOf(o)).map(([k, c]) => ({ condition: k, ...c })); })],
  escBad('sem a condição visualBelowReference', (e) => { delete e.visualBelowReference; }),
  escBad('sameCriterionFailures.value em texto ("2")', (e) => { e.sameCriterionFailures.value = '2'; }),
  escBad('sameCriterionFailures.value 0', (e) => { e.sameCriterionFailures.value = 0; }),
  escBad('sameCriterionFailures.value 1.5', (e) => { e.sameCriterionFailures.value = 1.5; }),
  escBad('minutesWithoutProgress.value null', (e) => { e.minutesWithoutProgress.value = null; }),
  escBad('minutesWithoutProgress sem value', (e) => { delete e.minutesWithoutProgress.value; }),
  escBad('attacksRedOnDelivery.value em texto ("true")', (e) => { e.attacksRedOnDelivery.value = 'true'; }),
  escBad('visualBelowReference.value null', (e) => { e.visualBelowReference.value = null; }),
  escBad('sameCriterionFailures.description vazia', (e) => { e.sameCriterionFailures.description = ''; }),
  escBad('attacksRedOnDelivery sem description', (e) => { delete e.attacksRedOnDelivery.description; }),
  ['forge.json v1 (o que o scaffold gera hoje: sem mode, 3 papéis sem reason, sem escalation)', () => asText({
    language: 'English', langTag: 'en', plainStyle: true,
    models: { developer: { model: 'sonnet', effort: 'high' }, critic: { model: 'opus', effort: 'high' }, aux: { model: 'sonnet', effort: 'medium' } },
  })],
  ['chave mode duplicada, a última «turbo»', () => original.replace(/("mode":\s*"rigorous")/, '$1, "mode": "turbo"')],
  ['JSON inválido (truncado)', () => original.slice(0, Math.floor(original.length / 2))],
];

const GOOD = [
  ['mode accelerated', edit((o) => { o.mode = 'accelerated'; })],
  ['o mesmo forge.json com fins de linha CRLF', () => original.replace(/\n/g, '\r\n')],
  ['papéis novos sem os opcionais label e match', edit((o) => { delete o.models.developerUi.label; delete o.models.tester.label; })],
  // Resposta à PERGUNTA 7: o BOM é aceite na leitura
  ['o mesmo forge.json com BOM UTF-8', () => '﻿' + original],
  // Resposta à PERGUNTA 8: limiares afinados pelo utilizador passam
  ['limiares afinados (sameCriterionFailures 3, minutesWithoutProgress 60, visualBelowReference false)', edit((o) => {
    const e = escOf(o); e.sameCriterionFailures.value = 3; e.minutesWithoutProgress.value = 60; e.visualBelowReference.value = false;
  })],
];

test('C2 pré-condição: o projeto gerado com mode e os 5 papéis passa o check com a linha forge.json em ok e «All ok.»', () => {
  assert.match(original, /"mode":\s*"rigorous"/, 'o forge.json gerado não tem "mode": "rigorous"');
  const r = check(dest);
  assert.equal(forgeState(r.out), 'ok', fails(r.out));
  assert.equal(r.status, 0, fails(r.out));
  assert.match(r.out, /All ok\./);
});

for (const [label, make] of BAD) {
  test(`C2 falha: ${label} → linha forge.json em FAIL e o check sai com 1`, () => {
    const text = make();
    assert.notEqual(text, original, 'pré-condição: a mutação muda o ficheiro');
    const r = withForge(text);
    assert.equal(forgeState(r.out), 'FAIL', `${label}: a linha forge.json não falhou\n${r.out.split('\n').slice(0, 3).join('\n')}`);
    assert.equal(r.status, 1, label);
  });
}

for (const [label, make] of GOOD) {
  test(`C2 sem alarme falso: ${label} → linha forge.json ok e «All ok.»`, () => {
    const r = withForge(make());
    assert.equal(forgeState(r.out), 'ok', fails(r.out));
    assert.equal(r.status, 0, fails(r.out));
    assert.match(r.out, /All ok\./);
  });
}

// Oráculo 3: o corpus do F-02 ganha as 4 mutações da linha forge.json, uma por classe
const CLASSES = ['papel sem reason', 'effort inválido', 'modo desconhecido', 'escalation vazia'];
test('C2 corpus: scripts/corpus/mutations tem, para a linha forge.json, uma mutação de cada uma das 4 classes (só dessa classe), e cada uma faz falhar a sua linha', async () => {
  const sets = Object.fromEntries(loadCorpus('answers').map((s) => [s.name, s.value]));
  const muts = loadCorpus('mutations').filter((m) => /^forge\.json/.test(m.value.line ?? ''));
  assert.ok(muts.length >= 4, 'mutações da linha forge.json no corpus: ' + muts.length);
  const covered = new Set();
  for (const { name, value: m } of muts) {
    assert.equal(m.file.replace(/\\/g, '/').replace(/^\.\//, ''), FJ, `${name}: a mutação da linha forge.json não muda o ${FJ}`);
    assert.ok(sets[m.base], `${name}: base desconhecida ${m.base}`);
    const { dest: d } = await generate(sets[m.base]);
    const before = check(d);
    assert.equal(lineState(before.out, m.line), 'ok', `${name}: a linha «${m.line}» não está ok antes da mutação\n${fails(before.out)}`);
    const text = readFileSync(join(d, FJ), 'utf8');
    assert.ok(text.includes(m.find), `${name}: o texto a procurar não existe no ${FJ}`);
    const mutated = text.split(m.find).join(m.replace);
    writeFileSync(join(d, FJ), mutated);
    let found;
    try { found = defects(JSON.parse(mutated)); } catch { found = new Set(['JSON inválido']); }
    if (found.size === 1 && CLASSES.includes([...found][0])) covered.add([...found][0]);
    const after = check(d);
    assert.equal(after.status, 1, `${name}: o check passou depois da mutação`);
    assert.equal(lineState(after.out, m.line), 'FAIL', `${name}: a linha «${m.line}» não falhou`);
  }
  assert.deepEqual(CLASSES.filter((c) => !covered.has(c)), [], 'classes sem uma mutação própria no corpus');
});
