// F-21b, C4: o manual. Oráculos do corpo da #74:
// - §5 Step 2 do templates/FRAMEWORK.md: o exemplo de args do build tem `"graph":"<absolute path of graphify-out/graph.json>"` e, na peça,
//   `"affected":{"nodes":[...],"files":[...]}` (`"affected":{` 1× no Step 2); a frase diz que o orquestrador corre `graphify affected`
//   (ou `graphify query`) uma vez por peça (`once per piece` 1× no Step 2), antes do Round −1, e cola os nós e os ficheiros no contrato
//   (a issue) e em `affected`;
// - §10.2 «Exact input» inclui os nós e os ficheiros afetados;
// - os exemplos do BOOTSTRAP continuam válidos sem `graph`: a linha `bootstrap: args:` e as validações de exemplo do check.cjs ficam ok.
// Leitura: `[...]` do corpo é notação; o exemplo é JSON real, logo cada lista tem os seus valores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, step2, count, generate, corpusAnswers, check, linesOf, fails } from './helpers.mjs';

test('C4 [ataque]: o exemplo de args do §5 Step 2 tem "graph":"<absolute path of graphify-out/graph.json>" e, na peça, "affected":{"nodes":[...],"files":[...]} uma só vez', () => {
  const s = step2();
  assert.ok(s.length > 200, 'não encontrei o §5 «### Step 2.» no FRAMEWORK.md');
  assert.ok(s.includes('"graph":"<absolute path of graphify-out/graph.json>"'), 'o exemplo não tem "graph":"<absolute path of graphify-out/graph.json>"');
  assert.equal(count(s, '"affected":{'), 1, '"affected":{ não aparece exatamente 1× no Step 2');
  assert.match(s, /"affected":\{"nodes":\[[^\]]*\],"files":\[[^\]]*\]\}/, 'o affected do exemplo não é {"nodes":[...],"files":[...]}');
});

test('C4 [ataque]: o Step 2 diz que o orquestrador corre graphify affected (ou query) uma vez por peça, antes do Round −1, e cola os nós e os ficheiros na issue e em affected', () => {
  const s = step2();
  assert.equal(count(s, 'once per piece'), 1, '«once per piece» não aparece exatamente 1× no Step 2');
  const par = s.split(/\r?\n\s*\r?\n/).find((p) => p.includes('once per piece'));
  assert.match(par, /graphify affected/, 'a frase de «once per piece» não fala de graphify affected');
  assert.match(par, /Round [−-]1/, 'a frase de «once per piece» não diz antes do Round −1');
  assert.match(par, /\bissue\b|\bcontract\b/, 'a frase de «once per piece» não diz que cola no contrato (a issue)');
  assert.ok((par.match(/\baffected\b/g) || []).length >= 2, 'a frase de «once per piece» não diz que cola em affected (além de graphify affected)');
  assert.match(par, /\bnodes\b/, 'a frase de «once per piece» não fala dos nós');
  assert.match(par, /\bfiles\b/, 'a frase de «once per piece» não fala dos ficheiros');
});

test('C4 [ataque]: o §10.2 «Exact input» inclui os nós e os ficheiros afetados', () => {
  const t = read('templates/FRAMEWORK.md');
  const i = t.search(/^### 10\.2 /m);
  assert.ok(i >= 0, 'sem §10.2');
  const line = t.slice(i).split(/\r?\n/).find((l) => l.includes('**Exact input**')) || '';
  assert.ok(line, 'sem «Exact input» no §10.2');
  assert.match(line, /\bnodes\b/, '«Exact input» não fala dos nós: ' + line);
  assert.match(line, /\baffected\b/, '«Exact input» não fala dos afetados: ' + line);
  assert.match(line, /\bfiles\b/, '«Exact input» não fala dos ficheiros: ' + line);
});

test('C4 [guarda]: dois projetos gerados passam todas as linhas do check.cjs, com bootstrap: args: e o exemplo do FRAMEWORK ok (sem graph no BOOTSTRAP)', async () => {
  for (const set of ['en-plain-published', 'en-noplain-pending']) {
    const r = check(await generate(corpusAnswers(set)));
    assert.equal(r.status, 0, `${set}: ` + fails(r.out));
    assert.match(r.out, /All ok\./, set);
    const ls = linesOf(r.out);
    const boot = ls.filter((l) => l.text.startsWith('bootstrap: args:'));
    assert.ok(boot.length >= 4 && boot.every((l) => l.state === 'ok'), `${set}: linhas bootstrap: args: ` + JSON.stringify(boot));
    const man = ls.filter((l) => l.text.startsWith('manual: the args example in FRAMEWORK.md'));
    assert.ok(man.length >= 1 && man.every((l) => l.state === 'ok'), `${set}: a validação do exemplo do FRAMEWORK: ` + JSON.stringify(man));
  }
});