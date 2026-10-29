// Ponte dos ataques do F-12 (ver o topo de tests/critico/f-12-r0/helpers.mjs): só reexporta e lê o DOM, sem lógica própria.
export { docsVida } from '../../scripts/painel.mjs';

export const seletorResumo = '#painel-resumo';
export const seletorInboxTexto = '#inbox-text';
export const seletorInboxEnviar = '#inbox-send';

// Corre dentro da página: lê só o que ela desenha. A vida vem do data-vida de cada agente (o texto mostrado está traduzido).
export function vista() {
  const erro = document.querySelector('#painel-erro');
  const pct = document.querySelector('#painel-pct');
  const contagens = [...document.querySelectorAll('#painel-contagens [data-estado]')].map((e) => [e.dataset.estado, Number(e.querySelector('b').textContent)]);
  return {
    erro: erro && !erro.hidden && erro.textContent.trim() ? erro.textContent.trim() : null,
    percentagem: pct ? parseInt(pct.textContent, 10) : null,
    contagens: contagens.length ? contagens : null,
    agentes: [...document.querySelectorAll('#painel-agentes > li')].map((li) => ({ nome: li.querySelector('.nome').textContent, vida: li.dataset.vida ?? null })),
  };
}
