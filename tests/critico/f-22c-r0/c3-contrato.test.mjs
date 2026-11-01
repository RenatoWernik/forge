// F-22c critério 3: o contrato recebe as lições da zona e as classes conhecidas (B5 e C5), no templates/FRAMEWORK.md.
// Oráculos (corpo da #79): `learn.mjs for` 1× no §10; `learn.mjs classes --ref` 1× no Step 2; o check.cjs valida os exemplos de args com
// `knownClasses`, e as linhas `bootstrap: args` e as do FRAMEWORK ficam ok.
// O que reprova: as knownClasses lidas da worktree ou da memória.
// LEITURA: a «Exact input» é o item «**Exact input**» do §10.2 (o §10.1 não tem esse item); o exemplo de args do Step 2 é a cerca ```json do
// Step 2, a que o check.cjs lê (linha `manual: the args example in FRAMEWORK.md`); `"knownClasses":[...]` tem pelo menos uma classe na forma da
// saída do `learn.mjs classes` ({class, entries, strongest}, FRAMEWORK §5 Step 2), ver a PERGUNTA 2.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projeto, apaga, check, LF, conta, seccao, fw, passo5 } from './helpers.mjs';

const lixo = [];
after(() => lixo.forEach(apaga));
const CAMADAS = ['test', 'hook', 'check', 'contract', 'text', 'memory'];
const exemplo = (t) => { const m = /```json\n([\s\S]*?)\n```/.exec(t); assert.ok(m, 'o Step 2 não tem a cerca ```json do exemplo de args'); return m[1]; };
const esperaClasses = (ex) => {
  assert.ok(Array.isArray(ex.knownClasses), 'o exemplo de args do Step 2 não tem "knownClasses":[...]');
  assert.ok(ex.knownClasses.length >= 1, 'o exemplo de args tem "knownClasses":[] vazio');
  for (const k of ex.knownClasses) {
    assert.match(String(k?.class), /^[a-z0-9]+(-[a-z0-9]+)*$/, 'class fora de kebab-case: ' + JSON.stringify(k));
    assert.ok(Array.isArray(k.entries), 'entries não é uma lista: ' + JSON.stringify(k));
    assert.ok(CAMADAS.includes(k.strongest), 'strongest não é uma camada: ' + JSON.stringify(k));
  }
};

test('C3 [ataque]: §10, a «Exact input» do contrato inclui a saída de node .claude/learn.mjs for <ficheiros afetados> (1× no §10), com os ficheiros do affected', () => {
  const s = seccao(fw(), '## 10. ');
  assert.ok(s.length > 100, 'não encontrei o «## 10. » do FRAMEWORK.md');
  assert.equal(conta(s, 'learn.mjs for'), 1, '`learn.mjs for` aparece ' + conta(s, 'learn.mjs for') + ' vezes no §10');
  const l = seccao(s, '### 10.2').split('\n').find((x) => /^\s*- \*\*Exact input\*\*/.test(x)) ?? '';
  assert.ok(l, 'o §10.2 não tem o item «**Exact input**»');
  assert.ok(l.includes('node .claude/learn.mjs for'), 'a «Exact input» não inclui `node .claude/learn.mjs for <ficheiros afetados>`: ' + l);
  assert.match(l, /\baffected\b/, 'a «Exact input» não liga os ficheiros ao affected: ' + l);
});

test('C3 [ataque]: Step 2, knownClasses para gauntlet-attacks e gauntlet-build com a saída de learn.mjs classes --ref <integration branch> (1×), nunca da worktree de uma peça', () => {
  const s = passo5(2);
  assert.ok(s.length > 200, 'não encontrei o «### Step 2.» do §5');
  assert.equal(conta(s, 'learn.mjs classes --ref'), 1, '`learn.mjs classes --ref` aparece ' + conta(s, 'learn.mjs classes --ref') + ' vezes no Step 2');
  for (const w of ['gauntlet-attacks', 'gauntlet-build']) assert.ok(s.includes(w), 'o Step 2 não nomeia ' + w);
  const l = s.split('\n').find((x) => x.includes('learn.mjs classes --ref')) ?? '';
  assert.ok(l.includes('node .claude/learn.mjs classes --ref <integration branch>'), 'a linha não tem `node .claude/learn.mjs classes --ref <integration branch>`: ' + l);
  assert.match(l, /\bnever\b[^\n]*\bworktree\b/i, 'a linha das knownClasses no Step 2 não diz «nunca da worktree de uma peça»: ' + l);
});

test('C3 [ataque]: o exemplo de args do Step 2 tem "knownClasses":[...] na forma da saída de learn.mjs classes', () => {
  const ex = JSON.parse(exemplo(passo5(2)).replace(/\{\{MODELS_JSON\}\}/g, '{}'));
  esperaClasses(ex);
});

test('C3 [ataque]: num projeto gerado, o check.cjs aceita o exemplo com knownClasses: as linhas «manual: the args example» e «bootstrap: args» ficam ok', async () => {
  const P = await projeto();
  lixo.push(P);
  const t = LF(readFileSync(join(P, 'FRAMEWORK.md'), 'utf8'));
  esperaClasses(JSON.parse(exemplo(t)));
  const r = check(P, []);
  const ls = r.linhas.filter((l) => /^(ok {4}|FAIL {2})(manual: the args example in FRAMEWORK\.md|bootstrap: args)/.test(l));
  assert.ok(ls.some((l) => l.slice(6).startsWith('manual: the args example in FRAMEWORK.md')), 'não há a linha «manual: the args example in FRAMEWORK.md»:\n' + r.out.slice(-1500));
  assert.ok(ls.filter((l) => l.slice(6).startsWith('bootstrap: args')).length >= 4, 'faltam as linhas «bootstrap: args»:\n' + ls.join('\n'));
  assert.deepEqual(ls.filter((l) => l.startsWith('FAIL')), [], 'linhas do exemplo de args em FAIL');
  assert.equal(r.status, 0, r.out.split('\n').filter((l) => l.startsWith('FAIL')).join('\n'));
  assert.match(r.out, /All ok\./);
});