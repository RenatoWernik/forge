// V-08 C3 (#132): um projeto gerado num repo temporário com 2 suítes `tipo: comando` (uma verde e uma vermelha, com `formato: tap`) dá, no
// executor, os resultados certos e o código 1; o check-ticket desse projeto dá FAIL no passo 4 («afetadas no ramo»). O projeto é o que sai do
// scaffold, com o .gitignore dele; main = o projeto, ticket = main mais as 2 suítes. As vagas e os clones ficam num TEMP privado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerar, conjunto, preCondicao, repo, git, commita, escreve, comSuites, suiteComando, correAteFim, resultado, fim } from './helpers.mjs';

const VERDE = "import { test } from 'node:test';\ntest('v1', () => {});\ntest('v2', () => {});\n";
const VERMELHA = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('r1', () => {});\ntest('r2', () => { assert.equal(1, 2); });\n";

const montar = async () => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  repo(P);
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 't/verde.test.mjs', VERDE);
  escreve(P, 't/vermelha.test.mjs', VERMELHA);
  comSuites(P, [suiteComando('verde', 't/verde.test.mjs'), suiteComando('vermelha', 't/vermelha.test.mjs')]);
  return { P, sha: commita(P, 'duas suites comando') };
};
const contas = (s) => s && { estado: s.estado, pass: s.pass, fail: s.fail };

test('C3: o executor do projeto corre as 2 suítes `comando` e dá 1; o resultado do HEAD tem a verde pass (2 pass, 0 fail) e a vermelha fail (1 pass, 1 fail)', async () => {
  const { P, sha } = await montar();
  const r = correAteFim(P, 'executor.mjs', ['--todas']);
  assert.equal(r.status, 1, `código ${r.status} ao fim de ${r.chamadas} chamada(s)` + fim(r));
  const res = resultado(P, sha);
  assert.equal(res.sha, sha, 'o resultado é de outro sha');
  assert.equal(res.completo, true, 'o resultado não está completo');
  assert.deepEqual(contas(res.suites?.verde), { estado: 'pass', pass: 2, fail: 0 }, 'suíte verde: ' + JSON.stringify(res.suites?.verde));
  assert.deepEqual(contas(res.suites?.vermelha), { estado: 'fail', pass: 1, fail: 1 }, 'suíte vermelha: ' + JSON.stringify(res.suites?.vermelha));
  const de = (s) => (res.unidades ?? []).filter((u) => u.suite === s);
  assert.ok(de('verde').length && de('verde').every((u) => u.estado === 'pass'), 'unidades da verde: ' + JSON.stringify(de('verde')));
  assert.ok(de('vermelha').some((u) => u.estado === 'fail'), 'unidades da vermelha: ' + JSON.stringify(de('vermelha')));
});

test('C3: o check-ticket do projeto (--ambito ** --base main) dá um código fora de 0 e de 3, com a linha «FAIL afetadas no ramo» a nomear a vermelha, que correu', async () => {
  const { P, sha } = await montar();
  const r = correAteFim(P, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main']);
  assert.ok(r.status !== null && ![0, 3].includes(r.status), `código ${r.status} ao fim de ${r.chamadas} chamada(s)` + fim(r));
  const l = r.out.split(/\r?\n/).filter((x) => /^\s*FAIL\s+afetadas no ramo\b/.test(x)).at(-1);
  assert.ok(l, 'sem a linha «FAIL afetadas no ramo»' + fim(r));
  assert.match(l, /\bvermelha\b/, 'a linha do passo 4 não nomeia a suíte vermelha: ' + l);
  const res = resultado(P, sha);
  assert.equal(res.suites?.vermelha?.estado, 'fail', 'a vermelha não correu no passo 4: ' + JSON.stringify(res.suites));
  assert.equal(res.suites?.verde?.estado, 'pass', 'a verde não correu no passo 4: ' + JSON.stringify(res.suites));
});