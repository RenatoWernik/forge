// F-07 critério 1: o contrato é validado antes de qualquer agent(), no gauntlet-build e no gauntlet-attacks. Cada contrato
// inválido é recusado com o nome do campo em falta ou errado, e com zero agentes lançados; a falta de `issue` também conta.
// Depende do F-06: não. Emenda (resposta 1 do orquestrador): todos os critérios têm comando; o oracle só é obrigatório nos absolutos.
// Oráculo (independente do dev): o corpus BAD abaixo, um caso por campo e por classe de defeito (em falta, null, vazio, só espaços,
// tipo errado, valor fora do enum), com o campo esperado em cada um; e o corpus GOOD, que tem de lançar agentes sem erro (sem alarme
// falso). Corre nos dois workflows e nos dois modos. Uma peça inválida ao lado de uma válida também dá zero agentes («antes de
// qualquer agent()»). O critério diz ainda que a verificação é o check.cjs num projeto do corpus: isso está em c7-check.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACKS, BUILD, MODES, CONTRACT_TEXT, contract, baseArgs, comR0, r0, runWf, fakeImpl, refusalText, names, fieldLabel } from './helpers.mjs';

const C = () => contract();
const edit = (f) => { const p = C(); f(p); return p; };
const crit = (i, f) => edit((p) => f(p.criteria[i]));

const BAD = [
  ['issue em falta', 'issue', edit((p) => { delete p.issue; })],
  ['issue undefined', 'issue', edit((p) => { p.issue = undefined; })],
  ['issue null', 'issue', edit((p) => { p.issue = null; })],
  ['issue 0', 'issue', edit((p) => { p.issue = 0; })],
  ['issue negativa', 'issue', edit((p) => { p.issue = -3; })],
  ['issue fracionária', 'issue', edit((p) => { p.issue = 1.5; })],
  ['issue em texto não numérico', 'issue', edit((p) => { p.issue = 'abc'; })],
  ['issue vazia', 'issue', edit((p) => { p.issue = ''; })],
  ...CONTRACT_TEXT.flatMap((k) => [
    [`${k} em falta`, k, edit((p) => { delete p[k]; })],
    [`${k} null`, k, edit((p) => { p[k] = null; })],
    [`${k} vazio`, k, edit((p) => { p[k] = ''; })],
    [`${k} só com espaços`, k, edit((p) => { p[k] = '   '; })],
  ]),
  ['criteria em falta', 'criteria', edit((p) => { delete p.criteria; })],
  ['criteria null', 'criteria', edit((p) => { p.criteria = null; })],
  ['criteria vazia', 'criteria', edit((p) => { p.criteria = []; })],
  ['criteria em texto', 'criteria', edit((p) => { p.criteria = 'node --test'; })],
  ['criteria em objeto', 'criteria', edit((p) => { p.criteria = { text: 'x', oracle: 'corpus', command: 'c' }; })],
  ['critério 1 sem command', ['criteria', 0, 'command'], crit(0, (c) => { delete c.command; })],
  ['critério 2 sem command', ['criteria', 1, 'command'], crit(1, (c) => { delete c.command; })],
  ['critério 2 com command vazio', ['criteria', 1, 'command'], crit(1, (c) => { c.command = ''; })],
  ['critério 2 com command só com espaços', ['criteria', 1, 'command'], crit(1, (c) => { c.command = '  '; })],
  ['critério 2 com command null', ['criteria', 1, 'command'], crit(1, (c) => { c.command = null; })],
  ['critério 1 sem text', ['criteria', 0, 'text'], crit(0, (c) => { delete c.text; })],
  ['critério 2 com text vazio', ['criteria', 1, 'text'], crit(1, (c) => { c.text = ''; })],
  ['critério 2 com oracle fora do enum', ['criteria', 1, 'oracle'], crit(1, (c) => { c.oracle = 'vibes'; })],
  ['critério 1 com oracle «Corpus» (maiúscula)', ['criteria', 0, 'oracle'], crit(0, (c) => { c.oracle = 'Corpus'; })],
  ['critério 2 com oracle numérico', ['criteria', 1, 'oracle'], crit(1, (c) => { c.oracle = 1; })],
];

const GOOD = [
  ['o contrato de base', C()],
  ['issue grande', contract('pa', 123456)],
  ['os 4 tipos de oracle', contract('pa', 9101, { criteria: ['corpus', 'property', 'reference', 'threshold'].map((o, i) => ({ text: `Step ${i} returns 3 rows`, oracle: o, command: `node --test t${i}.test.mjs` })) })],
  ['6 critérios', contract('pa', 9101, { criteria: Array.from({ length: 6 }, (_, i) => ({ text: `Step ${i} returns 3 rows`, oracle: 'corpus', command: `node --test t${i}.test.mjs` })) })],
  ['1 critério', contract('pa', 9101, { criteria: [{ text: 'The export returns 3 rows', oracle: 'threshold', command: 'node --test a.test.mjs' }] })],
  ['textos em português', contract('pa', 9101, { objective: 'Exportar as faturas em CSV', input: 'ramo main, ficheiros src/a.js', fails: 'um critério falhado', outOfScope: 'paginação', env: 'Node 24', output: 'PR em rascunho', criteria: [{ text: 'O ficheiro tem 3 linhas para o exemplo', oracle: 'corpus', command: 'node --test a.test.mjs' }] })],
  ['critério absoluto com oracle', contract('pa', 9101, { criteria: [{ text: 'The token never reaches the log', oracle: 'corpus', command: 'node --test leak.test.mjs' }] })],
];

const args = (file, pieces, mode) => { const a = baseArgs(pieces, { mode }); return file === BUILD ? comR0(a, pieces.map((p) => r0(p.id))) : a; };

for (const file of [ATTACKS, BUILD]) {
  for (const mode of MODES) {
    test(`C1 ${file} (${mode}): cada contrato inválido é recusado antes de qualquer agent(), com o nome do campo`, async () => {
      const wrong = [];
      for (const [label, field, p] of BAD) {
        const x = await runWf(file, args(file, [p], mode), fakeImpl({ pieces: [p] }));
        const t = refusalText(x);
        if (x.calls.length !== 0) wrong.push(`${label}: lançou ${x.calls.length} agentes`);
        else if (!names(t, field)) wrong.push(`${label}: a recusa não nomeia ${fieldLabel(field)}: ${t.slice(0, 200)}`);
      }
      assert.deepEqual(wrong, []);
    });

    test(`C1 ${file} (${mode}): a mensagem é do campo, não uma lista fixa (campos diferentes dão mensagens diferentes)`, async () => {
      const msgs = new Map();
      for (const k of ['issue', ...CONTRACT_TEXT, 'criteria']) {
        const p = edit((q) => { delete q[k]; });
        const x = await runWf(file, args(file, [p], mode), fakeImpl({ pieces: [p] }));
        assert.equal(x.calls.length, 0, `${k} em falta: lançou ${x.calls.length} agentes`);
        msgs.set(k, refusalText(x));
      }
      const same = [...msgs].filter(([k, m], i, all) => all.some(([k2, m2]) => k2 !== k && m2 === m)).map(([k]) => k);
      assert.deepEqual(same, [], 'campos em falta com a mesma mensagem');
    });

    test(`C1 ${file} (${mode}): cada contrato válido do corpus lança agentes e não dá erro (sem alarme falso)`, async () => {
      const wrong = [];
      for (const [label, p] of GOOD) {
        const x = await runWf(file, args(file, [p], mode), fakeImpl({ pieces: [p] }));
        if (x.err || x.calls.length === 0) wrong.push(`${label}: ${x.calls.length} agentes; ${refusalText(x).slice(0, 200)}`);
      }
      assert.deepEqual(wrong, []);
    });

    test(`C1 ${file} (${mode}): uma peça inválida ao lado de uma válida trava o workflow inteiro antes de qualquer agent(), e nomeia o campo`, async () => {
      const ok = contract('pa', 9101), bad = contract('pb', 9102, { criteria: [{ text: 'Returns 3 rows', oracle: 'corpus' }] });
      for (const pieces of [[ok, bad], [bad, ok]]) {
        const x = await runWf(file, args(file, pieces, mode), fakeImpl({ pieces }));
        assert.equal(x.calls.length, 0, `${pieces.map((p) => p.id)}: lançou ${x.calls.length} agentes`);
        assert.ok(names(refusalText(x), ['criteria', 0, 'command']), refusalText(x).slice(0, 200));
      }
    });
  }
}

// Mais de 6 critérios: emenda do orquestrador (resposta 4, E:\Guilda\.checkpoints\orquestrador-resp-f07.md): a validação recusa
// a peça com mais de 6 critérios e indica qual partir. Oráculo: 7, 8 e 12 critérios recusados (6 aceites está no GOOD), sozinha
// ou ao lado de uma peça válida, com zero agent() e uma mensagem que nomeia o campo criteria e o id da peça a partir.
const many = (n, id = 'pb', issue = 9102) => contract(id, issue, { criteria: Array.from({ length: n }, (_, i) => ({ text: `Step ${i} returns 3 rows`, oracle: 'corpus', command: `node --test t${i}.test.mjs` })) });
const namesId = (msg, id) => new RegExp(`(?<![\\w-])${id}(?![\\w-])`).test(msg);
for (const file of [ATTACKS, BUILD]) {
  for (const mode of MODES) {
    test(`C1+ ${file} (${mode}): uma peça com mais de 6 critérios é recusada antes de qualquer agent(), nomeando criteria e a peça a partir`, async () => {
      const wrong = [];
      for (const n of [7, 8, 12]) {
        for (const pieces of [[many(n)], [contract('pa', 9101), many(n)]]) {
          const x = await runWf(file, args(file, pieces, mode), fakeImpl({ pieces }));
          const t = refusalText(x);
          if (x.calls.length !== 0) wrong.push(`${n} critérios (${pieces.length} peças): lançou ${x.calls.length} agentes`);
          else if (!names(t, 'criteria') || !namesId(t, 'pb')) wrong.push(`${n} critérios (${pieces.length} peças): a recusa não nomeia criteria e pb: ${t.slice(0, 200)}`);
        }
      }
      assert.deepEqual(wrong, []);
    });
  }
}
