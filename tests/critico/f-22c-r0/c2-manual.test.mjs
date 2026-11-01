// F-22c critério 2: o manual manda o orquestrador para o registo (templates/FRAMEWORK.md e templates/CLAUDE.md).
// Oráculos (corpo da #79): «per durable lesson» 0×; `/forge:learn` ≥ 1× nos Steps 5 e 7 e no §2; `learn.mjs gotcha` 1× no Step 5; o CLAUDE.md
// abaixo de 80 linhas até `## Generated blocks`. O corpus de respostas («All ok.», em inglês e em português) é o scripts/corpus.test.mjs da barra.
// O que reprova: o manual a mandar gravar a lição como texto no gotchas/, como segunda fonte.
// LEITURA (PERGUNTA 3, confirmada pelo orquestrador na #79): «a lista dos gatilhos do CP, com as fontes do C1» = os 6 identificadores e as fontes que o C1 dá com nomes de campos
// (`rounds > 1`, `regressions`, `contested`, `criticNotReproduced`); a frase do CLAUDE.md lê-se na secção «## User global rules», onde está hoje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, texto, conta, seccao, fw, passo5, linhasDeTabela, palavra } from './helpers.mjs';

test('C2 [ataque]: «per durable lesson» 0× no FRAMEWORK; o Step 5 corre /forge:learn e diz que gotchas/<class>.md é só o índice de learn.mjs gotcha, nunca o texto da lição', () => {
  const f = fw(), s = passo5(5);
  assert.ok(s.length > 100, 'não encontrei o «### Step 5.» do §5');
  assert.equal(conta(f, 'per durable lesson'), 0, '«per durable lesson» ainda está no FRAMEWORK.md');
  assert.ok(conta(s, '/forge:learn') >= 1, 'o Step 5 não manda correr /forge:learn');
  assert.equal(conta(s, 'learn.mjs gotcha'), 1, '`learn.mjs gotcha` aparece ' + conta(s, 'learn.mjs gotcha') + ' vezes no Step 5');
  assert.equal(conta(s, 'gotchas/<topic>.md'), 0, 'o Step 5 ainda tem gotchas/<topic>.md');
  const l = s.split('\n').find((x) => x.includes('gotchas/<class>.md')) ?? '';
  assert.ok(l, 'o Step 5 não tem gotchas/<class>.md');
  assert.match(l, /\bindex\b/i, 'a linha de gotchas/<class>.md no Step 5 não diz que é o índice: ' + l);
  assert.match(l, /\bnever\b/i, 'a linha de gotchas/<class>.md no Step 5 não diz «nunca o texto da lição»: ' + l);
});

test('C2 [ataque]: o Step 5 tem a lista dos gatilhos, com as fontes do C1', () => {
  const s = passo5(5);
  const faltam = IDS.filter((id) => !palavra(id).test(s));
  assert.deepEqual(faltam, [], 'gatilhos que o Step 5 não lista');
  for (const re of [/rounds\s*>\s*1/, /\bregressions\b/, /\bcontested\b/, /\bcriticNotReproduced\b/]) assert.match(s, re, 'o Step 5 não dá a fonte ' + re);
});

test('C2 [ataque]: Step 7, o «No» corre /forge:learn com o gatilho user', () => {
  const s = passo5(7);
  const no = s.split('\n').filter((l) => /^- No:/.test(l));
  assert.equal(no.length, 1, 'a linha «- No:» do Step 7');
  assert.ok(no[0].includes('/forge:learn'), 'o «No» do Step 7 não corre /forge:learn: ' + no[0]);
  assert.match(no[0], /`user`|\buser\b/, 'o «No» do Step 7 não usa o gatilho user: ' + no[0]);
});

test('C2 [ataque]: §2, a linha «Lesson from an error» aponta para /forge:learn (learnings/) e a de «durable lesson» deixa de apontar para o ai-memory', () => {
  const s = seccao(fw(), '## 2. ');
  assert.ok(s.length > 100, 'não encontrei o «## 2. » do FRAMEWORK.md');
  const rows = linhasDeTabela(s);
  const lic = rows.filter((r) => /^lesson from an error$/i.test(r[0]));
  assert.equal(lic.length, 1, 'a tabela «One tool per job» não tem uma linha «Lesson from an error»');
  assert.ok(lic[0][1]?.includes('/forge:learn'), 'a linha «Lesson from an error» não aponta para /forge:learn: ' + lic[0].join(' | '));
  assert.ok(lic[0][1]?.includes('learnings/'), 'a linha «Lesson from an error» não aponta para learnings/: ' + lic[0].join(' | '));
  const velhas = rows.filter((r) => /durable lesson/i.test(r[0]) && /ai-memory/i.test(r[1] ?? ''));
  assert.deepEqual(velhas, [], 'uma linha de «durable lesson» ainda aponta para o ai-memory');
});

test('C2 [ataque]: §7, o tier gotchas/ é descrito como índice e já não como «durable lesson»', () => {
  const s = seccao(fw(), '## 7. ');
  assert.ok(s.length > 100, 'não encontrei o «## 7. » do FRAMEWORK.md');
  const ls = s.split('\n').filter((l) => l.includes('gotchas/'));
  assert.ok(ls.length >= 1, 'o §7 não tem o tier gotchas/');
  for (const l of ls) assert.match(l, /\bindex\b/i, 'a linha do §7 com gotchas/ não o descreve como índice: ' + l);
  assert.equal(conta(s, 'durable lesson'), 0, 'o §7 ainda descreve uma «durable lesson»');
});

test('C2 [ataque]: CLAUDE.md, as lições vão para learnings/ (via /forge:learn) e as decisões para o ai-memory', () => {
  const c = texto('templates/CLAUDE.md'), s = seccao(c, '## User global rules');
  assert.ok(s.length > 50, 'não encontrei «## User global rules» no CLAUDE.md');
  assert.equal(conta(c, 'Lessons, rules and decisions go to ai-memory'), 0, 'a frase antiga ainda está no CLAUDE.md');
  const frases = s.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/);
  assert.ok(frases.some((f) => /\blessons?\b/i.test(f) && f.includes('learnings/') && f.includes('/forge:learn')), 'nenhuma frase diz que as lições vão para learnings/ via /forge:learn');
  assert.ok(frases.some((f) => /\bdecisions?\b/i.test(f) && /ai-memory/.test(f)), 'nenhuma frase diz que as decisões vão para o ai-memory');
});

test('C2 [guarda]: o CLAUDE.md do template continua com menos de 80 linhas até «## Generated blocks»', () => {
  const ls = texto('templates/CLAUDE.md').split('\n'), i = ls.findIndex((l) => l.startsWith('## Generated blocks'));
  assert.ok(i >= 0, 'o CLAUDE.md não tem «## Generated blocks»');
  assert.ok(i < 80, 'o CLAUDE.md tem ' + i + ' linhas até «## Generated blocks»');
});