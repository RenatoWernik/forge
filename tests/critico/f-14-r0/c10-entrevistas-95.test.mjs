// Emenda do utilizador ao F-14 (#15): TODAS as entrevistas do forge seguem a regra «pergunta tudo até ter 95 % de certeza do que eu
// quero e do que eu preciso»: a entrevista inicial, o setup do new-project e qualquer outro passo em que uma skill do forge faça
// perguntas ao utilizador. A certeza é declarada por dimensão, e a entrevista para quando todas chegam a 95 % ou quando o utilizador
// diz «chega»/«enough». Hoje a regra só existe no passo 2 do new-project (F-04).
// Oráculo (leitura do crítico, PERGUNTA 7 na #15):
//   - passo de entrevista = a lista fechada ENTREVISTAS abaixo (resposta à P7: as confirmações sim/não ficam fora);
//   - cada um desses passos cita a regra: «95 %» (ou «95%») na própria secção;
//   - cada skill com um passo que pergunta tem a regra completa: 95 %, «dimension», «enough» e «chega» no mesmo parágrafo;
//   - o projeto gerado (EN) leva a regra ao passo em que o orquestrador entrevista o utilizador (Clarify, com o grilling): o parágrafo
//     ou a linha da tabela que nomeia o grilling «with the user» tem 95 %. Em PT, o substituto da tradução do corpus apaga a prosa,
//     por isso o ataque PT só exige que o «95» sobreviva no mesmo sítio dentro de código (`...`), como os identificadores (PERGUNTA 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { ROOT, gerar, corpusAnswers, traduzSePt, readFileSync, existsSync } from './helpers.mjs';

// Resposta à P7 do orquestrador na #15: as confirmações sim/não (o sim por componente do update ou do passo 1, «Apply this patch?»)
// não são entrevistas e ficam fora. A lista fechada dos passos de entrevista na base 248ed1c (o título da secção começa assim):
const P95 = /\b95\s?%/;
const seccoes = (t) => t.split(/\r?\n(?=## )/).filter((s) => s.startsWith('## '));
void readdirSync;
const ENTREVISTAS = { 'new-project': ['## 2.', '## 3.', '## 4.'], sync: ['## 1.'] };

for (const [s, passos] of Object.entries(ENTREVISTAS)) {
  test(`emenda 95 %: cada passo de entrevista da skill ${s} (${passos.join(' ')}) cita a regra dos 95 %`, () => {
    const t = readFileSync(join(ROOT, 'skills', s, 'SKILL.md'), 'utf8');
    const sem = passos.filter((p) => { const x = seccoes(t).find((y) => y.startsWith(p)); return !x || !P95.test(x); });
    assert.deepEqual(sem, []);
  });
  test(`emenda 95 %: a skill ${s} tem a regra completa (95 % por dimensão, para com «enough» ou «chega»)`, () => {
    const t = readFileSync(join(ROOT, 'skills', s, 'SKILL.md'), 'utf8');
    assert.ok(t.split(/\r?\n\s*\r?\n/).some((p) => P95.test(p) && /dimension/i.test(p) && /\benough\b/i.test(p) && /\bchega\b/i.test(p)), 'nenhum parágrafo com 95 %, dimension, enough e chega');
  });
}

for (const set of ['en-plain-published', 'pt-plain-published']) {
  test(`emenda 95 % (${set}): o passo do projeto gerado em que o orquestrador entrevista o utilizador (grilling) tem a regra dos 95 %`, async () => {
    const proj = await gerar(corpusAnswers(set));
    traduzSePt(proj);
    const ls = readFileSync(join(proj, 'FRAMEWORK.md'), 'utf8').split(/\r?\n/).filter((l) => /mattpocock-skills:grilling/.test(l) && (/with the user/i.test(l) || /^\|/.test(l)));
    assert.ok(ls.length, 'nenhuma linha do FRAMEWORK.md nomeia o grilling');
    assert.ok(ls.every((l) => (set.startsWith('pt') ? /`[^`]*\b95\s?%[^`]*`/ : P95).test(l)), ls.map((l) => l.slice(0, 160)).join('\n'));
  });
}
