// F-13 critério 6: o `check.cjs --env` tem uma linha `hooks` que diz quais estão instalados, e o corpus, com e sem hooks, acaba em «All ok.».
// Oráculo: o corpus de respostas (as respostas novas com hooks), as 8 combinações, e um settings.json mexido à mão depois da geração
// (instalado = está no settings.json do projeto, não só nas respostas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { api, gerar, hooksDe, COMBOS, QUAIS, CHAVE, settingsDe, readJson, refsAo, corpusAnswers, check, ENV_ISOLATED, traduzSePt } from './helpers.mjs';

const linhasHooks = (out) => out.split(/\r?\n/).filter((l) => /^(ok|FAIL|info)\s+hooks\b/.test(l));
const nomeCombo = (h) => QUAIS.map((q) => `${q}=${h[CHAVE[q]]}`).join(' ');

for (const h of COMBOS) {
  test(`C6: ${nomeCombo(h)}: o --env tem uma só linha hooks, com os instalados e sem os outros`, async () => {
    const u = await api();
    const proj = await gerar(h);
    const r = check(proj, ['--env'], ENV_ISOLATED);
    const ls = linhasHooks(r.out);
    assert.equal(ls.length, 1, 'linhas hooks no --env: ' + JSON.stringify(ls) + '\n' + r.out.slice(0, 1500));
    for (const q of QUAIS) assert.equal(ls[0].includes(u.nomesNoEnv[q]), h[CHAVE[q]], `${q} (${u.nomesNoEnv[q]}) na linha: ${ls[0]}`);
  });

  test(`C6: ${nomeCombo(h)}: o projeto gerado passa o check.cjs com «All ok.» e sem FAIL`, async () => {
    const r = check(await gerar(h));
    assert.equal(r.status, 0, r.out.slice(-2000));
    assert.doesNotMatch(r.out, /^FAIL/m);
    assert.match(r.out, /All ok\./);
  });
}

test('C6: a linha hooks diz o que está no settings.json: um hook tirado à mão depois da geração deixa de aparecer', async () => {
  const u = await api();
  const proj = await gerar(hooksDe(true, true, true));
  const s = readJson(settingsDe(proj));
  const alvo = u.scripts.matar.replace(/\\/g, '/').split('/').pop();
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev].map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((x) => !JSON.stringify(x).replace(/\\\\/g, '/').includes(alvo)) })).filter((g) => g.hooks.length);
  }
  assert.deepEqual(refsAo(s, u.scripts.matar), [], 'pré-condição: o hook matar saiu do settings.json');
  writeFileSync(settingsDe(proj), JSON.stringify(s, null, 2) + '\n');
  const [l] = linhasHooks(check(proj, ['--env'], ENV_ISOLATED).out);
  assert.ok(l, 'sem linha hooks');
  assert.ok(!l.includes(u.nomesNoEnv.matar), 'o --env diz que o matar está instalado, mas não está no settings.json: ' + l);
  assert.ok(l.includes(u.nomesNoEnv.fundo) && l.includes(u.nomesNoEnv.vigia), l);
});

test('C6: o corpus de respostas tem conjuntos com os três hooks e conjuntos sem hooks, e todos acabam em «All ok.»', async () => {
  const sets = corpusAnswers();
  const tres = sets.filter((s) => QUAIS.every((q) => s.value.hooks?.[CHAVE[q]] === true));
  const sem = sets.filter((s) => !s.value.hooks || QUAIS.every((q) => s.value.hooks[CHAVE[q]] === false));
  assert.ok(tres.length >= 1, 'nenhum conjunto do corpus com os três hooks');
  assert.ok(sem.length >= 1, 'nenhum conjunto do corpus sem hooks');
  for (const s of tres) {
    const proj = await gerar(undefined, { answers: s.value });
    traduzSePt(proj);
    const r = check(proj);
    assert.equal(r.status, 0, s.name + '\n' + r.out.slice(-2000));
    assert.match(r.out, /All ok\./, s.name);
  }
});
