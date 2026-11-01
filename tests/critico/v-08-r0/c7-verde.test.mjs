// V-08 C7 (#132, RESPOSTA 3 do orquestrador, 6563556283): o manifesto ganha `lints: [...]` (no forge, os 2 lints de scripts/; no template, []);
// com [] o passo 2 dá «ok lint (nenhum lint declarado)», e num projeto gerado um ticket limpo dá CHECK-TICKET VERDE. O C3 (FAIL no passo 4
// com uma suíte vermelha) mantém-se em c3-comando. «VERDE»: código 0, as 6 linhas ok, e com --publicar e o gh falso o --body começa por
// `CHECK-TICKET: VERDE <sha do HEAD>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, gerar, conjunto, preCondicao, repo, git, commita, escreve, comSuites, suiteComando, correAteFim, ghFalso, lerJson, fim } from './helpers.mjs';

const PASSOS = ['árvore limpa', 'lint', 'âmbito', 'afetadas no ramo', 'pós-merge', 'esquema'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('C7: no forge, scripts/suites.json declara lints = scripts/guardas-critico.test.mjs e scripts/mapa-suites.test.mjs', () => {
  const f = join(ROOT, 'scripts/suites.json');
  assert.ok(existsSync(f), 'scripts/suites.json não existe');
  assert.deepEqual([...(lerJson(f).lints ?? [])].sort(), ['scripts/guardas-critico.test.mjs', 'scripts/mapa-suites.test.mjs']);
});

test('C7: num projeto gerado, um ticket limpo dá CHECK-TICKET VERDE: código 0, as 6 linhas ok («ok lint (nenhum lint declarado)») e o comentário VERDE do sha', async () => {
  const P = await gerar(await conjunto('en-plain-published'));
  preCondicao(P);
  repo(P);
  git(P, 'checkout', '-q', '-b', 'ticket');
  escreve(P, 't/verde.test.mjs', "import { test } from 'node:test';\ntest('v1', () => {});\ntest('v2', () => {});\n");
  comSuites(P, [suiteComando('verde', 't/verde.test.mjs')]);
  const sha = commita(P, 'uma suite verde');
  const gh = ghFalso();
  const r = correAteFim(P, 'check-ticket.mjs', ['--ambito', '**', '--base', 'main', '--publicar', '7'], { env: gh.env });
  assert.equal(r.status, 0, `código ${r.status} ao fim de ${r.chamadas} chamada(s)` + fim(r));
  const ls = r.out.split(/\r?\n/);
  for (const p of PASSOS) assert.ok(ls.some((l) => new RegExp(`^\\s*ok\\s+${esc(p)}(\\s|$)`).test(l)), `sem a linha «ok ${p}»` + fim(r));
  assert.ok(ls.some((l) => /^\s*ok\s+lint\b.*nenhum lint declarado/.test(l)), 'sem «ok lint (nenhum lint declarado)»' + fim(r));
  assert.ok(!ls.some((l) => /^\s*FAIL\b/.test(l)), 'há linhas FAIL' + fim(r));
  const c = gh.chamadas().filter((a) => a.includes('comment'));
  assert.equal(c.length, 1, 'chamadas pr comment ao gh: ' + JSON.stringify(gh.chamadas()));
  const i = c[0].indexOf('--body');
  assert.ok(c[0].slice(0, 3).join(' ') === 'pr comment 7' && i > 0, 'argv do gh: ' + JSON.stringify(c[0]));
  const m = (c[0][i + 1] ?? '').split(/\r?\n/)[0].match(/^CHECK-TICKET: VERDE ([0-9a-f]{7,40})\b/);
  assert.ok(m && sha.startsWith(m[1]), 'a 1.ª linha do --body não é «CHECK-TICKET: VERDE <sha do HEAD>»: ' + c[0][i + 1]);
});