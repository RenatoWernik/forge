// Ataque 4 do crítico R1 do V-01 (#125, C9 sob carga; pedido do orquestrador depois do HEAD ba26e41). Com a máquina carregada (14
// processos node em ciclo, lançados e mortos por este teste pelo PID), mata-se a árvore do motor gravado (taskkill /PID /T /F: a forma de
// matar que as regras do projeto mandam usar) a meio da fila. Oráculo do C9: o --continuar relança todas as unidades sem estado final
// próprio, e a cadeia acaba em 0. Uma unidade que só morreu por arrasto da morte do motor não pode ficar com um estado final (fail/erro).
// 4 repetições; qualquer cadeia que acabe ≠ 0 é falha. Diagnóstico (2026-11-02): com /T, a unidade morre antes do motor, o node --test
// dela escreve «not ok» e o motor grava `fail` antes de morrer; matando só o PID do motor (sem /T), 5/5 passam com a mesma carga.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants, cpus, setPriority } from 'node:os';
import { H, montar, motores, cadeia } from './r1-comum.mjs';

after(H.limpa);

// C9-c (contrato reescrito, #125): carga moderada e fixa, 4 processos a arder, no próprio ficheiro e não em env. Regista a carga de CPU no início de cada
// corrida. Se o event loop deste teste ficar parado mais de 30 s (a máquina, e não o motor), a corrida é inválida (skip), e não uma falha.
const BURNERS = 4, PARADO_MAX_MS = 30000, PRAZO_BURNER_MS = 600000; // cada burner acaba sozinho (nunca órfão) e corre com prioridade baixa
const cpuTempo = () => cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { total: a.total + t, ocioso: a.ocioso + c.times.idle }; }, { total: 0, ocioso: 0 });

test('A4: C9 sob carga: matar a árvore do motor a meio nunca deixa unidades mortas por arrasto com estado final; a cadeia acaba em 0 (4×)', { timeout: 500000 }, async (t) => {
  const burn = Array.from({ length: BURNERS }, () => { const p = spawn(process.execPath, ['-e', `const fim=Date.now()+${PRAZO_BURNER_MS};while(Date.now()<fim){}`], { stdio: 'ignore', windowsHide: true }); H.registaPid(p.pid); try { setPriority(p.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* já acabou */ } return p; });
  const falhas = [];
  let ultimo = Date.now(), parado = 0; // o maior intervalo entre dois ticks de 1 s do event loop deste teste
  const vigia = setInterval(() => { parado = Math.max(parado, Date.now() - ultimo - 1000); ultimo = Date.now(); }, 1000);
  try {
    const c0 = cpuTempo(); await H.espera(1000); const c1 = cpuTempo();
    console.log('A4 carga de CPU no início: ' + Math.round(100 * (1 - (c1.ocioso - c0.ocioso) / (c1.total - c0.total))) + ' % com ' + BURNERS + ' processos a arder');
    for (let k = 0; k < 4; k++) {
      const d = montar(`a4-${k}`, { paralelo: 2, orcamento_s: 10, suites: [{ nome: 'q', limite_s: 60 }] }, { 'q-1': 6, 'q-2': 6, 'q-3': 12, 'q-4': 12 });
      const env = H.tempPrivado();
      const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 90000 });
      const [m] = motores(d);
      if (r1.status !== 3 || !m || !H.vivo(m.pid)) { falhas.push(`#${k}: cenário inválido (1.ª chamada ${r1.status})`); continue; }
      await H.esperaAte(() => H.inicios(d).length === 4, 40000);
      const antes = Object.fromEntries(H.umResultado(d).dados.unidades.map((u) => [u.ficheiro, u.estado]));
      H.mataArvore(m.pid);
      assert.ok(await H.esperaAte(() => !H.vivo(m.pid), 10000), `#${k}: o motor ${m.pid} não morreu depois do mataArvore`);
      const cod = await cadeia(d, env, 5, 90000);
      const res = H.umResultado(d).dados;
      const arrasto = res.unidades.filter((u) => antes[u.ficheiro] === 'em_curso' && u.estado !== 'pass').map((u) => `${u.ficheiro}=${u.estado}`);
      if (cod.at(-1) !== 0 || arrasto.length) falhas.push(`#${k}: cadeia ${cod.join(',')}; em_curso antes da morte e agora ${arrasto.join(' ') || '-'}`);
    }
  } finally { clearInterval(vigia); for (const p of burn) p.kill(); }
  if (parado > PARADO_MAX_MS) return t.skip('corrida inválida: o event loop esteve parado ' + Math.round(parado / 1000) + ' s (> 30 s): a máquina, não o motor');
  assert.deepEqual(falhas, []);
});
