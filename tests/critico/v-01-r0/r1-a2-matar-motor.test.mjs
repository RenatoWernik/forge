// Ataque 2 do crítico R1 do V-01 (#125, REDESENHO C9 e item 3): matar o motor a meio de uma unidade longa.
// (a) Mata-se só o PID gravado em .forge/motor/*.json (a árvore dele) com a unidade longa a meio. Oráculo: a retoma por --continuar
//     acaba em 0; o ficheiro final tem cada unidade uma só vez (nem duplicada nem perdida); as que tinham estado final antes da morte não
//     voltam a correr (mesmo pid e inicio, 1 arranque); a longa e as em_curso voltam a correr uma só vez (2 arranques); o corredor antigo
//     da longa está morto.
// (b) «Se o motor morreu a meio, porque a máquina reiniciou, lança um motor novo»: depois de um reinício o PID gravado pode pertencer a
//     outro processo. Simula-se com um processo isca (lançado por este teste) cujo PID fica no ficheiro do motor morto. Oráculo: a cadeia
//     --continuar acaba em ≤ 4 chamadas e corre as unidades que faltam.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, montar, motores, cadeia } from './r1-comum.mjs';

after(H.limpa);

test('A2a: matar o motor a meio da unidade longa: a retoma não duplica nem perde unidades e só relança as sem estado final', { timeout: 300000 }, async () => {
  const env = H.tempPrivado();
  const un = { longa: 25, ...Object.fromEntries(Array.from({ length: 6 }, (_, j) => [`q-${j}`, 3])) };
  const d = montar('a2a', { paralelo: 2, orcamento_s: 8, suites: [{ nome: 'longa', limite_s: 120 }, { nome: 'q', limite_s: 60 }] }, un);
  const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 60000 });
  assert.equal(r1.status, 3, H.saida(r1));
  const [motor] = motores(d);
  assert.ok(motor && H.vivo(motor.pid), 'o motor não está vivo depois da 1.ª chamada');
  // a longa arranca primeiro (maior limite_s); espera-se que ela esteja a meio e que haja q já acabadas
  assert.ok(await H.esperaAte(() => H.eventos(d).filter((e) => e.evento === 'fim' && e.f.startsWith('s/q-')).length >= 2, 40000), 'não acabaram 2 q');
  const antes = Object.fromEntries(H.umResultado(d).dados.unidades.map((u) => [u.ficheiro, u]));
  assert.equal(antes['s/longa.fx.mjs']?.estado, 'em_curso', 'a longa não estava a meio');
  const corredorLonga = H.inicios(d, 's/longa.fx.mjs')[0].pid;
  H.mataArvore(motor.pid);
  assert.ok(await H.esperaAte(() => !H.vivo(motor.pid), 10000), 'o motor não morreu');
  const morto = Date.now();
  assert.ok(await H.esperaAte(() => !H.vivo(corredorLonga), 10000), `o corredor ${corredorLonga} da longa ficou vivo depois de matar a árvore do motor`);
  const cod = await cadeia(d, env, 10);
  assert.equal(cod.at(-1), 0, `a cadeia não acabou: ${cod.join(', ')}`);
  const res = H.umResultado(d).dados;
  assert.deepEqual(H.validaResultado(res, { raiz: d }), []);
  const fs = res.unidades.map((u) => u.ficheiro);
  assert.deepEqual([...fs].sort(), Object.keys(un).map((n) => `s/${n}.fx.mjs`).sort(), 'unidades duplicadas ou perdidas');
  for (const u of res.unidades) {
    assert.equal(u.estado, 'pass', u.ficheiro);
    const a = antes[u.ficheiro], n = H.inicios(d, u.ficheiro).length;
    if (a && a.estado === 'pass') {
      assert.deepEqual({ pid: u.pid, inicio: u.inicio, n }, { pid: a.pid, inicio: a.inicio, n: 1 }, `${u.ficheiro}: voltou a correr depois da morte`);
    } else if (a && a.estado === 'em_curso') {
      assert.ok(Date.parse(u.inicio) >= morto && u.pid !== a.pid && n === 2, `${u.ficheiro}: em_curso antes da morte; arranques ${n}, inicio ${u.inicio}`);
    } else {
      assert.equal(n, 1, `${u.ficheiro}: nunca tinha arrancado e correu ${n} vezes`);
    }
  }
});

test('A2b: depois de um reinício, o PID gravado do motor morto pertence a outro processo: a cadeia --continuar relança o resto em ≤ 4 chamadas', { timeout: 200000 }, async () => {
  const env = H.tempPrivado();
  const d = montar('a2b', { paralelo: 1, orcamento_s: 6, suites: [{ nome: 'q', limite_s: 60 }] }, Object.fromEntries(Array.from({ length: 4 }, (_, j) => [`q-${j}`, 4])));
  const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 60000 });
  assert.equal(r1.status, 3, H.saida(r1));
  const [motor] = motores(d);
  H.mataArvore(motor.pid);
  assert.ok(await H.esperaAte(() => !H.vivo(motor.pid), 10000), 'o motor não morreu');
  // o «reinício»: o mesmo número de PID passa a ser de outro processo (uma isca deste teste, morta no after pela árvore)
  const isca = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e3)'], { stdio: 'ignore', windowsHide: true });
  H.registaPid(isca.pid);
  const f = join(d, '.forge', 'motor', motor.nome);
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), pid: isca.pid }));
  const cod = await cadeia(d, env, 4, 60000);
  assert.equal(cod.at(-1), 0, `a cadeia não relançou o resto: ${cod.join(', ')} (o executor toma o PID ${isca.pid}, de outro processo, pelo motor)`);
  assert.equal(H.vivo(isca.pid), true, 'a isca (outro processo com o PID gravado) foi morta');
});
