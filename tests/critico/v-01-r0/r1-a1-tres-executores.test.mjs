// Ataque 1 do crítico R1 do V-01 (#125): 3 executores em simultâneo com vagas apertadas (vagas_globais 3, carga_sensivel 2), um deles com uma
// suíte sensível ao tempo e os outros dois com filas de unidades curtas que tomam e largam vagas em ciclo. Oráculos (C4 e classe EPERM):
// - nenhum erro fatal (os 3 saem com 0, sem EPERM/EBUSY/EACCES/Error na saída nem no log do motor);
// - pelos intervalos registados pelas fixtures, nunca há mais de 3 unidades abertas na máquina;
// - durante cada unidade sensível nunca há mais de 2 abertas (sobreposição real) e o concorrentes_max dela é ≤ 2 (o campo do resultado).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, montar, motores } from './r1-comum.mjs';

after(H.limpa);
const logs = (d) => { const p = join(d, '.forge', 'motor'); return existsSync(p) ? readdirSync(p).filter((n) => n.endsWith('.log')).map((n) => readFileSync(join(p, n), 'utf8')).join('\n') : ''; };

test('A1: 3 executores, vagas_globais 3: sem erro fatal, nunca > 3 abertas, e a sensível nunca com concorrentes_max ou sobreposição > carga_sensivel 2', { timeout: 300000 }, async () => {
  const env = H.tempPrivado();
  const base = { paralelo: 3, vagas_globais: 3, carga_sensivel: 2, orcamento_s: 200 };
  const a = montar('a1-sens', { ...base, suites: [{ nome: 'fina', limite_s: 60, sensivel_ao_tempo: true }, { nome: 'normal', limite_s: 60 }] },
    { 'fina-1': 6, 'fina-2': 6, 'normal-1': 1, 'normal-2': 1 });
  const filas = [1, 2].map((k) => montar(`a1-fila${k}`, { ...base, suites: [{ nome: 'q', limite_s: 60 }] },
    Object.fromEntries(Array.from({ length: 24 }, (_, j) => [`q-${j}`, 0.4]))));
  const repos = [a, ...filas];
  const rs = await Promise.all(repos.map((d) => H.correr(d, ['--todas'], { env, limite_ms: 240000 })));
  repos.forEach(motores);
  const erros = [];
  rs.forEach((r, i) => {
    if (r.status !== 0) erros.push(`executor ${i}: ${H.saida(r)}`);
    if (/EPERM|EBUSY|EACCES/.test(r.out)) erros.push(`executor ${i}: erro de concorrência na saída`);
  });
  repos.forEach((d, i) => { if (/EPERM|EBUSY|EACCES|Error/.test(logs(d))) erros.push(`motor ${i}: ${logs(d).slice(-800)}`); });
  assert.deepEqual(erros, []);
  const ints = repos.flatMap((d, i) => H.intervalos(H.eventos(d), String(i)));
  assert.equal(ints.length, 4 + 48, 'faltam intervalos registados');
  const max = H.sobreposicaoMax(ints);
  assert.ok(max <= 3, `${max} unidades ao mesmo tempo com vagas_globais 3`);
  const res = H.umResultado(a).dados;
  const falhas = [];
  for (const u of res.unidades.filter((x) => x.suite === 'fina')) {
    const i = ints.find((x) => x.tag === '0' && x.f === u.ficheiro);
    const durante = H.sobreposicaoMax(ints, i.ini, i.fim);
    if (durante > 2) falhas.push(`${u.ficheiro}: ${durante} unidades abertas ao mesmo tempo durante ela (sobreposição real)`);
    if (u.concorrentes_max > 2) falhas.push(`${u.ficheiro}: concorrentes_max ${u.concorrentes_max} > carga_sensivel 2 (sobreposição real ${durante})`);
  }
  assert.deepEqual(falhas, []);
});
