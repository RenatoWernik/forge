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
