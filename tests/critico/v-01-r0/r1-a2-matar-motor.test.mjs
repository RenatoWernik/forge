// Ataque 2 do crítico R1 do V-01 (#125, REDESENHO C9 e item 3): matar o motor a meio de uma unidade longa.
// (a) Mata-se só o PID gravado em .forge/motor/*.json (a árvore dele) com a unidade longa a meio. Oráculo: a retoma por --continuar
//     acaba em 0; o ficheiro final tem cada unidade uma só vez (nem duplicada nem perdida); as que tinham estado final antes da morte não
//     voltam a correr (mesmo pid e inicio, 1 arranque); a longa e as sem estado final (em_curso, fail de arrasto) voltam a correr uma só vez
//     (arranques = inícios registados antes da morte + 1; ver confereRetoma); o corredor antigo da longa está morto.
// (a2c) o mesmo oráculo para um `fail` de arrasto gravado antes da morte (#174).
// (b) «Se o motor morreu a meio, porque a máquina reiniciou, lança um motor novo»: depois de um reinício o PID gravado pode pertencer a
//     outro processo. Simula-se com um processo isca (lançado por este teste) cujo PID fica no ficheiro do motor morto. Oráculo: a cadeia
//     --continuar acaba em ≤ 4 chamadas e corre as unidades que faltam.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, montar, motores, cadeia } from './r1-comum.mjs';

after(H.limpa);

// O que o teste viu ANTES da retoma, com o motor já morto e todos os corredores que registaram `inicio` sem `fim` também mortos (F-32, #172):
// o resultado por ficheiro e os inícios/fins registados por ficheiro. Depois disto nada escreve, por isso é um instantâneo coerente.
async function instantaneo(d) {
  const vivos = () => { const ev = H.eventos(d); return H.inicios(d).filter((e) => !ev.some((x) => x.evento === 'fim' && x.f === e.f && x.pid === e.pid) && H.vivo(e.pid)); };
  assert.ok(await H.esperaAte(() => !vivos().length, 10000), `corredores vivos depois da morte do motor: ${vivos().map((e) => `${e.f}:${e.pid}`).join(', ')}`);
  const ev = H.eventos(d), conta = (evento) => ev.filter((e) => e.evento === evento).reduce((m, e) => m.set(e.f, (m.get(e.f) ?? 0) + 1), new Map());
  return { resultado: Object.fromEntries(H.umResultado(d).dados.unidades.map((u) => [u.ficheiro, u])), inicios: conta('inicio'), fins: conta('fim') };
}

// O oráculo da retoma, por unidade (REDESENHO do F-33, #174, #175):
//  - com estado final `pass` antes da morte: não volta a correr (mesmo pid e inicio, 1 arranque);
//  - sem estado final antes (em_curso, com ou sem `fim` já registado; fail/limite de arrasto da morte; ou sem linha): a retoma relança-a
//    exatamente uma vez, depois da morte e noutro processo. O arranque conta-se pelos `inicio` que a unidade registou, e um node morto antes
//    de registar o seu não deixa nenhum: arranques = inícios registados antes da morte + 1 (não «2» fixo: falso vermelho sob carga).
function confereRetoma(d, un, antes, morto) {
  const res = H.umResultado(d).dados;
  assert.deepEqual(H.validaResultado(res, { raiz: d }), []);
  assert.deepEqual(res.unidades.map((u) => u.ficheiro).sort(), Object.keys(un).map((n) => `s/${n}.fx.mjs`).sort(), 'unidades duplicadas ou perdidas');
  for (const u of res.unidades) {
    assert.equal(u.estado, 'pass', u.ficheiro);
    const a = antes.resultado[u.ficheiro], n = H.inicios(d, u.ficheiro).length, ini = antes.inicios.get(u.ficheiro) ?? 0, fim = antes.fins.get(u.ficheiro) ?? 0;
    if (a?.estado === 'pass') {
      assert.deepEqual({ pid: u.pid, inicio: u.inicio, n }, { pid: a.pid, inicio: a.inicio, n: 1 }, `${u.ficheiro}: voltou a correr depois da morte`);
    } else {
      assert.ok(Date.parse(u.inicio) >= morto && u.pid !== a?.pid, `${u.ficheiro}: sem estado final antes da morte (${a?.estado ?? 'sem linha'}) e não foi relançada: inicio ${u.inicio}`);
      assert.equal(n, ini + 1, `${u.ficheiro}: ${a?.estado ?? 'sem linha'} antes da morte (inícios ${ini}, fins ${fim}); arranques ${n}, esperava ${ini + 1}`);
    }
  }
}

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
  assert.equal(H.umResultado(d).dados.unidades.find((u) => u.ficheiro === 's/longa.fx.mjs')?.estado, 'em_curso', 'a longa não estava a meio');
  const corredorLonga = H.inicios(d, 's/longa.fx.mjs')[0].pid;
  H.mataArvore(motor.pid);
  assert.ok(await H.esperaAte(() => !H.vivo(motor.pid), 10000), 'o motor não morreu');
  const morto = Date.now();
  assert.ok(await H.esperaAte(() => !H.vivo(corredorLonga), 10000), `o corredor ${corredorLonga} da longa ficou vivo depois de matar a árvore do motor`);
  const antes = await instantaneo(d);
  const cod = await cadeia(d, env, 10);
  assert.equal(cod.at(-1), 0, `a cadeia não acabou: ${cod.join(', ')}`);
  confereRetoma(d, un, antes, morto);
});

// A2c (#174): uma unidade que o motor gravou como `fail` por arrasto da morte (o corredor morreu primeiro, o motor ainda escreveu o fail e
// morreu logo a seguir) não é um resultado: a retoma relança-a, como a uma em_curso.
test('A2c: um fail de arrasto gravado antes da morte do motor não é final: a retoma relança essa unidade uma só vez', { timeout: 300000 }, async () => {
  const env = H.tempPrivado();
  const un = { longa: 25, ...Object.fromEntries(Array.from({ length: 6 }, (_, j) => [`q-${j}`, 3])) };
  const d = montar('a2c', { paralelo: 2, orcamento_s: 8, suites: [{ nome: 'longa', limite_s: 120 }, { nome: 'q', limite_s: 60 }] }, un);
  const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 60000 });
  assert.equal(r1.status, 3, H.saida(r1));
  // shortcut: o PID do motor lê-se do ficheiro dele sem o registar (motores() registaria): o mataArvore de um PID registado lê a identidade pelo
  // powershell, que leva segundos sob carga, e o fail deixava de ser arrasto (mais de 5 s antes do último batimento). O motor acabou de ser visto
  // vivo; o limpa() do after também apanha os motores sem `fim` pelo ficheiro.
  const pastaMotor = join(d, '.forge', 'motor'), nomeMotor = readdirSync(pastaMotor).find((n) => n.endsWith('.json'));
  const motor = H.lerJson(join(pastaMotor, nomeMotor));
  assert.ok(motor && H.vivo(motor.pid), 'o motor não está vivo depois da 1.ª chamada');
  assert.ok(await H.esperaAte(() => H.eventos(d).some((e) => e.evento === 'fim' && e.f.startsWith('s/q-')), 40000), 'não acabou nenhuma q');
  H.mataArvore(H.inicios(d, 's/longa.fx.mjs')[0].pid); // o corredor da longa morre: o motor grava-a como fail
  assert.ok(await H.esperaAte(() => H.umResultado(d).dados.unidades.find((u) => u.ficheiro === 's/longa.fx.mjs')?.estado === 'fail', 15000, 10), 'o motor não gravou o fail da longa');
  H.mataArvore(motor.pid);
  assert.ok(await H.esperaAte(() => !H.vivo(motor.pid), 10000), 'o motor não morreu');
  const morto = Date.now();
  const antes = await instantaneo(d);
  assert.equal(antes.resultado['s/longa.fx.mjs']?.estado, 'fail', 'o cenário não se formou: a longa não ficou com o fail de arrasto no instantâneo');
  const cod = await cadeia(d, env, 10);
  assert.equal(cod.at(-1), 0, `a cadeia não acabou: ${cod.join(', ')}`);
  confereRetoma(d, un, antes, morto);
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
