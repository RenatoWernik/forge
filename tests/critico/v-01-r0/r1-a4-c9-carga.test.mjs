// Ataque 4 do crítico R1 do V-01 (#125, C9 sob carga; pedido do orquestrador depois do HEAD ba26e41). Com a máquina carregada (14
// processos node em ciclo, lançados e mortos por este teste pelo PID), mata-se a árvore do motor gravado (taskkill /PID /T /F: a forma de
// matar que as regras do projeto mandam usar) a meio da fila. Oráculo do C9: o --continuar relança todas as unidades sem estado final
// próprio, e a cadeia acaba em 0. Uma unidade que só morreu por arrasto da morte do motor não pode ficar com um estado final (fail/erro).
// 4 repetições; qualquer cadeia que acabe ≠ 0 é falha. Diagnóstico (2026-11-02): com /T, a unidade morre antes do motor, o node --test
// dela escreve «not ok» e o motor grava `fail` antes de morrer; matando só o PID do motor (sem /T), 5/5 passam com a mesma carga.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { H, montar, motores, cadeia } from './r1-comum.mjs';

after(H.limpa);

test('A4: C9 sob carga: matar a árvore do motor a meio nunca deixa unidades mortas por arrasto com estado final; a cadeia acaba em 0 (4×)', { timeout: 500000 }, async () => {
  const burn = Array.from({ length: +(process.env.A4_BURN || 14) }, () => { const p = spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore', windowsHide: true }); H.registaPid(p.pid); return p; });
  const falhas = [];
  try {
    for (let k = 0; k < 4; k++) {
      const d = montar(`a4-${k}`, { paralelo: 2, orcamento_s: 10, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 6, 'q-2': 6, 'q-3': 12, 'q-4': 12 });
      const env = H.tempPrivado();
      const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 90000 });
      const [m] = motores(d);
      if (r1.status !== 3 || !m || !H.vivo(m.pid)) { falhas.push(`#${k}: cenário inválido (1.ª chamada ${r1.status})`); continue; }
      await H.esperaAte(() => H.inicios(d).length === 4, 40000);
      const antes = Object.fromEntries(H.umResultado(d).dados.unidades.map((u) => [u.ficheiro, u.estado]));
      H.mataArvore(m.pid);
      await H.esperaAte(() => !H.vivo(m.pid), 10000);
      const cod = await cadeia(d, env, 5, 90000);
      const res = H.umResultado(d).dados;
      const arrasto = res.unidades.filter((u) => antes[u.ficheiro] === 'em_curso' && u.estado !== 'pass').map((u) => `${u.ficheiro}=${u.estado}`);
      if (cod.at(-1) !== 0 || arrasto.length) falhas.push(`#${k}: cadeia ${cod.join(',')}; em_curso antes da morte e agora ${arrasto.join(' ') || '-'}`);
    }
  } finally { for (const p of burn) p.kill(); }
  assert.deepEqual(falhas, []);
});
