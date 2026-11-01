// F-22a critério 1 (o oráculo do dev): a forma do corpus versionado `scripts/corpus/learnings/`.
// - `valid/` tem pelo menos 2 ficheiros e, entre eles, todas as camadas (PREVENTION) e todos os gatilhos (TRIGGER);
// - `invalid/` tem um ficheiro por regra do C1: os 18 campos sempre obrigatórios em falta, os 7 enums, as 3 regras de datas, a CLASS e as
//   3 do APPROVED (pelo menos 32 ficheiros), cada um com a primeira linha `<!-- expect: E-NNN <CAMPO> -->`.
// Só se lê a forma: como o teste do dev monta cada caso no projeto é dele (C2 e C3 podem ter pastas com uma árvore falsa ao lado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, OBRIGATORIOS, ENUMS } from './helpers.mjs';

const DIR = join(ROOT, 'scripts/corpus/learnings');
const anda = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? anda(p) : [p]; });
const EXPECT = /^<!-- expect: (E-\d{3,}) ([A-Z][A-Z-]*) -->\r?$/;

test('C1 corpus: scripts/corpus/learnings/valid/ tem pelo menos 2 ficheiros .md com todas as camadas e todos os gatilhos', () => {
  assert.ok(existsSync(join(DIR, 'valid')), 'não existe scripts/corpus/learnings/valid/');
  const fs_ = anda(join(DIR, 'valid')).filter((f) => f.endsWith('.md') && !/README\.md$/.test(f));
  assert.ok(fs_.length >= 2, 'valid/ tem ' + fs_.length + ' ficheiros .md');
  const todo = fs_.map((f) => readFileSync(f, 'utf8')).join('\n');
  const camadas = new Set([...todo.matchAll(/^- PREVENTION: (\S+)\s*$/gm)].map((m) => m[1]));
  const gatilhos = new Set([...todo.matchAll(/^- TRIGGER: (\S+)\s*$/gm)].map((m) => m[1]));
  assert.deepEqual(ENUMS.PREVENTION.filter((c) => !camadas.has(c)), [], 'camadas que faltam em valid/');
  assert.deepEqual(ENUMS.TRIGGER.filter((c) => !gatilhos.has(c)), [], 'gatilhos que faltam em valid/');
});

test('C1 corpus: invalid/ tem pelo menos 32 ficheiros com «<!-- expect: E-NNN <CAMPO> -->» na primeira linha, e cobre os 18 campos, os 7 enums, a CLASS e as 3 do APPROVED', () => {
  assert.ok(existsSync(join(DIR, 'invalid')), 'não existe scripts/corpus/learnings/invalid/');
  const md = anda(join(DIR, 'invalid')).filter((f) => f.endsWith('.md'));
  const exp = md.map((f) => readFileSync(f, 'utf8').split('\n')[0].match(EXPECT)).filter(Boolean);
  assert.ok(exp.length >= 32, `só ${exp.length} ficheiros de invalid/ declaram o expect na primeira linha (precisa de 18 + 7 + 3 + 1 + 3 = 32)`);
  const conta = (c) => exp.filter((m) => m[2] === c).length;
  assert.deepEqual(OBRIGATORIOS.filter((c) => conta(c) < 1), [], 'campos obrigatórios sem nenhum caso em invalid/');
  assert.deepEqual(Object.keys(ENUMS).filter((c) => conta(c) < 2), [], 'campos de enum sem os 2 casos (em falta e fora do enum)');
  assert.ok(conta('CLASS') >= 2, 'CLASS precisa de 2 casos (em falta e não kebab-case): ' + conta('CLASS'));
  assert.ok(conta('APPROVED') >= 3, 'APPROVED precisa dos 3 casos: ' + conta('APPROVED'));
  assert.ok(conta('DATE') + conta('REVIEW-BY') >= 2 + 3, 'DATE e REVIEW-BY: 2 em falta + 3 regras de datas, há ' + (conta('DATE') + conta('REVIEW-BY')));
});