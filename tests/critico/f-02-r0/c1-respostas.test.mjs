// F-02 critério 1: cada conjunto de respostas do corpus gera um projeto que passa o check.cjs com «All ok.»;
// as 8 combinações (inglês e português × plainStyle true e false × painel publicado e pendente) estão todas lá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, HARNESS, CORPUS, loadCorpus, buildProject, check, copyPackage, runHarness, harnessPrecondition } from './helpers.mjs';

test('C1: existe o harness ' + HARNESS, () => {
  assert.ok(existsSync(join(ROOT, HARNESS)), HARNESS + ' não existe');
});

const combo = async (answers) => {
  const { dest, fj } = await buildProject(answers, { translate: false });
  const lang = /^en/i.test(fj.langTag) ? 'en' : /^pt/i.test(fj.langTag) ? 'pt' : fj.langTag;
  const panel = readFileSync(join(dest, 'CLAUDE.md'), 'utf8').includes('PANEL-URL-PENDING') ? 'pendente' : 'publicado';
  return `${lang}|plainStyle=${fj.plainStyle}|${panel}`;
};

test('C1: o corpus de respostas tem pelo menos 8 conjuntos e cobre as 8 combinações, lidas do projeto gerado', async () => {
  const sets = await loadCorpus('answers');
  assert.ok(sets.length >= 8, 'conjuntos em ' + CORPUS + '/answers: ' + sets.length);
  const seen = new Set(await Promise.all(sets.map((s) => combo(s.value))));
  const want = [];
  for (const lang of ['en', 'pt']) for (const ps of [true, false]) for (const panel of ['publicado', 'pendente']) want.push(`${lang}|plainStyle=${ps}|${panel}`);
  assert.deepEqual(want.filter((w) => !seen.has(w)), [], 'combinações em falta (vistas: ' + [...seen].join(', ') + ')');
});

test('C1: cada conjunto do corpus, gerado de forma independente, passa o check.cjs com «All ok.» e sem FAIL', async () => {
  const sets = await loadCorpus('answers');
  assert.ok(sets.length > 0, 'corpus de respostas vazio ou ausente');
  for (const s of sets) {
    const r = check((await buildProject(s.value)).dest);
    assert.equal(r.status, 0, s.name + '\n' + r.out.split('\n').filter((l) => l.startsWith('FAIL')).join('\n'));
    assert.match(r.out, /All ok\./, s.name);
  }
});

test('C1 oráculo: um conjunto que não passa o check faz falhar o corpus.test.mjs', async () => {
  harnessPrecondition(assert);
  const dir = copyPackage();
  const sets = await loadCorpus('answers', dir);
  const en = sets.find((s) => /^en/i.test(String(s.value.language)) || /^english/i.test(String(s.value.language)));
  assert.ok(en, 'não há conjunto em inglês para servir de base');
  // um esforço inválido: o projeto não chega a ser gerado, logo não passa o check
  const models = { ...en.value.models, developer: { ...en.value.models.developer, effort: 'ultra' } };
  writeFileSync(join(dir, CORPUS, 'answers', 'critico-esforco-invalido.json'), JSON.stringify({ ...en.value, models }, null, 2));
  const r = runHarness(dir);
  assert.notEqual(r.status, 0, 'o corpus passou com um conjunto que falha o check');
});
