// F-07: o contrato de cada peça é validado antes de qualquer agent(), no gauntlet-build e no gauntlet-attacks.
// Corre os dois workflows num runtime falso (vm, sem modelos) contra o corpus de scripts/corpus/contrato/:
//   contratos.json  um contrato de base, os válidos e os inválidos (cada um com o campo que a recusa tem de nomear)
//   frases.json     frases de critério com e sem palavra absoluta, em inglês e em português
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, root)), 'utf8');
const corpus = (name) => JSON.parse(read('scripts/corpus/contrato/' + name));
const { base, validos, invalidos } = corpus('contratos.json');
const { absolutas, positivas, negativas } = corpus('frases.json');
const FILES = ['gauntlet-attacks.js', 'gauntlet-build.js'];
const src = Object.fromEntries(FILES.map((f) => [f, read('templates/.claude/workflows/' + f)]));

const models = { developer: { model: 'dev-m', effort: 'high' }, critic: { model: 'critic-m', effort: 'high' }, aux: { model: 'aux-m', effort: 'low' } };
const piece = (set = {}, remove = []) => { const p = { ...structuredClone(base), ...structuredClone(set) }; for (const k of remove) delete p[k]; return p; };
// Corre o workflow com um agent() que não responde (null): o que interessa é se o contrato é recusado e quantos agentes foram lançados
const run = async (file, pieces) => {
  const calls = [];
  const escalation = { sameCriterionFailures: { value: 2 }, attacksRedOnDelivery: { value: true }, minutesWithoutProgress: { value: 30 }, visualBelowReference: { value: true } }; // the build workflow (F-08) refuses args without a mode and an escalation, before the contract is read
  const args = { checkpoint: { n: 1, title: 'T' }, root: '/p', dashboardUrl: 'https://x', models, mode: 'rigorous', escalation, pieces, attacks: [] };
  const ctx = vm.createContext({ args, agent: async (prompt, opts) => { calls.push({ prompt, opts }); return null; }, parallel: (ts) => Promise.all(ts.map((t) => t())), phase: () => {}, log: () => {} });
  let err;
  try { await vm.runInContext('(async () => {' + src[file].replace(/^export const meta\s*=/m, 'const meta =') + '\n})()', ctx); } catch (e) { err = e; }
  return { calls, err };
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (msg, campo) => new RegExp('(?<![\\w.-])' + esc(campo) + '(?![\\w])').test(msg);
const refused = (x) => /invalid contract/.test(x.err?.message ?? '') && x.calls.length === 0;
const accepted = (x) => !x.err && x.calls.length > 0;

for (const file of FILES) {
  test(`${file}: cada contrato inválido do corpus é recusado, com zero agentes e o nome do campo`, async () => {
    const wrong = [];
    for (const { label, campo, set, remove } of invalidos) {
      const x = await run(file, [piece(set, remove)]);
      if (!refused(x)) wrong.push(`${label}: ${x.calls.length} agentes; ${x.err?.message?.slice(0, 120)}`);
      else if (!names(x.err.message, campo)) wrong.push(`${label}: a recusa não nomeia ${campo}: ${x.err.message.slice(0, 160)}`);
    }
    assert.deepEqual(wrong, []);
  });

  test(`${file}: cada contrato válido do corpus lança agentes e não dá erro`, async () => {
    const wrong = [];
    for (const { label, set, remove } of validos) {
      const x = await run(file, [piece(set, remove)]);
      if (!accepted(x)) wrong.push(`${label}: ${x.calls.length} agentes; ${x.err?.message?.slice(0, 160)}`);
    }
    assert.deepEqual(wrong, []);
  });

  test(`${file}: uma peça inválida ao lado de uma válida trava tudo, e a recusa nomeia a peça a partir`, async () => {
    const ok = piece(), bad = piece({ id: 'pb', criteria: base.criteria.concat(Array.from({ length: 5 }, (_, i) => ({ text: `Extra ${i} returns 3 rows`, command: 'c' }))) });
    for (const pieces of [[ok, bad], [bad, ok]]) {
      const x = await run(file, pieces);
      assert.ok(refused(x), x.err?.message);
      assert.ok(names(x.err.message, 'criteria') && /piece pb\b/.test(x.err.message), x.err.message);
    }
  });

  const withText = (text, oracle) => piece({ criteria: [{ text, command: 'c', ...(oracle ? { oracle } : {}) }] });
  test(`${file}: cada frase com palavra absoluta e sem oracle é recusada, nomeando criteria[0].oracle (0 falsos negativos)`, async () => {
    const miss = [];
    for (const s of positivas) { const x = await run(file, [withText(s)]); if (!refused(x) || !names(x.err.message, 'criteria[0].oracle')) miss.push(s); }
    assert.deepEqual(miss, []);
  });

  test(`${file}: nenhuma frase sem palavra absoluta é recusada, nem uma com palavra absoluta e oracle (0 falsos positivos)`, async () => {
    const wrong = [];
    for (const s of negativas) { const x = await run(file, [withText(s)]); if (!accepted(x)) wrong.push(s); }
    for (const [i, s] of positivas.entries()) { const x = await run(file, [withText(s, ['corpus', 'property', 'reference', 'threshold'][i % 4])]); if (!accepted(x)) wrong.push('com oracle: ' + s); }
    assert.deepEqual(wrong, []);
  });
}

test('corpus das frases: pelo menos 30 positivas e 30 negativas, e cada palavra absoluta aparece em 2 ou mais positivas', () => {
  assert.ok(positivas.length >= 30 && negativas.length >= 30, `${positivas.length} positivas e ${negativas.length} negativas`);
  for (const w of absolutas) assert.ok(positivas.filter((s) => new RegExp(`(?<![\\p{L}\\p{N}_])${w}(?![\\p{L}\\p{N}_])`, 'iu').test(s)).length >= 2, `«${w}» em menos de 2 positivas`);
  for (const w of ['install', 'many', 'company', 'everyday', 'allocate', 'alloy']) assert.ok(negativas.some((s) => s.toLowerCase().includes(w)), `falta a armadilha «${w}»`);
});

test('o bloco do contrato é o mesmo texto nos dois workflows (um só validador, copiado)', () => {
  const block = (s) => s.match(/^\/\/ contract:begin[^\n]*\n([\s\S]*?)^\/\/ contract:end/m)?.[1];
  const [a, b] = FILES.map((f) => block(src[f]));
  assert.ok(a && b, 'falta o bloco «contract:begin … contract:end» num dos workflows');
  assert.equal(a, b);
});
