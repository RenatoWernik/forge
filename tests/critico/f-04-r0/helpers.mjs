// Ronda −1 do F-04 (#5): utilitários partilhados pelos ataques. Só biblioteca padrão.
// Nunca toca na config real nem deixa lixo: no import cria UMA pasta temporária; HOME, USERPROFILE e CLAUDE_CONFIG_DIR apontam
// para <pasta>/home e TMP, TEMP e TMPDIR para <pasta>/tmp (também nos processos filhos). Tudo o que os ataques criam fica dentro
// dela, e ela é apagada no after() e, de reserva, no exit. Nenhum ataque invoca um modelo.
//
// Leitura do contrato que estes ataques assumem (cada ponto em aberto é uma PERGUNTA na #5):
//   - a skill é skills/new-project/SKILL.md; os passos são os títulos `## N. <título>` fora dos blocos de código;
//   - PERGUNTA 1: a nota `notes/n0001` sai de forma determinística do pacote, e o dev escreve na Ronda 0 a ponte
//     tests/ponte/f-04.mjs (ver PONTE abaixo) para os ataques não fixarem nomes nem formatos;
//   - PERGUNTA 2/3/4: os oráculos literais em aberto (frase de proibição, instrução da certeza, títulos dos passos) estão
//     escritos como padrões bilingues (inglês ou português) e assinalados em cada ataque.
import { after } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASE = 'e083b6a'; // a main com F-01, F-02, F-03 e F-10, ponto de partida do ticket
export const SKILL = join(ROOT, 'skills/new-project/SKILL.md');

const WORK = mkdtempSync(join(tmpdir(), 'critico-f04-'));
const HOME = join(WORK, 'home'), TMP = join(WORK, 'tmp');
mkdirSync(HOME); mkdirSync(TMP);
for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']) process.env[k] = HOME;
for (const k of ['TMP', 'TEMP', 'TMPDIR']) process.env[k] = TMP;
const cleanup = () => { try { rmSync(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* o exit volta a tentar */ } };
after(cleanup);
process.on('exit', cleanup);

let n = 0;
export const tmp = (prefix = 'd') => { const d = join(WORK, `${prefix}${++n}`); mkdirSync(d); return d; };

// Sem NODE_TEST_CONTEXT: herdado, um `node --test` filho fala o protocolo interno do runner e sai com 0 mesmo a falhar
export const sandboxEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
export const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
export const runTests = (globs, timeout = 480000) => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', env: sandboxEnv(), timeout });
  const out = (r.stdout || '') + (r.stderr || '');
  return { status: r.status, out, pass: +(out.match(/^# pass (\d+)/m) || [])[1], fail: +(out.match(/^# fail (\d+)/m) || [])[1] };
};
export const failures = (out) => out.split(/\r?\n/).filter((l) => /^\s*not ok/.test(l)).join('\n') + '\n' + out.slice(-2500);

export const ROLES = ['developer', 'developerUi', 'critic', 'tester', 'aux'];
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
export const loadScaffold = () => import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);

// ---------- texto da skill ----------
export const skillText = () => readFileSync(SKILL, 'utf8').replace(/\r\n/g, '\n');
// O texto sem os blocos de código cercados (``` ... ```): um título dentro de um bloco não é um passo
export const prose = (t) => t.replace(/^\s*```[\s\S]*?^\s*```\s*$/gm, '');
// Os passos numerados: [{ n, title, body }] na ordem do ficheiro; body vai até ao próximo `## ` (os `###` ficam dentro)
export const steps = (t = skillText()) => {
  const p = prose(t);
  const heads = [...p.matchAll(/^## (\d+)\.\s+(.+?)\s*$/gm)];
  const all = [...p.matchAll(/^## (?!#)/gm)].map((m) => m.index);
  return heads.map((m) => {
    const next = all.find((i) => i > m.index) ?? p.length;
    return { n: +m[1], title: m[2], body: p.slice(m.index, next) };
  });
};
// As frases de um texto: divide no fim de frase e nas quebras de parágrafo ou de item de lista
export const sentences = (t) => t.split(/(?<=[.!?;])\s+(?=[A-Z«"`*(])|\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// As tabelas Markdown do texto, como listas de linhas de células (sem a linha separadora)
export const tables = (t) => {
  const out = [];
  let cur = null;
  for (const l of prose(t).split('\n')) {
    if (/^\s*\|/.test(l)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
      (cur ??= []).push(l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
};
export const cell = (c) => c.replace(/`/g, '').replace(/\*\*/g, '').trim();

// Os 7 passos do critério 3, pela ordem, com o padrão (inglês ou português) que identifica cada título. PERGUNTA 4.
export const ORDER = [
  ['verificar a máquina', /machine|máquina/i],
  ['entrevista', /interview|entrevista/i],
  ['perguntas de setup', /setup/i],
  ['hooks', /hooks?\b/i],
  ['geração', /generat|geraç|gerar/i],
  ['painel', /panel|painel/i],
  ['bootstrap', /bootstrap/i],
];
export const interview = (t = skillText()) => steps(t).find((s) => ORDER[1][1].test(s.title));

// ---------- respostas ----------
export const loadCorpus = (kind = 'answers') => {
  const dir = join(ROOT, 'scripts/corpus', kind);
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => extname(f) === '.json').sort() : [];
  return names.map((f) => ({ name: basename(f, '.json'), value: readJson(join(dir, f)) }));
};

// Gerador com seed fixa (mulberry32): razões distintas por papel e por projeto, com acentos, aspas, apóstrofos, <, &, %, dígitos
export const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const WORDS = ['lógica', 'servidor', 'UI rica', 'ecrã', 'cobrança', 'segredos', 'quota "curta"', "o crítico's", '<b>', 'R&D', '95 %', 'prazo: 3 semanas', 'dados (RGPD)', 'Haiku xhigh', 'Opus high', 'medido na Guilda', 'çãõ', 'naïve', '1/2', 'sem pressa'];
export const generated = (seed = 404, count = 12) => {
  const r = rng(seed);
  const pick = () => WORDS[Math.floor(r() * WORDS.length)];
  const base = loadCorpus()[0].value;
  return Array.from({ length: count }, (_, i) => {
    const models = structuredClone(base.models);
    ROLES.forEach((role, k) => { models[role].reason = `papel ${k} #${i}: ${pick()}, ${pick()} e ${pick()}`; }); // sem o nome do papel
    return { name: `gerado-${seed}-${i}`, value: { ...structuredClone(base), mode: i % 2 ? 'accelerated' : 'rigorous', models } };
  });
};

// Gera o projeto numa pasta temporária com o scaffold do pacote
export const generate = async (answers) => {
  const { scaffold } = await loadScaffold();
  const dest = tmp('proj');
  await scaffold(answers, { dest });
  return { dest, fj: readJson(join(dest, '.claude/forge.json')) };
};

// ---------- PONTE (PERGUNTA 1) ----------
// O contrato não fixa de onde vem o corpo da nota notes/n0001. Para os ataques não fixarem nomes, o dev escreve na Ronda 0
// tests/ponte/f-04.mjs, que só importa do pacote e adapta a forma, e exporta:
//   notaDecisao(dest) -> Promise<{ kind, body, ... }>  o documento notes/n0001 que a skill manda semear, tal como o pacote o
//                                                      produz para o projeto gerado em `dest` pelo scaffold do pacote.
// A ponte não pode ler as razões por si: o texto dela não menciona `forge.json`, `reason` nem `models` (c4 verifica).
export const PONTE = join(ROOT, 'tests/ponte/f-04.mjs');
export const loadPonte = () => import(pathToFileURL(PONTE).href);
