// Ronda −1 do F-24 (#80), C1 e C4 (segunda parte, a rede de CronCreate), mais o ponto 2 do comentário do orquestrador:
// as regras em texto literal. Oráculo: as contagens do contrato sobre os templates do pacote, a linha da invariante 12 da merge-base
// com a origin/main, e o corpus de respostas («All ok.») em inglês e em português (pelo mesmo substituto de tradução do corpus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as H from './helpers.mjs';
import { translatePt, check } from '../f-01-r0/helpers.mjs';

const FW = 'templates/FRAMEWORK.md';
const fw = () => H.semCr(H.le(FW));
const TITULO = '## 12. Session continuity';
const seccao12 = (t) => {
  const ls = t.split('\n');
  const i = ls.indexOf(TITULO);
  if (i < 0) return null;
  const j = ls.findIndex((l, k) => k > i && /^## /.test(l));
  return ls.slice(i, j < 0 ? ls.length : j).join('\n');
};
const PARAGRAFOS = { Context: H.P_CONTEXTO, Quota: H.P_QUOTA, Agents: H.P_AGENTES, Checkpoints: H.P_CHECKPOINTS, Orchestrator: H.P_ORQUESTRADOR, 'Safety net': H.P_REDE };
// os blocos ```text de um texto, com o conteúdo exato entre as cercas
const blocosText = (t) => [...t.matchAll(/^```text\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);

test('C1: o FRAMEWORK.md tem o título «## 12. Session continuity» uma vez', () => {
  assert.equal(fw().split('\n').filter((l) => l === TITULO).length, 1);
});

for (const [nome, p] of Object.entries(PARAGRAFOS)) {
  test(`C1/C4: o parágrafo «${nome}» está byte a byte, uma vez, como linha própria dentro da secção 12`, () => {
    const t = fw();
    assert.equal(H.conta(t, p), 1, `o parágrafo «${nome}» aparece ${H.conta(t, p)} vezes`);
    assert.ok(t.split('\n').includes(p), `o parágrafo «${nome}» não é uma linha própria`);
    assert.ok(seccao12(t)?.includes(p), `o parágrafo «${nome}» está fora da secção 12`);
  });
}

test('C4: o parágrafo «Safety net» vem logo a seguir ao «Orchestrator» (só linhas em branco entre eles)', () => {
  const t = fw(), i = t.indexOf(H.P_ORQUESTRADOR), j = t.indexOf(H.P_REDE);
  assert.ok(i >= 0 && j > i, 'ordem errada ou parágrafos em falta');
  assert.match(t.slice(i + H.P_ORQUESTRADOR.length, j), /^\s*$/);
});

for (const [nome, prompt] of [['de retoma', H.PROMPT_RETOMA], ['da rede', H.PROMPT_REDE]]) {
  test(`C1/C4: o prompt ${nome} aparece uma vez, sozinho num bloco text, dentro da secção 12`, () => {
    const t = fw();
    assert.equal(H.conta(t, prompt), 1, `o prompt ${nome} aparece ${H.conta(t, prompt)} vezes`);
    assert.equal(blocosText(seccao12(t) ?? '').filter((b) => b === prompt).length, 1, `nenhum bloco \`\`\`text da secção 12 tem exatamente o prompt ${nome}`);
  });
}

test('C1: «tell the user and wait» aparece 0 vezes no FRAMEWORK.md e a ação da linha «subscription quota exhausted» do §9 aponta para a secção 12', () => {
  const t = fw();
  assert.equal(H.conta(t, 'tell the user and wait'), 0);
  const l = t.split('\n').filter((x) => /^\| subscription quota exhausted \|/.test(x));
  assert.equal(l.length, 1, 'a linha da quota do §9 sumiu ou repetiu-se');
  const celulas = l[0].split('|').map((c) => c.trim()).filter(Boolean);
  assert.equal(celulas.length, 3);
  assert.match(celulas[2], /\bsection 12\b/, 'a ação não aponta para a secção 12: ' + celulas[2]);
});

test('C4: os 4 limites da rede: cada trecho uma vez, o prompt começa por [forge-safety-net] e a linha cron tem 3 minutos sem 0 nem 30', () => {
  const t = fw();
  for (const s of ['Only while an autonomous run has active subagents', 'at the start of the run', '`CronDelete` when the run ends', 'before creating it list the jobs with `CronList`', 'one model call per fire, 3 per hour']) {
    assert.equal(H.conta(t, s), 1, `«${s}» aparece ${H.conta(t, s)} vezes`);
  }
  assert.ok(H.PROMPT_REDE.startsWith('[forge-safety-net] '));
  const cron = H.P_REDE.match(/the cron `([^`]+)`/)[1];
  const minutos = cron.split(' ')[0].split(',').map(Number);
  assert.equal(cron.split(' ').length, 5);
  assert.equal(minutos.length, 3);
  assert.ok(!minutos.includes(0) && !minutos.includes(30));
  assert.equal(H.conta(t, '`' + cron + '`'), 1);
});

for (const rel of ['templates/CLAUDE.md', 'templates/AGENTS.md']) {
  test(`C1: a invariante 12 de ${rel} ganha a frase antes do «Verifies:», uma vez, e o resto da linha é o da merge-base`, () => {
    const t = H.semCr(H.le(rel));
    assert.equal(H.conta(t, H.FRASE_INV12), 1, `a frase aparece ${H.conta(t, H.FRASE_INV12)} vezes`);
    const l = t.split('\n').find((x) => x.startsWith('12. '));
    const base = H.semCr(H.naBase(rel) ?? '').split('\n').find((x) => x.startsWith('12. '));
    assert.ok(l && base, 'falta a invariante 12');
    const i = l.indexOf(H.FRASE_INV12), v = l.indexOf('Verifies:');
    assert.ok(i >= 0 && v > i, 'a frase não está na linha da invariante 12, antes do «Verifies:»');
    assert.equal(l.replace(H.FRASE_INV12 + ' ', ''), base, 'a invariante 12 mudou além da frase');
  });
}

test('C1: a invariante 12 do AGENTS.md é idêntica à do CLAUDE.md, e o CLAUDE.md fica abaixo de 80 linhas até «## Generated blocks»', () => {
  const linha = (rel) => H.semCr(H.le(rel)).split('\n').find((x) => x.startsWith('12. '));
  assert.equal(linha('templates/AGENTS.md'), linha('templates/CLAUDE.md'));
  const ls = H.semCr(H.le('templates/CLAUDE.md')).split('\n');
  const g = ls.indexOf('## Generated blocks');
  assert.ok(g > 0 && g < 80, `«## Generated blocks» na linha ${g + 1}`);
});

test('C1: o .checkpoints/README.md tem research e orchestrator na lista de papéis e a frase do relatório incremental uma vez', () => {
  const t = H.semCr(H.le('templates/.checkpoints/README.md'));
  assert.equal(H.conta(t, H.FRASE_README), 1);
  const role = t.split('\n').find((l) => l.startsWith('| `role` |'));
  assert.ok(role, 'falta a linha `role` da tabela');
  for (const p of ['developer', 'critic', 'tester', 'batch', 'research', 'orchestrator']) assert.match(role, new RegExp(`\\b${p}\\b`), `o papel ${p} não está na lista: ${role}`);
});

test('comentário do orquestrador, ponto 2: os quatro briefs têm a linha «Context warnings from hooks belong to the main session, never to you» uma vez', () => {
  for (const rel of H.BRIEFS) assert.equal(H.conta(H.le(rel), H.AVISO_BRIEFS), 1, rel);
});

test('C1: a regra 3 da tradução (skills/new-project/SKILL.md) põe os blocos `text` entre os que nunca se traduzem', () => {
  const r3 = H.le('skills/new-project/SKILL.md').split(/\r?\n/).filter((l) => /^3\. Never translate/.test(l));
  assert.equal(r3.length, 1, 'a regra 3 sumiu ou repetiu-se');
  assert.match(r3[0], /`text`/, 'a regra 3 não nomeia os blocos `text`');
  for (const b of ['json', 'toml', 'bash']) assert.ok(r3[0].includes('`' + b + '`'), `a regra 3 deixou de nomear os blocos ${b}`);
});

for (const [conjunto, pt] of [['en-plain-pending', false], ['pt-plain-pending', true]]) {
  test(`C1: o conjunto ${conjunto} do corpus gera um projeto com «All ok.», e os dois prompts estão no FRAMEWORK.md gerado${pt ? ' (por traduzir)' : ''}`, async () => {
    const respostas = JSON.parse(H.le(`scripts/corpus/answers/${conjunto}.json`));
    const proj = join(H.tmp(), 'proj');
    await (await H.scaffoldFn())(respostas, { dest: proj });
    if (pt) for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', '.checkpoints/README.md', ...['dev', 'critic', 'round-minus-1', 'batch'].map((b) => `.claude/briefs/${b}.md`)]) H.writeFileSync(join(proj, rel), translatePt(H.readFileSync(join(proj, rel), 'utf8')));
    const r = check(proj);
    assert.equal(r.status, 0, r.out.split('\n').filter((l) => l.startsWith('FAIL')).join('\n'));
    assert.match(r.out, /All ok\./);
    const t = H.semCr(H.le('FRAMEWORK.md', proj));
    for (const p of [H.PROMPT_RETOMA, H.PROMPT_REDE]) assert.equal(blocosText(t).filter((b) => b === p).length, 1, 'prompt em falta ou traduzido no projeto gerado');
  });
}