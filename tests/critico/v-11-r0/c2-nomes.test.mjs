// Ronda −1 do V-11 (#135): o inventário de nomes de teste antes e depois (como no V-03, mas estático, porque o V-11 não depende do executor).
// Oráculo: para cada tests/critico/**/*.test.mjs e scripts/*.test.mjs do merge-base, o ficheiro continua lá e cada título literal de
// test/it/describe continua no mesmo ficheiro pelo menos tantas vezes como antes, com o prefixo «ÂMBITO: » retirado dos dois lados.
// É de âmbito: compara o ticket com o merge-base, fora dos ramos v-11* faz skip.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { soNoTicket } from '../_comum/ambito.mjs';
import { arvore, ler, testes, semPrefixo, naRevisao, listaNaBase, base, limpa } from './helpers.mjs';

after(limpa);
const conta = (ts) => { const m = new Map(); for (const x of ts) m.set(semPrefixo(x.titulo), (m.get(semPrefixo(x.titulo)) ?? 0) + 1); return m; };

test('ÂMBITO: C2 nenhum teste desaparece: os títulos de test/it/describe do merge-base continuam nos mesmos ficheiros (sem o prefixo «ÂMBITO: »)', (t) => {
  if (soNoTicket(t, 'v-11')) return;
  const mb = base();
  if (!mb) return t.skip('sem origin/main');
  const fs = listaNaBase(mb, 'tests/critico', 'scripts').filter((f) => /^(?:tests\/critico\/.+|scripts\/[^/]+)\.test\.mjs$/.test(f));
  const antes = naRevisao(mb, fs), agora = new Set(arvore());
  const faltam = [];
  let n = 0;
  for (const f of fs) {
    if (!agora.has(f)) { faltam.push(f + ': o ficheiro desapareceu'); continue; }
    const depois = conta(testes(ler(f)));
    for (const [titulo, k] of conta(testes(antes.get(f)))) {
      n += k;
      if ((depois.get(titulo) ?? 0) < k) faltam.push(`${f}: «${titulo.slice(0, 100)}» ${k}× no merge-base, ${depois.get(titulo) ?? 0}× agora`);
    }
  }
  assert.ok(fs.length >= 150 && n >= 1400, `controlo: ${fs.length} ficheiros e ${n} títulos no merge-base`);
  assert.deepEqual(faltam, [], 'testes que desapareceram:\n' + faltam.join('\n'));
});