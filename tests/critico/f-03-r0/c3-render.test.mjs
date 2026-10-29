// F-03 critério 3: `node .claude/check.cjs --render` reescreve os textos de modelo de todos os papéis usados no meta dos workflows, e a
// ida e volta (mudar o forge.json, --render, check) acaba em «All ok.».
// Oráculo: a ida e volta, num projeto gerado. Hoje o meta só usa developer, critic e aux.model; para provar que o --render cobre os 5
// papéis, o ataque C3b põe no meta uma cópia fresca do template com os marcadores {{developerUi}} e {{tester}}, na convenção dos que já
// existem ({{developer}}, {{critic}}: o nome do papel; o texto é «<label ou model> <effort>»), e a linha «// forge render:» passa a
// registá-los (resposta à PERGUNTA 3 na #4).
// C3c: os textos dos papéis novos passam a ser escritos em código JS, por isso um label ou model fora do conjunto seguro não pode ser
// escrito (injeção: reprova sempre).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ANSWERS, generate, check, readJson, fails } from './helpers.mjs';

const WF = '.claude/workflows';
const FJ = '.claude/forge.json';
const text = (r) => `${r.label ?? r.model} ${r.effort}`;
const wfFiles = (d) => readdirSync(join(d, WF)).filter((f) => f.endsWith('.js')).sort();
const snapshot = (d) => wfFiles(d).map((f) => [f, readFileSync(join(d, WF, f), 'utf8')]);
const description = (src) => (src.match(/^\s*description:\s*'((?:[^'\\]|\\.)*)'/m) || [])[1] ?? '';
const recordLine = (src) => (src.match(/^\/\/ forge render:.*$/m) || [''])[0];
const panelModel = (src) => (src.match(/title:\s*'Panel'[^}]*?model:\s*'([^']*)'/) || [])[1];
const setForge = (d, f) => { const fj = readJson(join(d, FJ)); f(fj); writeFileSync(join(d, FJ), JSON.stringify(fj, null, 2) + '\n'); };

// Os 5 papéis com textos novos e distintos (nenhum é parte de outro), e o modo trocado
const CHANGED = {
  developer: { model: 'sonnet', effort: 'max', label: 'Dev Logic 1.1', reason: 'changed: logic got harder' },
  developerUi: { model: 'sonnet', effort: 'medium', label: 'Dev UI 2.1', reason: 'changed: the UI is simple after all' },
  critic: { model: 'opus', effort: 'xhigh', label: 'Judge 3.1', match: 'opus', reason: 'changed: stricter critic' },
  tester: { model: 'sonnet', effort: 'low', label: 'Tester 4.1', reason: 'changed: cheaper tester' },
  aux: { model: 'haiku', effort: 'low', reason: 'changed: cheaper panel' },
};

test('C3a ida e volta: mudar os 5 papéis e o mode no forge.json, --render, check → «All ok.»; o meta dos dois workflows tem os textos novos do developer e do critic e o modelo novo do aux; um segundo --render não muda nada', async () => {
  const { dest } = await generate(ANSWERS());
  const first = check(dest);
  assert.equal(first.status, 0, 'pré-condição, projeto acabado de gerar:\n' + fails(first.out));
  setForge(dest, (fj) => { fj.models = structuredClone(CHANGED); fj.mode = 'accelerated'; });
  const r1 = check(dest, ['--render']);
  assert.equal(r1.status, 0, r1.out);
  assert.match(r1.out, /^rendered/m, r1.out);
  for (const [f, src] of snapshot(dest)) {
    const d = description(src);
    assert.ok(d.includes(text(CHANGED.developer)) && d.includes(text(CHANGED.critic)), `${f}: o meta não tem os textos novos:\n${d}`);
    assert.ok(!d.includes('Dev Logic 1.0 xhigh') && !d.includes('Judge 3.0 high'), `${f}: o meta ainda tem os textos antigos:\n${d}`);
    assert.equal(panelModel(src), CHANGED.aux.model, `${f}: a fase Panel não tem o modelo novo do aux`);
  }
  const r2 = check(dest);
  assert.equal(r2.status, 0, fails(r2.out));
  assert.match(r2.out, /All ok\./);
  const r3 = check(dest, ['--render']);
  assert.equal(r3.status, 0, r3.out);
  assert.match(r3.out, /nothing to render/, r3.out);
});

// Uma cópia fresca do template, com os marcadores dos papéis novos no início da descrição do meta
const withNewTokens = () => {
  const src = readFileSync(join(ROOT, 'templates', WF, 'gauntlet-build.js'), 'utf8');
  assert.match(src, /^\s*description: '/m, 'pré-condição: o template tem description no meta');
  return src.replace(/^(\s*description: ')/m, '$1{{developerUi}} builds the rich UI and {{tester}} runs the batch. ');
};

test('C3b os 5 papéis: com {{developerUi}} e {{tester}} no meta, o --render preenche-os; depois de mudar os 5 papéis, o --render troca os 5 textos (e o modelo do aux), o check fica em «All ok.» e um novo --render não muda nada', async () => {
  const a = ANSWERS();
  const { dest } = await generate(a);
  const file = join(dest, WF, 'gauntlet-build.js');
  writeFileSync(file, withNewTokens());

  const r1 = check(dest, ['--render']);
  assert.equal(r1.status, 0, r1.out);
  let d = description(readFileSync(file, 'utf8'));
  assert.ok(!readFileSync(file, 'utf8').includes('{{'), 'ficaram marcadores por preencher:\n' + d);
  for (const r of ['developer', 'developerUi', 'critic', 'tester']) assert.ok(d.includes(text(a.models[r])), `o meta não tem o texto de ${r} («${text(a.models[r])}»):\n${d}`);
  let rec = recordLine(readFileSync(file, 'utf8'));
  for (const r of ['developer', 'developerUi', 'critic', 'tester']) assert.ok(rec.includes(text(a.models[r])), `a linha «// forge render:» não regista ${r} («${text(a.models[r])}»): ${rec}`);
  const r2 = check(dest);
  assert.equal(r2.status, 0, fails(r2.out));

  setForge(dest, (fj) => { fj.models = structuredClone(CHANGED); fj.mode = 'accelerated'; });
  const r3 = check(dest, ['--render']);
  assert.equal(r3.status, 0, r3.out);
  const src = readFileSync(file, 'utf8');
  d = description(src);
  for (const r of ['developer', 'developerUi', 'critic', 'tester']) {
    assert.ok(d.includes(text(CHANGED[r])), `depois de mudar o forge.json, o meta não tem o texto novo de ${r} («${text(CHANGED[r])}»):\n${d}`);
    assert.ok(!d.includes(text(a.models[r])), `depois de mudar o forge.json, o meta ainda tem o texto antigo de ${r} («${text(a.models[r])}»):\n${d}`);
  }
  assert.equal(panelModel(src), CHANGED.aux.model);
  rec = recordLine(src);
  for (const r of ['developer', 'developerUi', 'critic', 'tester']) assert.ok(rec.includes(text(CHANGED[r])) && !rec.includes(text(a.models[r])), `a linha «// forge render:» não regista o texto novo de ${r}: ${rec}`);
  const r4 = check(dest);
  assert.equal(r4.status, 0, fails(r4.out));
  assert.match(r4.out, /All ok\./);
  const r5 = check(dest, ['--render']);
  assert.equal(r5.status, 0, r5.out);
  assert.match(r5.out, /nothing to render/, r5.out);
});

const UNSAFE = [
  ['label do developerUi com aspa e código', (fj) => { fj.models.developerUi.label = "UI' + (globalThis.pwned = 1) + '"; }],
  ['label do tester com aspa e código', (fj) => { fj.models.tester.label = "T' + (globalThis.pwned = 1) + '"; }],
  ['model do developerUi com aspa', (fj) => { fj.models.developerUi.model = "opus'+1+'"; fj.models.developerUi.match = 'opus'; }],
  ['model do tester com aspa', (fj) => { fj.models.tester.model = "haiku'+1+'"; fj.models.tester.match = 'haiku'; }],
];
for (const [label, f] of UNSAFE) {
  test(`C3c injeção: ${label} → o --render sai com 1 e não escreve nada nos workflows`, async () => {
    const { dest } = await generate(ANSWERS());
    writeFileSync(join(dest, WF, 'gauntlet-build.js'), withNewTokens());
    setForge(dest, f);
    const before = snapshot(dest);
    const r = check(dest, ['--render']);
    assert.equal(r.status, 1, `${label}: o --render aceitou\n${r.out}`);
    assert.deepEqual(snapshot(dest), before, `${label}: o --render escreveu nos workflows`);
  });
}
