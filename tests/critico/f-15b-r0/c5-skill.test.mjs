// F-15b critério 5: a skill /forge:update (skills/update/SKILL.md).
// Oráculo: os literais exigidos pelo contrato, a frase de que nada corre sem o sim, nenhum --force e nenhum «all» passado ao
// --apply; o --check vem antes do --apply; cada --apply citado leva um só id e o --yes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SKILL, personalHits } from './helpers.mjs';

const texto = () => {
  assert.ok(existsSync(SKILL), 'falta skills/update/SKILL.md');
  return readFileSync(SKILL, 'utf8');
};
const LITERAIS = ['--check', '--apply', '--yes', '--accept-unverified', '--backup-confirmed', '--overwrite', 'forge-backups', 'speckit-project',
  'specify integration upgrade claude', 'claude plugin marketplace update forge', 'claude plugin update forge@forge'];

test('C5: a skill tem todos os literais do contrato e «não testada com o forge» (ou «not tested with forge», se for em inglês)', () => {
  const t = texto();
  assert.deepEqual(LITERAIS.filter((l) => !t.includes(l)), []);
  assert.match(t, /não testada com o forge|not tested with forge/i);
});

test('C5: a skill diz que nada corre sem o sim do utilizador e que nunca reescreve os ficheiros gerados', () => {
  const t = texto();
  assert.match(t, /(nada|nenhum comando)[^.\n]*(corre|é executad|execut)[^.\n]*sem o (teu |seu )?sim|(nothing|no command)[^.\n]*(runs|is run|run|executes)[^.\n]*without (the user's |your |a )?(yes|approval|consent)/i, 'falta a frase de que nada corre sem o sim');
  assert.match(t, /(nunca|never)[^.\n]*(reescrev|rewrit|overwrit|sobrescrev|touch|toca)/i, 'não diz que nunca reescreve os ficheiros gerados');
});

test('C5: nenhum --force e nenhum «all» (ou *, todos) passado ao --apply', () => {
  const t = texto();
  assert.ok(!t.includes('--force'), 'a skill cita --force');
  assert.doesNotMatch(t, /--apply\s+["'`<]?(all|\*|todos|todas|everything|tudo)\b/i);
  assert.doesNotMatch(t, /--apply\s+[\w<>-]+\s*,\s*[\w<>-]+/i, 'um --apply com ids separados por vírgula');
});

test('C5: a skill manda correr update.mjs --apply <id> --yes; o --check aparece antes do primeiro --apply', () => {
  const t = texto();
  assert.ok(t.indexOf('--check') >= 0 && t.indexOf('--check') < t.indexOf('--apply'), 'o --check tem de vir antes do --apply');
  assert.match(t, /update\.mjs[^\n]*--apply[^\n]*--yes/, 'a skill não mostra a chamada update.mjs --apply <id> --yes');
});

test('C5: o speckit-project só é oferecido dentro de um projeto com .specify/, e o forge à parte', () => {
  const t = texto();
  assert.match(t, /\.specify\/?/, 'não condiciona o speckit-project a um projeto com .specify/');
  assert.match(t, /--apply forge\b/, 'não oferece o forge como ação à parte');
  assert.match(t, /--project/, 'não passa o --project ao speckit-project');
});

test('C5: a skill recomenda saltar uma skill customized e pergunta à parte o backup do ai-memory', () => {
  const t = texto();
  assert.match(t, /customized/);
  assert.match(t, /(saltar|salta|skip|deixa[r]? de fora|não (a )?substitu)/i, 'não recomenda saltar a skill customized');
  assert.match(t, /backup[^\n]*ai-memory|ai-memory[^\n]*backup/i, 'não pergunta pelo backup do ai-memory');
});

test('C5: a skill não tem caminhos da máquina, dados pessoais nem tokens', () => {
  assert.deepEqual(personalHits(texto()), []);
});
