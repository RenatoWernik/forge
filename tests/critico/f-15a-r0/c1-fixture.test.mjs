// F-15a critério 1 (oráculo): a fixture scripts/fixtures/compat/surface-2026-10-29.json foi gravada do upstream nas versões
// verificadas, traz o URL de cada lista e não leva dados pessoais, caminhos da máquina nem tokens. Não depende do F-05.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FIXTURE, strings, isUrl, personalHits } from './helpers.mjs';

const fixture = () => {
  assert.ok(existsSync(FIXTURE), 'falta a fixture ' + FIXTURE);
  const txt = readFileSync(FIXTURE, 'utf8');
  return { txt, urls: strings(JSON.parse(txt.replace(/^\uFEFF/, ''))).filter(isUrl) };
};

// [repo, ref (tag ou prefixo do sha), caminho] — o contrato lista as 8 fontes
const FONTES = [
  ['mattpocock/skills', 'v1.3.2', '.claude-plugin/plugin.json'],
  ['DietrichGebert/ponytail', 'v5.3.3', 'skills'],
  ['github/spec-kit', 'v1.2.5', 'templates/commands'],
  ['github/spec-kit', 'v1.2.5', 'src/specify_cli/command_init.py'],
  ['Graphify-Labs/graphify', 'v0.9.97', 'graphify/__main__.py'],
  ['akitaonrails/ai-memory', 'v3.2.10', ''],
  ['robonuggets/gauntlet-loop', '9b1975a', 'SKILL.md'],
  ['SpillwaveSolutions/sdd-skill', 'eba9606', 'skill.md'],
];
const casa = (u, [repo, ref, path]) => {
  const low = decodeURIComponent(u).toLowerCase();
  const refRe = /^[0-9a-f]{7}$/.test(ref) ? new RegExp(`[/=@]${ref}[0-9a-f]*([/?#&]|$)`) : new RegExp(`[/=@]${ref.replace(/\./g, '\\.')}([/?#&]|$)`);
  return low.includes(repo.toLowerCase()) && refRe.test(decodeURIComponent(u)) && low.includes(path.toLowerCase());
};

test('C1 oráculo: a fixture tem o URL de cada uma das 8 fontes do contrato, no repositório, na tag ou sha verificados e no caminho certo', () => {
  const { urls } = fixture();
  const faltam = FONTES.filter((f) => !urls.some((u) => casa(u, f))).map((f) => f.join(' @ '));
  assert.deepEqual(faltam, []);
});

test('C1 oráculo: todos os URLs da fixture são https do GitHub e nenhum aponta para um ramo móvel (main, master, HEAD)', () => {
  const { urls } = fixture();
  assert.ok(urls.length >= FONTES.length, 'poucos URLs na fixture: ' + urls.length);
  const maus = urls.filter((u) => !/^https:\/\/(github\.com|raw\.githubusercontent\.com|api\.github\.com)\//.test(u) || /[/=@](main|master|HEAD)([/?#&]|$)/.test(u));
  assert.deepEqual(maus, []);
});

test('reprova sempre: a fixture não tem caminhos da máquina, dados pessoais nem tokens', () => {
  assert.deepEqual(personalHits(fixture().txt), []);
});

test('controlo do oráculo de higiene: um caminho pessoal ou um token plantados numa fixture são apanhados', () => {
  const plantados = ['{"u":"C:\\\\Users\\\\fulano\\\\x"}', '{"u":"/home/fulano/x"}', '{"t":"gh' + 'p_' + 'A'.repeat(36) + '"}', '{"h":{"authorization":"x"}}'];
  for (const p of plantados) assert.ok(personalHits(p).length > 0, 'o oráculo não apanhou ' + p);
});
