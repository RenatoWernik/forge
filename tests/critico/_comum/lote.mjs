// V-03 (#127; spec #123 §4.4 e risco 1): lote sem execução repetida. Um teste «regressão» que voltava a correr outra suíte num filho `node --test`
// chama doLote(t, <alvo>, { corre, min }) e lê o resultado desse alvo no lote do executor.
//   <alvo>: o nome de uma suíte do manifesto (todos os ficheiros dela), `{ suite, ficheiros: ['<caminho ou glob do repo>', …] }` (só esses
//   ficheiros: o conjunto que o argv da base corria, expandido) ou uma lista de alvos. As contagens e o `min` somam-se SÓ sobre os ficheiros do
//   alvo, e um ficheiro do alvo sem unidade no resultado falha.
//   - fase 1 (FORGE_LOTE_FASE=1): salta com MOTIVO e devolve null; o executor volta a correr só estes testes na fase 2;
//   - fase 2 (FORGE_LOTE_RESULTADOS=<ficheiro>): lê o alvo no resultado da fase 1. Outro sha, outra árvore, resultado incompleto, alvo em
//     falta ou com falha, ou menos de `min` testes ok FALHAM o teste (lançam), nunca o saltam;
//   - corrida avulsa (sem env): reutiliza um resultado completo de .forge/resultados/ com o mesmo sha e a mesma árvore, e sem ele corre `corre()`,
//     o código que o teste tinha antes. Um resultado com falha nunca é reutilizado: corre o filho como sempre.
// Devolve { status, pass, fail, skip, out, stdout, stderr }: a forma dos runTests e o par stdout/stderr dos spawnSync que os testes tinham.
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arvoreDe } from '../../../scripts/executor.mjs';

export const MOTIVO = 'lote: satisfeito na fase 2';
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const FINAIS = ['pass', 'fail', 'limite', 'erro'];
const ESPERA_MS = +(process.env.FORGE_LOTE_ESPERA_MS ?? 45000); // quanto o doLote da fase 2 espera por uma fase 2 de outro ficheiro (a unidade da fase 2 tem 90 s)
const lerJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
const expande = (g) => globSync(g, { cwd: RAIZ }).map((f) => f.replaceAll('\\', '/'));

// os ficheiros que o manifesto atribui à suíte `nome`
function ficheirosDe(nome) {
  const s = lerJson(join(RAIZ, 'scripts', 'suites.json')).suites.find((x) => x.nome === nome);
  return s ? [...new Set(s.ficheiros.flatMap(expande))] : null;
}

// as linhas `not ok` dos TAP das unidades, para a mensagem de uma falha
function falhasDe(unidades) {
  const linhas = [];
  for (const u of unidades) {
    for (const rel of [u.tap, u.tap_fase2]) {
      if (!rel || !existsSync(join(RAIZ, rel))) continue;
      for (const l of readFileSync(join(RAIZ, rel), 'utf8').split(/\r?\n/)) if (/^\s*not ok /.test(l)) linhas.push(`${u.ficheiro}: ${l.trim()}`);
    }
  }
  return linhas.join('\n');
}

// { erro } com o motivo, ou { r } com o resultado agregado do alvo
function avalia(dados, alvos, min) {
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' });
  const sha = rev.status === 0 ? rev.stdout.trim() : null;
  if (dados?.versao !== 1 || !Array.isArray(dados.unidades)) return { erro: 'resultado ilegível (versao 1 com unidades[] esperada)' };
  if (dados.sha !== sha) return { erro: `o resultado é de outro sha (${dados.sha} ≠ ${sha})` };
  const arvore = arvoreDe(RAIZ);
  if (dados.arvore !== arvore) return { erro: `o resultado é de outra árvore (${dados.arvore} ≠ ${arvore})` };
  if (dados.completo !== true && dados.fase1_completa !== true) return { erro: 'o resultado não está completo' };
  let pass = 0, fail = 0, skip = 0;
  const unidades = [];
  for (const a of alvos) {
    const nome = typeof a === 'string' ? a : a.suite;
    const daSuite = ficheirosDe(nome);
    if (!daSuite?.length) return { erro: `a suíte-alvo ${nome} não existe no manifesto ou não tem ficheiros` };
    const esperados = typeof a === 'string' || !a.ficheiros ? daSuite : [...new Set(a.ficheiros.flatMap((g) => { const fs = expande(g); return fs.length ? fs : [g]; }))];
    const fora = esperados.filter((f) => !daSuite.includes(f));
    if (fora.length) return { erro: `os ficheiros ${fora.join(', ')} não são da suíte-alvo ${nome}` };
    const us = dados.unidades.filter((u) => u.suite === nome && esperados.includes(u.ficheiro));
    const faltam = esperados.filter((f) => !us.some((u) => u.ficheiro === f));
    if (faltam.length) return { erro: `a suíte-alvo ${nome} está em falta ou incompleta no resultado (faltam ${faltam.join(', ')})` };
    const abertas = us.filter((u) => !FINAIS.includes(u.estado));
    if (abertas.length) return { erro: `a suíte-alvo ${nome} está incompleta no resultado (${abertas.map((u) => `${u.ficheiro}: ${u.estado}`).join(', ')})` };
    for (const u of us) { pass += u.pass; fail += u.fail; skip += u.skip; unidades.push(u); }
  }
  const mas = unidades.filter((u) => u.estado !== 'pass' || u.fail > 0);
  const out = `TAP version 13\n# tests ${pass + fail}\n# pass ${pass}\n# fail ${mas.length ? Math.max(fail, 1) : fail}\n# skipped ${skip}\n`
    + (mas.length ? `${mas.map((u) => `not ok - ${u.ficheiro}: ${u.estado}, fail ${u.fail}`).join('\n')}\n${falhasDe(mas)}\n` : '');
  if (mas.length) return { erro: `o alvo falhou no lote:\n${out}` };
  // o N conta o estado final: ok na fase 1, ou skip do lote com a fase 2 ok (a unidade já fundiu a fase 2, e então o seu `pass` a inclui). Um skip
  // do lote cuja fase 2 ainda não chegou ao resultado não conta; `pendente` deixa o doLote esperar por ela.
  if (pass < min) return { erro: `o alvo tem ${pass} testes ok, menos do que os ${min} exigidos`, pendente: unidades.some((u) => !u.tap_fase2 && u.skips?.some((s) => s.motivo === MOTIVO)) };
  // ms: a soma das durações das unidades, que nunca fica abaixo do relógio de um filho com 2 workers (o f-06 mede o f-02 com ela)
  return { r: { status: 0, signal: null, pass, fail, skip, ms: Math.round(unidades.reduce((s, u) => s + u.duracao_s, 0) * 1000), out, stdout: out, stderr: '' } };
}

// o resultado de .forge/resultados/ do mesmo sha e da mesma árvore que cobre o alvo, ou null
function reaproveita(alvos, min) {
  const pasta = join(RAIZ, '.forge', 'resultados');
  if (!existsSync(pasta)) return null;
  for (const n of readdirSync(pasta).filter((x) => /-p\d+\.json$/.test(x))) {
    try { const a = avalia(lerJson(join(pasta, n)), alvos, min); if (a.r) return a.r; } catch { /* ilegível: não serve */ }
  }
  return null;
}

// `min`: o mínimo de testes ok do alvo, para os testes cujo assert de `pass ≥ N` vive num helper que `corre` chama (f-05 a/b/c)
export function doLote(t, alvo, { corre, min = 0 } = {}) {
  if (process.env.FORGE_LOTE_FASE === '1') { t.skip(MOTIVO); return null; }
  const alvos = [alvo].flat();
  const ficheiro = process.env.FORGE_LOTE_RESULTADOS;
  if (ficheiro !== undefined) {
    // a fase 2 de outros ficheiros corre ao mesmo tempo e completa o resultado: se só falta uma fase 2 que o N precisa, espera por ela
    for (const fim = Date.now() + ESPERA_MS; ;) {
      let dados = null;
      try { dados = lerJson(ficheiro); } catch (e) { if (Date.now() > fim) throw new Error(`lote: o resultado ${ficheiro} não se lê (${e.code ?? e.message})`); }
      const a = dados ? avalia(dados, alvos, min) : { pendente: true };
      if (a.r) return a.r;
      if (!a.pendente || Date.now() > fim) throw new Error(`lote: ${a.erro}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  const r = reaproveita(alvos, min);
  if (r) return r;
  if (!corre) throw new Error('lote: sem resultados do lote e sem corre() para correr o filho');
  return corre();
}
