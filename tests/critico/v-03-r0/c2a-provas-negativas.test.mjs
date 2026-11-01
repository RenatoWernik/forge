// V-03 critério C2, parte a: o controlo, «alvo com fail: 1» e «pass abaixo do N do assert». Mecanismo em c2-comum.mjs.
import { c2 } from './c2-comum.mjs';

c2('a', {
  'controlo, tudo verde e pass de sobra': { verde: true, muda: () => {} },
  'alvo com fail: 1': { muda: (d, f, S) => { for (const u of d.unidades) if (S.has(u.suite)) { u.fail = 1; u.estado = 'fail'; } } },
  // N − 1 no primeiro ficheiro do alvo de cada teste (o menor, se dois partilham o ficheiro) e 0 no resto das suítes-alvo; as outras ficam verdes
  'pass abaixo do N do assert': {
    muda: (d, f, S) => {
      for (const u of d.unidades) if (S.has(u.suite)) u.pass = 0;
      const n = new Map();
      for (const x of f.titulos) { const p = f.alvos[x]?.[0]; if (p) n.set(p, Math.min(n.get(p) ?? Infinity, (f.n[x] ?? 1) - 1)); }
      for (const u of d.unidades) if (n.has(u.ficheiro)) u.pass = n.get(u.ficheiro);
    },
  },
}, { inventario: true });