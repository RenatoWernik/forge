// Ronda −1 do F-20c (#72), C1: o texto da pergunta do arranque automático (A4) em skills/new-project/SKILL.md.
// Oráculo: as contagens (o bloco 1×, byte a byte, a frase 1× e o comando 1×) e a ordem (o bloco antes do comando), no passo da memória do F-20b
// (entre o «## 5.» e o «## 7.»). O comando --autostart é o único «memoria.mjs --apply» do ficheiro, como o C6 do F-20b exige.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, BLOCO_C1, FRASE_C1, COMANDO_C1 } from './helpers.mjs';

const ler = () => readFileSync(join(ROOT, 'skills/new-project/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const conta = (t, s) => t.split(s).length - 1;

test('C1 o bloco da pergunta aparece exatamente uma vez, byte a byte', () => {
  assert.equal(conta(ler(), BLOCO_C1), 1);
});

test('C1 a frase «Ask it in the user\'s language, and wait for the answer: a missing answer is not a yes.» aparece uma vez', () => {
  assert.equal(conta(ler(), FRASE_C1), 1);
});

test('C1 o comando «memoria.mjs --apply --dest . --autostart yes|no» aparece uma vez e é o único memoria.mjs --apply', () => {
  const t = ler();
  assert.equal(conta(t, COMANDO_C1), 1, 'o comando --autostart');
  assert.equal(conta(t, 'memoria.mjs --apply'), 1, 'outro memoria.mjs --apply no ficheiro (o C6 do F-20b quer um só)');
});

test('C1 o bloco aparece antes do comando, no passo da memória (entre o ## 5. e o ## 7.)', () => {
  const t = ler();
  const c5 = t.search(/^## 5\. /m), c7 = t.search(/^## 7\. /m), b = t.indexOf(BLOCO_C1), c = t.indexOf(COMANDO_C1), f = t.indexOf(FRASE_C1);
  assert.ok(b >= 0 && c >= 0, 'falta o bloco ou o comando');
  assert.ok(c5 >= 0 && c7 > c5, 'faltam os títulos ## 5. e ## 7.');
  assert.ok(b > c5 && b < c, `o bloco não está antes do comando no passo: ## 5.@${c5} bloco@${b} comando@${c}`);
  assert.ok(c < c7, `o comando está fora do passo: comando@${c} ## 7.@${c7}`);
  assert.ok(f > c5 && f < c7, `a frase está fora do passo: ${f}`);
});