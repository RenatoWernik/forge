// F-12 (brief da Ronda −1): a página atualiza-se ao vivo quando a cópia do painel.json muda, sem recarregar e sem ficar com dados
// velhos. Oráculo: uma sequência fixa de 6 estados do documento `painel/estado` (válido A, válido B com 9 agentes, inválido, ausente,
// 30 agentes, válido A), cada um entregue pela subscrição da base de dados falsa; cada passo tem de aparecer em 3 s ou menos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comBrowser, testePagina, paginaDe, docsDe, base, todosEstados, comAgentes, esperado } from './helpers.mjs';

let B, pagina;
before(async () => { B = await comBrowser(); pagina = await paginaDe(); });
after(async () => { await B?.fechar(); });

const igual = (m) => (v) => !v.erro && JSON.stringify(v.contagens) === JSON.stringify(m.contagens) && JSON.stringify((v.agentes ?? []).map((a) => a.nome)) === JSON.stringify(m.agentes.map((a) => a.nome)) && v.percentagem === m.percentagem;
const erro = (v) => typeof v.erro === 'string' && !!v.erro.trim() && v.contagens === null && !(v.agentes ?? []).length;

testePagina('C8: a sequência A → B → inválido → ausente → 30 agentes → A aparece passo a passo, na mesma carga da página', async () => {
  const A = base(), Bp = { ...todosEstados(), agentes: comAgentes(9).agentes }, C30 = comAgentes(30);
  const invalido = base(); invalido.tickets[0].estado = 'feito';
  await B.abrir(pagina, { docs: docsDe(A) });
  await B.avaliar('window.__marca = 7731');
  const passos = [['A', A], ['B (9 agentes)', Bp], ['inválido', invalido], ['ausente', undefined], ['30 agentes', C30], ['A de novo', A]];
  const falhas = [];
  for (const [nome, p] of passos) {
    if (nome !== 'A') await B.avaliar(`window.__fake.definir('painel/estado', ${JSON.stringify(p) ?? 'undefined'})`);
    const ok = p === undefined || (await esperado(p)).erro ? erro : igual(await esperado(p));
    const v = await B.esperarVista(ok, 3000);
    if (!ok(v)) falhas.push(`${nome}: a página mostra ${JSON.stringify(v).slice(0, 300)}`);
  }
  assert.equal(await B.avaliar('window.__marca'), 7731, 'a página recarregou');
  assert.deepEqual(B.estado.excecoes, []);
  assert.deepEqual(falhas, []);
});
