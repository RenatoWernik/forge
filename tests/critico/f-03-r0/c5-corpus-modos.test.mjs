// F-03 critério 5: o corpus do F-02 ganha conjuntos de respostas com rigorous e com accelerated (no mínimo um por língua), e todos os
// projetos acabam em «All ok.».
// Oráculo: o corpus (scripts/corpus/answers), lido através do projeto gerado: as 4 combinações língua × modo (en e pt × rigorous e
// accelerated) existem, cada conjunto traz os 5 papéis com reason, e cada projeto gerado passa o check.cjs com «All ok.».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, MODES, loadCorpus, generate, check, fails } from './helpers.mjs';

const sets = loadCorpus('answers');
const lang = (tag) => (/^pt/i.test(tag) ? 'pt' : /^en/i.test(tag) ? 'en' : String(tag));

test('C5: o corpus de respostas continua a ter pelo menos os 8 conjuntos do F-02', () => {
  assert.ok(sets.length >= 8, 'conjuntos: ' + sets.length);
});

test('C5: cada conjunto do corpus gera um forge.json com mode rigorous ou accelerated e os 5 papéis, cada um com reason não vazia', async () => {
  const bad = [];
  for (const s of sets) {
    let fj;
    try { ({ fj } = await generate(s.value)); } catch (e) { bad.push(`${s.name}: o scaffold recusou (${String(e.message).split('\n').slice(0, 4).join(' ')})`); continue; }
    if (!MODES.includes(fj.mode)) bad.push(`${s.name}: mode ${JSON.stringify(fj.mode)}`);
    for (const r of ROLES) if (typeof fj.models?.[r]?.reason !== 'string' || !fj.models[r].reason) bad.push(`${s.name}: models.${r} sem reason`);
  }
  assert.deepEqual(bad, []);
});

test('C5: as 4 combinações língua × modo (en e pt × rigorous e accelerated) existem no corpus, lidas do projeto gerado', async () => {
  const seen = new Set();
  for (const s of sets) {
    try { const { fj } = await generate(s.value); seen.add(`${lang(fj.langTag)}|${fj.mode}`); } catch { /* o teste anterior diz qual */ }
  }
  const want = ['en', 'pt'].flatMap((l) => MODES.map((m) => `${l}|${m}`));
  assert.deepEqual(want.filter((w) => !seen.has(w)), [], 'combinações em falta (vistas: ' + [...seen].join(', ') + ')');
});

test('C5: cada projeto do corpus, gerado de forma independente, passa o check.cjs com «All ok.» e sem FAIL', async () => {
  assert.ok(sets.length > 0, 'corpus de respostas vazio');
  for (const s of sets) {
    const r = check((await generate(s.value)).dest);
    assert.equal(r.status, 0, s.name + '\n' + fails(r.out));
    assert.match(r.out, /All ok\./, s.name);
  }
});
