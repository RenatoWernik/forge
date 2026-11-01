#!/usr/bin/env node
// Inventário de testes antes/depois (V-03, #127; spec #123 risco 1): compara dois resultados do executor a partir dos TAP deles e prova que a
// conversão para doLote não apagou nem enfraqueceu nada. Só biblioteca padrão.
//   node scripts/inventario.mjs --antes <resultado.json> --depois <resultado.json> [--logs-antes <dir>] [--logs-depois <dir>] [--lista]
// Três propriedades, sobre `suite › ficheiro › nome completo` (os nomes dos grupos e do teste, unidos por « > »):
//   1. todo o nome de «antes» existe em «depois»: nenhum teste apagado;
//   2. todo o teste que estava ok em «antes» tem ≥ 1 execução ok em «depois» (fase 1 ou fase 2);
//   3. nenhum skip novo em «depois»; o `lote: satisfeito na fase 2` só vale se a fase 2 o resolveu com uma execução ok.
// Sai com 0 quando as três valem, 1 quando alguma falha (nomeia cada teste em causa) e 2 num erro de uso ou com TAP em falta.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOTIVO_LOTE = 'lote: satisfeito na fase 2';
class Uso extends Error {}

// os testes de um TAP: [{ nome (completo), estado: pass|fail|skip|todo, motivo }]. Um grupo abre com `# Subtest: x` ao nível da indentação
// (4 espaços por nível) e fecha com o seu `ok N - x`, depois dos filhos.
export function testesDoTap(texto) {
  const pilha = [], testes = [];
  const limpa = (s) => s.replace(/\\#/g, '#');
  for (const l of texto.split(/\r?\n/)) {
    const h = /^( *)# Subtest: (.*)$/.exec(l);
    if (h) { pilha[h[1].length >> 2] = limpa(h[2]); pilha.length = (h[1].length >> 2) + 1; continue; }
    const ok = /^( *)(not )?ok \d+ - (.*?)(?: # (SKIP|TODO)\b ?(.*))?$/.exec(l);
    if (!ok || ok[1].length % 4) continue;
    const nivel = ok[1].length >> 2, nome = limpa(ok[3]);
    testes.push({ nome: [...pilha.slice(0, nivel), nome].join(' > '), estado: ok[4] === 'SKIP' ? 'skip' : ok[4] === 'TODO' ? 'todo' : ok[2] ? 'fail' : 'pass', motivo: ok[5] ?? '' });
    pilha.length = nivel;
  }
  return testes;
}

// o inventário de um resultado: Map «suite › ficheiro › nome» → execuções [{ estado, motivo }]
function inventarioDe(json, logs) {
  const dados = JSON.parse(readFileSync(json, 'utf8').replace(/^﻿/, ''));
  if (dados.versao !== 1 || !Array.isArray(dados.unidades)) throw new Uso(`${json}: resultado do executor (versao 1) esperado`);
  const bases = [logs, resolve(dirname(json), '..', '..'), process.cwd(), dirname(json), join(dirname(json), 'logs')].filter(Boolean);
  const achaTap = (rel) => bases.map((b) => [join(b, rel), join(b, basename(rel))]).flat().find((f) => existsSync(f));
  const inv = new Map();
  for (const u of dados.unidades) {
    for (const rel of [u.tap, u.tap_fase2].filter(Boolean)) {
      const f = achaTap(rel);
      if (!f) throw new Uso(`${json}: falta o TAP ${rel} da unidade ${u.ficheiro} (use --logs-antes ou --logs-depois)`);
      for (const t of testesDoTap(readFileSync(f, 'utf8'))) {
        const k = `${u.suite} › ${u.ficheiro} › ${t.nome}`;
        if (!inv.has(k)) inv.set(k, []);
        inv.get(k).push({ estado: t.estado, motivo: t.motivo });
      }
    }
  }
  return inv;
}

// o motivo de um skip pode trazer o sha da base («o F-21a já está na base 8ad82bc»): dois runs de shas diferentes dizem o mesmo skip
const sem_sha = (m) => m.replace(/\b[0-9a-f]{7,40}\b/g, '<sha>');

export function compara(antes, depois) {
  const apagados = [], semOk = [], skipsNovos = [];
  for (const [k, ea] of antes) {
    const ed = depois.get(k);
    if (!ed) { apagados.push(k); continue; }
    const ok = ed.some((e) => e.estado === 'pass');
    if (ea.some((e) => e.estado === 'pass') && !ok) semOk.push(k);
    for (const e of ed.filter((x) => x.estado === 'skip')) {
      const novo = e.motivo === MOTIVO_LOTE ? !ok : !ea.some((x) => x.estado === 'skip' && sem_sha(x.motivo) === sem_sha(e.motivo));
      if (novo) skipsNovos.push(`${k} (skip: ${e.motivo || 'sem motivo'})`);
    }
  }
  return { apagados, semOk, skipsNovos };
}

function lerArgs(argv) {
  const o = {};
  const valor = (i, n) => { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Uso(`${n} precisa de um valor`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--antes') o.antes = resolve(valor(i++, a));
    else if (a === '--depois') o.depois = resolve(valor(i++, a));
    else if (a === '--logs-antes') o.logsAntes = resolve(valor(i++, a));
    else if (a === '--logs-depois') o.logsDepois = resolve(valor(i++, a));
    else if (a === '--lista') o.lista = true;
    else throw new Uso(`argumento desconhecido: ${a}`);
  }
  if (!o.antes || !o.depois) throw new Uso('uso: node scripts/inventario.mjs --antes <resultado.json> --depois <resultado.json>');
  for (const f of [o.antes, o.depois]) if (!existsSync(f)) throw new Uso(`não existe: ${f}`);
  return o;
}

export function inventario(argv, saida = (l) => console.log(l)) {
  const o = lerArgs(argv);
  const antes = inventarioDe(o.antes, o.logsAntes), depois = inventarioDe(o.depois, o.logsDepois);
  if (o.lista) for (const [k, es] of depois) for (const e of es) saida(`${k.replaceAll(' › ', '\t')}\t${e.estado}`);
  const { apagados, semOk, skipsNovos } = compara(antes, depois);
  for (const [rotulo, lista] of [['APAGADO (existia em antes e não existe em depois)', apagados], ['SEM EXECUÇÃO OK (estava ok em antes)', semOk], ['SKIP NOVO', skipsNovos]]) {
    for (const k of lista) saida(`${rotulo}: ${k}`);
  }
  const mau = apagados.length + semOk.length + skipsNovos.length;
  saida(`inventário: ${antes.size} nomes em antes, ${depois.size} em depois; ${apagados.length} apagados, ${semOk.length} sem execução ok, ${skipsNovos.length} skips novos → ${mau ? 'FALHA' : 'OK'}`);
  return mau ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { process.exit(inventario(process.argv.slice(2))); } catch (e) {
    console.error(e instanceof Uso ? `inventario: ${e.message}` : e);
    process.exit(e instanceof Uso ? 2 : 1);
  }
}
