// F-03 critério 1: o scaffold aceita `mode` ∈ {rigorous, accelerated} e os 5 papéis, cada um com `reason` não vazia; recusa de uma
// vez todos os campos inválidos (papel em falta, reason vazia, effort fora de low|medium|high|xhigh|max, modo desconhecido), com o
// nome de cada campo, e não escreve nada.
// Oráculo: o corpus de respostas inválidas abaixo (CASES), cada uma com os campos que a mensagem tem de nomear. Para não haver alarme
// falso, a mensagem também não pode nomear um papel válido nem o `mode` quando este é válido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, ANSWERS, ANSWERS_V1, loadScaffold, readJson, tmp, names } from './helpers.mjs';

const CASES = [
  ['mode em falta', (a) => { delete a.mode; }, ['mode']],
  ['mode desconhecido «turbo»', (a) => { a.mode = 'turbo'; }, ['mode']],
  ['mode fora do enum por maiúscula «Rigorous»', (a) => { a.mode = 'Rigorous'; }, ['mode']],
  ['mode vazio', (a) => { a.mode = ''; }, ['mode']],
  ['mode numérico', (a) => { a.mode = 1; }, ['mode']],
  ['mode null', (a) => { a.mode = null; }, ['mode']],
  ...ROLES.flatMap((r) => [
    [`${r} em falta`, (a) => { delete a.models[r]; }, [`models.${r}`]],
    [`${r} sem reason`, (a) => { delete a.models[r].reason; }, [`models.${r}.reason`]],
    [`${r} com reason vazia`, (a) => { a.models[r].reason = ''; }, [`models.${r}.reason`]],
    [`${r} com reason só com espaços`, (a) => { a.models[r].reason = ' \t  '; }, [`models.${r}.reason`]],
    [`${r} com reason que não é texto (42)`, (a) => { a.models[r].reason = 42; }, [`models.${r}.reason`]],
    [`${r} com reason null`, (a) => { a.models[r].reason = null; }, [`models.${r}.reason`]],
    [`${r} com effort «ultra»`, (a) => { a.models[r].effort = 'ultra'; }, [`models.${r}.effort`]],
    [`${r} sem effort`, (a) => { delete a.models[r].effort; }, [`models.${r}.effort`]],
  ]),
  ['os 4 de uma vez: mode, papel em falta, reason vazia e effort inválido', (a) => {
    a.mode = 'turbo'; delete a.models.developerUi; a.models.critic.reason = ''; a.models.tester.effort = 'ultra';
  }, ['mode', 'models.developerUi', 'models.critic.reason', 'models.tester.effort']],
];

const rolesNamed = (fields) => new Set(fields.filter((f) => f.startsWith('models.')).map((f) => f.split('.')[1]));
const assertMessage = (msg, want, label) => {
  for (const f of want) assert.ok(names(msg, f), `${label}: a mensagem não nomeia «${f}»:\n${msg}`);
  const roles = rolesNamed(want);
  for (const r of ROLES.filter((x) => !roles.has(x))) assert.ok(!names(msg, `models.${r}`), `${label}: alarme falso, a mensagem nomeia o papel válido «models.${r}»:\n${msg}`);
  if (!want.includes('mode')) assert.ok(!names(msg, 'mode'), `${label}: alarme falso, a mensagem nomeia o mode válido:\n${msg}`);
};

for (const [label, mutate, want] of CASES) {
  test(`C1 recusa: ${label} → nomeia ${want.join(', ')} e não escreve nada`, async () => {
    const { scaffold } = await loadScaffold();
    const a = ANSWERS();
    mutate(a);
    const dest = tmp('c1-');
    let msg;
    await assert.rejects(scaffold(a, { dest }), (e) => { msg = String(e?.message); return true; }, `${label}: o scaffold aceitou`);
    assertMessage(msg, want, label);
    assert.deepEqual(readdirSync(dest), [], `${label}: o scaffold escreveu ficheiros`);
  });
}

test('C1 recusa: as respostas v1 de hoje (sem mode, sem developerUi e tester, sem reason) são recusadas de uma vez, com o nome de cada campo, e nada é escrito', async () => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('c1-');
  let msg;
  await assert.rejects(scaffold(ANSWERS_V1(), { dest }), (e) => { msg = String(e?.message); return true; }, 'o scaffold aceitou respostas v1');
  for (const f of ['mode', 'models.developerUi', 'models.tester', 'models.developer.reason', 'models.critic.reason', 'models.aux.reason']) assert.ok(names(msg, f), `a mensagem não nomeia «${f}»:\n${msg}`);
  assert.deepEqual(readdirSync(dest), []);
});

for (const [mode, language] of [['rigorous', 'English'], ['accelerated', 'English'], ['rigorous', 'Portuguese (Brazil)'], ['accelerated', 'Portuguese (Brazil)']]) {
  test(`C1 aceita: mode ${mode} em ${language}, com os 5 papéis; o forge.json guarda o mode e os 5 papéis tal como vieram (reason, label e match incluídos)`, async () => {
    const { scaffold } = await loadScaffold();
    const a = ANSWERS({ mode, language });
    const dest = tmp('c1-');
    await scaffold(a, { dest });
    const raw = readFileSync(join(dest, '.claude/forge.json'), 'utf8');
    assert.ok(!raw.startsWith('﻿'), 'o forge.json foi escrito com BOM');
    const fj = readJson(join(dest, '.claude/forge.json'));
    assert.equal(fj.mode, mode);
    assert.deepEqual(fj.models, a.models);
  });
}

test('C1 linha de comandos: --answers com CRLF é aceite e grava o mode; --answers com a chave mode duplicada (a última é «turbo») sai com 2, nomeia mode e não escreve nada', async () => {
  const { main } = await loadScaffold();
  const dir = tmp('c1-cli-');
  const ok = join(dir, 'ok.json');
  writeFileSync(ok, JSON.stringify(ANSWERS({ mode: 'accelerated' }), null, 2).replace(/\n/g, '\r\n'));
  const destOk = tmp('c1-');
  let out = '';
  assert.equal(await main(['--answers', ok, '--dest', destOk], (s) => { out += s + '\n'; }), 0, out);
  assert.equal(readJson(join(destOk, '.claude/forge.json')).mode, 'accelerated');

  const dup = join(dir, 'dup.json');
  const text = JSON.stringify(ANSWERS({ mode: 'rigorous' }), null, 2);
  writeFileSync(dup, text.replace('"mode": "rigorous",', '"mode": "rigorous",\n  "mode": "turbo",'));
  assert.ok(readFileSync(dup, 'utf8').includes('"mode": "turbo"'), 'pré-condição: a chave duplicada está no ficheiro');
  const destBad = tmp('c1-');
  out = '';
  assert.equal(await main(['--answers', dup, '--dest', destBad], (s) => { out += s + '\n'; }), 2, out);
  assert.ok(names(out, 'mode'), 'a saída não nomeia mode:\n' + out);
  assert.deepEqual(readdirSync(destBad), []);
});

// Resposta à PERGUNTA 6 na #4: flag nova --mode; developerUi, tester e as reason só por --answers (sem elas, recusa com a lista de
// todos os campos em falta); as flags existentes continuam a funcionar e sobrepõem-se ao ficheiro de respostas.
const FLAGS = ['--name', 'Acme Billing', '--language', 'English', '--developer', 'sonnet:high', '--critic', 'opus:high', '--aux', 'sonnet:medium', '--workspace', 'acme', '--project', 'billing'];
const NEW_FIELDS = ['models.developerUi', 'models.tester', 'models.developer.reason', 'models.critic.reason', 'models.aux.reason'];
const cli = async (argv) => { const { main } = await loadScaffold(); let out = ''; const code = await main(argv, (s) => { out += s + '\n'; }); return { code, out }; };
const answersFile = (over) => { const f = join(tmp('c1-cli-'), 'answers.json'); writeFileSync(f, JSON.stringify(ANSWERS(over), null, 2)); return f; };

test('C1 linha de comandos: só flags, com --mode rigorous e sem --answers → sai com 2, nomeia developerUi, tester e as 3 reason (e não o mode) e não escreve nada', async () => {
  const dest = tmp('c1-');
  const { code, out } = await cli([...FLAGS, '--mode', 'rigorous', '--dest', dest]);
  assert.equal(code, 2, out);
  for (const f of NEW_FIELDS) assert.ok(names(out, f), `a saída não nomeia «${f}»:\n${out}`);
  assert.ok(!names(out, 'mode'), 'alarme falso: o --mode foi dado e a saída nomeia mode:\n' + out);
  assert.deepEqual(readdirSync(dest), []);
});

test('C1 linha de comandos: só flags, sem --mode e sem --answers → sai com 2 e nomeia também o mode, de uma vez', async () => {
  const dest = tmp('c1-');
  const { code, out } = await cli([...FLAGS, '--dest', dest]);
  assert.equal(code, 2, out);
  for (const f of ['mode', ...NEW_FIELDS]) assert.ok(names(out, f), `a saída não nomeia «${f}»:\n${out}`);
  assert.deepEqual(readdirSync(dest), []);
});

test('C1 linha de comandos: --mode sobrepõe-se ao --answers (rigorous no ficheiro, accelerated na flag)', async () => {
  const dest = tmp('c1-');
  const { code, out } = await cli(['--answers', answersFile({ mode: 'rigorous' }), '--mode', 'accelerated', '--dest', dest]);
  assert.equal(code, 0, out);
  assert.equal(readJson(join(dest, '.claude/forge.json')).mode, 'accelerated');
});

test('C1 linha de comandos: --mode turbo com um --answers válido → sai com 2, nomeia mode e não escreve nada', async () => {
  const dest = tmp('c1-');
  const { code, out } = await cli(['--answers', answersFile(), '--mode', 'turbo', '--dest', dest]);
  assert.equal(code, 2, out);
  assert.doesNotMatch(out, /unknown option/i, 'o --mode é uma flag do contrato, não uma opção desconhecida');
  assert.ok(names(out, 'mode'), out);
  assert.deepEqual(readdirSync(dest), []);
});

test('C1 linha de comandos: as flags existentes continuam a funcionar sobre um --answers v2 (--developer sonnet:max:Lab sobrepõe-se ao papel do ficheiro)', async () => {
  const dest = tmp('c1-');
  const { code, out } = await cli(['--answers', answersFile(), '--developer', 'sonnet:max:Lab', '--dest', dest]);
  assert.equal(code, 0, out);
  const d = readJson(join(dest, '.claude/forge.json')).models.developer;
  assert.deepEqual([d.model, d.effort, d.label], ['sonnet', 'max', 'Lab']);
});
