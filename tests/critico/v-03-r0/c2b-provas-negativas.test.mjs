// V-03 critério C2, parte b: «outro sha» e «alvo em falta», mais os dois caminhos de falso verde da spec §4.4 e do risco 1: outra árvore e
// alvo incompleto. Mecanismo em c2-comum.mjs.
import { c2 } from './c2-comum.mjs';
import { outroSha } from './helpers.mjs';

c2('b', {
  'outro sha': { muda: (d) => { d.sha = outroSha(d.sha); } },
  'alvo em falta': { muda: (d, f, S) => { d.unidades = d.unidades.filter((u) => !S.has(u.suite)); } },
  'outra árvore (suja)': { muda: (d) => { d.arvore = 'suja:' + 'e'.repeat(64); } },
  // cada suíte-alvo perde a última unidade (se tiver mais de uma) e fica com a primeira em curso; o resultado não está completo
  'alvo incompleto': {
    muda: (d, f, S) => {
      d.completo = false;
      for (const s of S) {
        const us = d.unidades.filter((u) => u.suite === s);
        if (us.length > 1) d.unidades.splice(d.unidades.indexOf(us.at(-1)), 1);
        us[0].estado = 'em_curso';
      }
    },
  },
});