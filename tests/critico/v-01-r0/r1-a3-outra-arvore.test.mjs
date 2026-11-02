// Ataque 3 do crítico R1 do V-01 (#125, C3 e spec §4.2 «um resultado só serve como prova para o mesmo sha e a mesma árvore»): um resultado
// de outra árvore nunca é reutilizado pelo --continuar. Cada unidade regista o sha256 do seu próprio ficheiro, ou seja, o conteúdo que correu.
// (a) motor morto a meio numa árvore limpa, depois um ficheiro seguido muda: o --continuar corre TODAS as unidades na árvore nova e o ficheiro
//     da árvore limpa fica byte a byte.
// (b) a árvore muda com o motor VIVO (o agente edita enquanto a chamada devolveu 3) e volta ao estado limpo depois de o motor acabar:
//     o --continuar na árvore limpa não pode dar 0 com unidades que correram sobre outro conteúdo. Oráculo: toda a unidade de um resultado
//     com arvore «limpa» correu com o conteúdo do HEAD (o h registado = sha256 do ficheiro no HEAD).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { H, montar, motores, cadeia } from './r1-comum.mjs';

after(H.limpa);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

test('A3a: motor morto numa árvore limpa e ficheiro alterado: o --continuar corre tudo de novo noutro ficheiro e não toca no da árvore limpa', { timeout: 200000 }, async () => {
  const env = H.tempPrivado();
  const d = montar('a3a', { paralelo: 1, orcamento_s: 5, suites: [{ nome: 'q', limite_s: 60 }] }, Object.fromEntries(Array.from({ length: 4 }, (_, j) => [`q-${j}`, 3])));
  const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 60000 });
  assert.equal(r1.status, 3, H.saida(r1));
  const [motor] = motores(d);
  assert.ok(await H.esperaAte(() => H.umResultado(d).dados.unidades.some((u) => u.estado === 'pass'), 20000));
  H.mataArvore(motor.pid);
  assert.ok(await H.esperaAte(() => !H.vivo(motor.pid), 10000));
  const [limpo] = H.resultados(d);
  const bytes = readFileSync(join(H.pastaResultados(d), limpo.nome), 'utf8');
  const feitasLimpa = limpo.dados.unidades.filter((u) => u.estado === 'pass').map((u) => u.ficheiro);
  appendFileSync(join(d, 's/q-3.fx.mjs'), '// sujo\n');
  const cod = await cadeia(d, env, 8, 60000);
  assert.equal(cod.at(-1), 0, cod.join(', '));
  const sujo = H.resultados(d).find((x) => x.nome !== limpo.nome);
  assert.ok(sujo && /^suja:/.test(sujo.dados.arvore), 'sem ficheiro novo da árvore suja');
  for (const f of feitasLimpa) assert.equal(H.inicios(d, f).length, 2, `${f}: o resultado da árvore limpa foi reutilizado na suja`);
  assert.equal(readFileSync(join(H.pastaResultados(d), limpo.nome), 'utf8'), bytes, 'o ficheiro da árvore limpa foi reescrito');
});

test('A3b: a árvore muda com o motor vivo e volta a limpa: nenhuma unidade de um resultado «limpa» correu sobre outro conteúdo', { timeout: 200000 }, async () => {
  const env = H.tempPrivado();
  const d = montar('a3b', { paralelo: 1, orcamento_s: 4, suites: [{ nome: 'q', limite_s: 60 }] }, Object.fromEntries(Array.from({ length: 4 }, (_, j) => [`q-${j}`, 3])));
  const head = Object.fromEntries([0, 1, 2, 3].map((j) => [`s/q-${j}.fx.mjs`, sha256(readFileSync(join(d, `s/q-${j}.fx.mjs`)))]));
  const r1 = await H.correr(d, ['--todas'], { env, limite_ms: 60000 });
  assert.equal(r1.status, 3, H.saida(r1));
  const [motor] = motores(d);
  // o agente edita duas unidades enquanto o motor corre (a chamada já lhe devolveu 3)
  const original = {};
  for (const f of ['s/q-2.fx.mjs', 's/q-3.fx.mjs']) { original[f] = readFileSync(join(d, f)); appendFileSync(join(d, f), '// edição do agente\n'); }
  assert.ok(await H.esperaAte(() => !H.vivo(motor.pid), 60000), 'o motor não acabou');
  for (const [f, b] of Object.entries(original)) writeFileSync(join(d, f), b); // de volta ao HEAD: árvore limpa outra vez
  assert.equal(H.gitOk(d, 'status', '--porcelain').trim(), '', 'a árvore não voltou a limpa');
  const r2 = await H.correr(d, ['--todas', '--continuar'], { env, limite_ms: 60000 });
  motores(d);
  const res = H.umResultado(d).dados;
  assert.equal(res.arvore, 'limpa');
  const ultimo = (f) => H.eventos(d).filter((e) => e.evento === 'inicio' && e.f === f).at(-1);
  const alheias = res.unidades.filter((u) => u.estado === 'pass' && ultimo(u.ficheiro)?.h !== head[u.ficheiro]).map((u) => u.ficheiro);
  assert.deepEqual(alheias, [], `--continuar saiu ${r2.status} com unidades que correram sobre outro conteúdo, rotuladas sha ${res.sha.slice(0, 7)} limpa`);
});
