// F-12 (brief da Ronda −1): acessibilidade. 1) Sem dependências: na árvore de acessibilidade do browser, cada botão, campo, ligação,
// separador e caixa tem nome acessível, e o documento tem lang, a 390 e a 1440, com dados e com erro. 2) O axe sem nenhuma violação
// serious ou critical: o axe-core é opcional (resposta 3); corre quando FORGE_AXE aponta para o axe.min.js, senão faz skip com o motivo.
// O teste 1 é obrigatório.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SEM_BROWSER, comBrowser, testePagina, paginaDe, docsDe, FIXTURES, base } from './helpers.mjs';

const COM_NOME = new Set(['button', 'textbox', 'link', 'tab', 'checkbox', 'combobox', 'searchbox', 'switch', 'radio', 'menuitem', 'slider', 'spinbutton', 'img', 'progressbar', 'meter']);
const invalido = base(); invalido.tickets[0].estado = 'feito';
const CASOS = [['9 agentes', FIXTURES['9 agentes']], ['nomes com HTML', FIXTURES['nomes longos, com acentos e com HTML']], ['inválido', invalido]];

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

testePagina('C11: todo o controlo e imagem tem nome acessível e o documento tem lang (390 e 1440, com dados e com erro)', async () => {
  const falhas = [];
  for (const w of [390, 1440]) for (const [nome, p] of CASOS) {
    await B.abrir(pagina, { docs: docsDe(p), largura: w, altura: w === 390 ? 844 : 900 });
    if (!(await B.avaliar('document.documentElement.lang'))) falhas.push(`${w} ${nome}: sem lang`);
    const { nodes } = await B.s('Accessibility.getFullAXTree');
    for (const n of nodes) {
      if (n.ignored || !COM_NOME.has(n.role?.value)) continue;
      if (!String(n.name?.value ?? '').trim()) falhas.push(`${w} ${nome}: ${n.role.value} sem nome`);
    }
  }
  assert.deepEqual(falhas, []);
});

test('C11: axe sem violações serious nem critical (390 e 1440, com dados e com erro)', { skip: SEM_BROWSER || (!(process.env.FORGE_AXE && existsSync(process.env.FORGE_AXE)) && 'sem axe-core: dependência opcional (resposta 3); defina FORGE_AXE com o caminho do axe.min.js') }, async () => {
  const axe = readFileSync(process.env.FORGE_AXE, 'utf8');
  const falhas = [];
  for (const w of [390, 1440]) for (const [nome, p] of CASOS) {
    await B.abrir(pagina, { docs: docsDe(p), largura: w, altura: w === 390 ? 844 : 900 });
    await B.avaliar(axe + '\n;0');
    const v = await B.avaliar('axe.run(document, { resultTypes: ["violations"] }).then((r) => r.violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => x.id + " (" + x.nodes.length + ")"))');
    falhas.push(...v.map((x) => `${w} ${nome}: ${x}`));
  }
  assert.deepEqual(falhas, []);
});
