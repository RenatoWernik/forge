// F-22c critério 1: a skill skills/learn/SKILL.md (/forge:learn).
// Oráculos (corpo da #79): scripts/frontmatter.test.mjs verde com a skill nova; cada um dos 6 identificadores 1× na lista do passo 1; os comandos
// `learn.mjs add`, `learn.mjs readout`, `learn.mjs report` e `learn.mjs gotcha` 1× cada; a ordem dos títulos dos 8 passos é a do contrato.
// LEITURA (PERGUNTA 1, confirmada pelo orquestrador na #79; um item de lista numerada não conta): os passos são os títulos «## N. <título>» (a forma das skills numeradas do pacote), numerados de 1 a 8; o título de
// cada um tem a palavra do contrato, em inglês (a língua do pacote) ou em português. Um identificador conta quando está entre crases (`user`),
// como no contrato: a palavra «user» solta é prosa. O que cada passo tem de dizer lê-se dos literais entre crases do corpo da issue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SKILL, IDS, texto, conta, seccao, palavra, ambiente } from './helpers.mjs';

const skill = () => { assert.ok(existsSync(join(ROOT, SKILL)), `não existe ${SKILL}: o F-22c não está implementado`); return texto(SKILL); };
const FM = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const corpo = (t) => t.replace(FM, '');
// o valor de uma chave do frontmatter: na própria linha, entre aspas, ou num bloco | ou > (as linhas indentadas a seguir)
const chave = (t, k) => {
  const m = FM.exec(t);
  assert.ok(m, `${SKILL} sem bloco de frontmatter entre linhas ---`);
  const ls = m[1].split('\n'), i = ls.findIndex((l) => l.startsWith(k + ':'));
  if (i < 0) return undefined;
  const v = ls[i].slice(k.length + 1).trim();
  if (/^[|>][+-]?$/.test(v)) { const b = []; for (let j = i + 1; j < ls.length && /^(\s+|$)/.test(ls[j]); j++) b.push(ls[j].trim()); return b.join(' ').trim(); }
  return v.replace(/^(["'])(.*)\1$/, '$2');
};
// os títulos numerados «## N. <título>», fora das cercas
const titulos = (t) => { let cerca = false; const out = []; for (const l of corpo(t).split('\n')) { if (/^\s*```/.test(l)) cerca = !cerca; else if (!cerca) { const m = /^## (\d+)\. (.+)$/.exec(l); if (m) out.push({ n: +m[1], titulo: m[2] }); } } return out; };
const passo = (t, n) => seccao(corpo(t), `## ${n}. `);
const PALAVRAS = [
  ['Gatilho', /trigger|gatilho/i], ['Causa', /cause|causa/i], ['Camada', /layer|camada/i], ['Casos', /\bcases?\b|\bcasos?\b/i],
  ['Regra nova', /\brules?\b|\bregra/i], ['Gravar', /record|write|save|register|gravar|registar|registrar/i], ['Índice na memória', /memory|index|mem[oó]ria|[íi]ndice/i],
  ['Falha aberta ou fechada', /\bfails?\b|falha/i],
];
const crase = (id) => '`' + id + '`';

test('C1 [ataque]: o frontmatter tem name: learn e uma description que cita os 6 gatilhos, e scripts/frontmatter.test.mjs fica verde', () => {
  const t = skill();
  assert.equal(chave(t, 'name'), 'learn', 'name do frontmatter');
  const d = chave(t, 'description') ?? '';
  assert.ok(d.length > 0, 'description vazia');
  const faltam = IDS.filter((id) => !palavra(id).test(d));
  assert.deepEqual(faltam, [], 'gatilhos que a description não cita');
  const r = spawnSync(process.execPath, ['--test', 'scripts/frontmatter.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: ambiente(), timeout: 120000 });
  assert.equal(r.status, 0, 'scripts/frontmatter.test.mjs falha:\n' + (r.stdout + r.stderr).slice(-1500));
});

test('C1 [ataque]: o corpo tem 8 passos «## N.», numerados de 1 a 8, com os títulos pela ordem do contrato', () => {
  const ts = titulos(skill());
  assert.deepEqual(ts.map((x) => x.n), [1, 2, 3, 4, 5, 6, 7, 8], 'os passos numerados: ' + JSON.stringify(ts));
  ts.forEach((x, i) => assert.match(x.titulo, PALAVRAS[i][1], `o título do passo ${i + 1} («${x.titulo}») não é «${PALAVRAS[i][0]}»`));
});

test('C1 [ataque]: passo 1, cada um dos 6 identificadores 1× na lista, cada um numa linha que diz de onde vem', () => {
  const s = passo(skill(), 1);
  assert.ok(s, 'não há o passo «## 1.»');
  for (const id of IDS) assert.equal(conta(s, crase(id)), 1, `${crase(id)} aparece ${conta(s, crase(id))} vezes no passo 1`);
  const lin = (id) => s.split('\n').find((l) => l.includes(crase(id))) ?? '';
  const FONTES = {
    user: [/Step 7/, /\bNo\b/],
    'critic-rejected': [/`?results(\[\])?`?/, /rounds\s*>\s*1/, /REJECTED/],
    escape: [/\bregressions\b/, /APPROVED/],
    noise: [/\bcontested\b/, /criticNotReproduced\s*>\s*0/],
    'hook-blocked': [/\bforge\b/i, /\bhook\b/i],
    incident: [/\b(other|another|any other|outro)\b/i],
  };
  for (const [id, res] of Object.entries(FONTES)) for (const re of res) assert.match(lin(id), re, `a linha de ${crase(id)} no passo 1 não diz a fonte (${re}): «${lin(id)}»`);
});

test('C1 [ataque]: os comandos learn.mjs add, readout, report e gotcha aparecem 1× cada, no passo certo (report no 3, add e depois readout no 6, gotcha no 7)', () => {
  const t = skill();
  for (const c of ['learn.mjs add', 'learn.mjs readout', 'learn.mjs report', 'learn.mjs gotcha']) assert.equal(conta(t, c), 1, `«${c}» aparece ${conta(t, c)} vezes na skill`);
  assert.ok(passo(t, 3).includes('node .claude/learn.mjs report'), 'o passo 3 não tem `node .claude/learn.mjs report`');
  const p6 = passo(t, 6), a = p6.indexOf('node .claude/learn.mjs add --json'), r = p6.indexOf('node .claude/learn.mjs readout');
  assert.ok(a >= 0, 'o passo 6 não tem `node .claude/learn.mjs add --json <ficheiro>`');
  assert.ok(r > a, 'o passo 6 não corre o readout depois do add');
  assert.ok(passo(t, 7).includes('node .claude/learn.mjs gotcha'), 'o passo 7 não tem `node .claude/learn.mjs gotcha <E-NNN>`');
});

test('C1 [ataque]: passo 2, a causa nossa primeiro (spec, instruction, harness, model, por esta ordem) e só depois o produto', () => {
  const s = passo(skill(), 2);
  const at = ['spec', 'instruction', 'harness', 'model'].map((c) => s.indexOf(crase(c)));
  assert.ok(at.every((x) => x >= 0), 'falta uma das causas entre crases no passo 2: ' + JSON.stringify(at));
  assert.deepEqual([...at].sort((x, y) => x - y), at, 'a ordem das causas no passo 2 não é spec, instruction, harness, model');
  const p = s.slice(at[3]).search(/\bproduct\b|\bproduto\b/i);
  assert.ok(p > 0, 'o passo 2 não põe o produto depois de `model`');
});

test('C1 [ataque]: passo 3, a escada test > hook/check > contract > text > memory e a subida de uma classe que já existe', () => {
  const s = passo(skill(), 3);
  const at = Object.fromEntries(['test', 'hook', 'check', 'contract', 'text', 'memory'].map((c) => [c, s.indexOf(crase(c))]));
  assert.ok(Object.values(at).every((x) => x >= 0), 'falta uma camada entre crases no passo 3: ' + JSON.stringify(at));
  assert.ok(at.test < Math.min(at.hook, at.check) && Math.max(at.hook, at.check) < at.contract && at.contract < at.text && at.text < at.memory, 'a ordem da escada no passo 3: ' + JSON.stringify(at));
});

test('C1 [ataque]: passo 4, para test, hook e check, o caso que reproduz e um caso limpo antes da entrada', () => {
  const s = passo(skill(), 4);
  for (const c of ['test', 'hook', 'check']) assert.ok(s.includes(crase(c)), `o passo 4 não nomeia ${crase(c)}`);
  assert.match(s, /\bclean\b|\blimpo\b/i, 'o passo 4 não pede o caso limpo');
  assert.match(s, /reproduc|regression|reproduz|regress[aã]o/i, 'o passo 4 não pede o caso que reproduz');
});

test('C1 [ataque]: passo 5, a regra só com o sim (APPROVED: yes, <UTC>); sem sim, memory com REVIEW-BY curto', () => {
  const s = passo(skill(), 5);
  assert.match(s, /APPROVED: yes,/, 'o passo 5 não grava `APPROVED: yes, <UTC>`');
  assert.ok(s.includes(crase('text')), 'o passo 5 não nomeia a camada `text`');
  assert.ok(s.includes(crase('memory')), 'o passo 5 não manda para `memory` quando não há sim');
  assert.ok(s.includes('REVIEW-BY'), 'o passo 5 não fala do REVIEW-BY');
});

test('C1 [ataque]: passo 7, memory_write_page de gotchas/<class>.md com o corpo exato de learn.mjs gotcha', () => {
  const s = passo(skill(), 7);
  assert.ok(s.includes('memory_write_page'), 'o passo 7 não tem memory_write_page');
  assert.ok(s.includes('gotchas/<class>.md'), 'o passo 7 não tem gotchas/<class>.md');
  assert.ok(s.includes('node .claude/learn.mjs gotcha'), 'o passo 7 não tem o corpo de `node .claude/learn.mjs gotcha <E-NNN>`');
});

test('C1 [ataque]: passo 8, FAILS: closed para segurança, segredos e dados; open com aviso para gates de fluxo', () => {
  const s = passo(skill(), 8);
  assert.ok(s.includes('FAILS: closed'), 'o passo 8 não tem `FAILS: closed`');
  assert.match(s, /`open`|FAILS: open/, 'o passo 8 não tem `open`');
  assert.match(s, /secur|segur/i, 'o passo 8 não fala de segurança');
  assert.match(s, /secret|segredo/i, 'o passo 8 não fala de segredos');
});