// F-12, critério 5 (e barra): a página continua em português e em inglês. Os textos novos (os blocos dos tickets e dos agentes)
// também vêm traduzidos: um texto visível igual na página em inglês e na página em português, que já não era igual antes do F-12
// e não é um dado do painel, é um texto por traduzir. Oráculo: o mesmo projeto gerado nas duas línguas, com o mesmo painel, pelo
// pacote atual e pelo pacote antes do F-12 (merge-base com a origin/main, por git archive), comparando os nós de texto, placeholders, aria-labels, títulos e o title.
// Os identificadores puros do esquema (estado, papel, modo) aceitam-se iguais nas duas línguas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ROOT, PAGINA, tmp, git, antes as pacoteAntes, gerar, respostas, comBrowser, testePagina, docsDe, docVida, todosEstados, comAgentes, AGORA, MIN } from './helpers.mjs';

const EN = respostas('en-noplain-published');
const PT = { ...EN, language: 'Portuguese (Brazil)' };
// 4 agentes, um por vida (ativo, sem sinal, parado?, a começar), com o documento painel/vida da resposta 2 (resposta 8: as vidas traduzidas)
const PAINEL = { ...todosEstados(), agentes: comAgentes(4).agentes };
const MTIMES = { 'ag-1.md': AGORA - 2 * MIN, 'ag-2.md': AGORA - 15 * MIN, 'ag-3.md': AGORA - 40 * MIN };
const IDS = new Set(['main', 'aprovado', 'critico', 'dev', 'reprovado', 'espera', 'falta', 'tester', 'outro', 'acelerado', 'rigoroso']);
const DADOS = [EN.projectName, ...JSON.stringify(PAINEL).match(/"(?:[^"\\]|\\.)*"/g).map((s) => JSON.parse(s)).filter((s) => s.length > 2)];

const TEXTOS = `(() => {
  const out = [document.title];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const p = n.parentElement; if (!p || p.closest('script,style,title')) continue; const t = n.textContent.trim(); if (t) out.push(t); }
  for (const e of document.querySelectorAll('[placeholder],[aria-label],[title]')) for (const a of ['placeholder', 'aria-label', 'title']) { const v = e.getAttribute(a); if (v && v.trim()) out.push(v.trim()); }
  return out;
})()`;
const letras = (s) => { let r = s; for (const d of DADOS) r = r.split(d).join(''); return (r.match(/\p{L}/gu) ?? []).length; };
const iguais = (a, b) => { const sb = new Set(b); return new Set(a.filter((s) => sb.has(s) && !IDS.has(s) && letras(s) >= 3)); };

let B;
before(async () => { B = await comBrowser(); });
after(async () => { await B?.fechar(); });

const textos = async (answers, scaffoldPath) => {
  const dest = await gerar(answers, scaffoldPath);
  await B.abrir(readFileSync(join(dest, PAGINA), 'utf8'), { docs: { ...docsDe(PAINEL), ...await docVida(PAINEL, MTIMES) } });
  return B.avaliar(TEXTOS);
};

testePagina('C5: nenhum texto novo da página fica igual em inglês e em português (por traduzir)', async () => {
  const antigo = tmp('critico-f12-base-');
  const tar = join(antigo, 'base.tar');
  const a = git('archive', '--format=tar', '-o', tar, pacoteAntes(), 'scripts', 'templates');
  assert.equal(a.status, 0, a.stderr);
  const x = spawnSync('tar', ['-xf', tar, '-C', antigo], { encoding: 'utf8' });
  assert.equal(x.status, 0, x.stderr);
  const scaffoldBase = join(antigo, 'scripts/scaffold.mjs');
  const antes = iguais(await textos(EN, scaffoldBase), await textos(PT, scaffoldBase));
  const agora = iguais(await textos(EN), await textos(PT));
  assert.deepEqual([...agora].filter((s) => !antes.has(s)), []);
});

testePagina('C5: a página em português mostra a língua certa (lang pt-BR) e a inglesa en', async () => {
  for (const [ans, lang] of [[PT, 'pt-BR'], [EN, 'en']]) {
    const dest = await gerar(ans);
    await B.abrir(readFileSync(join(dest, PAGINA), 'utf8'), { docs: docsDe(PAINEL) });
    assert.equal(await B.avaliar('document.documentElement.lang'), lang);
  }
});

test('C5: o teste existente do scaffold sobre as línguas do painel continua lá', () => {
  const src = readFileSync(join(ROOT, 'scripts/scaffold.test.mjs'), 'utf8');
  assert.match(src, /test\('the panel page speaks the project language: Portuguese built in, any other through panelStrings'/);
});
