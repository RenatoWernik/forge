// F-17 critérios 2 e 3 (ATAQUES: vermelhos na base 712b690).
// Oráculos:
//   - a regra, LITERAL e uma só vez, em skills/update/SKILL.md (REGRA em helpers.mjs, copiada do corpo da #58);
//   - nenhuma frase da skill, frontmatter incluído, descreve um aviso como certo: a frase «The check also warns when…» desaparece e
//     nenhuma frase (fora da regra) bate na lista fechada AFIRMA abaixo;
//   - a skill documenta o código 4 na secção «## Exit codes», o README.md na secção «## Update» e o README.pt-BR.md na «## Atualização»
//     (resposta P3): um parágrafo com `4` e as palavras missing, outdated e unverified (os nomes literais dos estados);
//   - a regra vale também para a description do frontmatter (resposta P5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, SKILL, REGRA, join, readFileSync } from './helpers.mjs';

const skill = () => readFileSync(SKILL, 'utf8').replaceAll('\r\n', '\n');
const AFIRMA = [
  /The check also warns when/i,
  /\bwarns (about|when|if|that|you|the user)\b/i,
  /\b(the check|the script|the command|this skill|it|update\.mjs|forge)\s+(also\s+|always\s+)?warns\b/i,
  /\bwill (also )?warn\b/i,
  /\b(always|also) (shows?|prints?|gives?|reports?) (a |the )?warnings?\b/i,
  /\bthere is (always |also )?a warning\b/i,
];
const frases = (t) => t.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const seccao = (t, titulo) => { const i = t.indexOf('\n' + titulo + '\n'); if (i < 0) return null; const j = t.indexOf('\n## ', i + titulo.length + 2); return t.slice(i, j < 0 ? undefined : j); };
const documenta4 = (s) => (s ?? '').split(/\n\s*\n/).some((p) => /`4`/.test(p) && /\bmissing\b/.test(p) && /\boutdated\b/.test(p) && /\bunverified\b/.test(p));

test('C3 a skill tem a regra literal, uma só vez', () => {
  const t = skill();
  assert.equal(t.split(REGRA).length - 1, 1, `a regra literal aparece ${t.split(REGRA).length - 1} vezes em skills/update/SKILL.md`);
});

test('C3 nenhuma frase da skill (fora da regra) descreve um aviso como certo; a frase «The check also warns when» desapareceu', () => {
  const t = skill().split(REGRA).join(' ');
  const hits = frases(t).filter((s) => AFIRMA.some((re) => re.test(s)));
  assert.deepEqual(hits, []);
});

test('C2 a skill documenta o código 4 na secção «## Exit codes» (missing, outdated, unverified)', () => {
  const s = seccao(skill(), '## Exit codes');
  assert.ok(s, 'a skill perdeu a secção «## Exit codes»');
  assert.ok(documenta4(s), 'a secção «## Exit codes» não tem um parágrafo com `4` e missing, outdated e unverified:\n' + s);
});

test('C2 o README.md documenta o código 4 na secção «## Update» (missing, outdated, unverified)', () => {
  const s = seccao(readFileSync(join(ROOT, 'README.md'), 'utf8').replaceAll('\r\n', '\n'), '## Update');
  assert.ok(s, 'o README.md perdeu a secção «## Update»');
  assert.ok(documenta4(s), 'a secção «## Update» do README.md não tem um parágrafo com `4` e missing, outdated e unverified');
});

test('C2 o README.pt-BR.md documenta o código 4 na secção «## Atualização» (missing, outdated, unverified; resposta P3)', () => {
  const s = seccao(readFileSync(join(ROOT, 'README.pt-BR.md'), 'utf8').replaceAll('\r\n', '\n'), '## Atualização');
  assert.ok(s, 'o README.pt-BR.md perdeu a secção «## Atualização»');
  assert.ok(documenta4(s), 'a secção «## Atualização» do README.pt-BR.md não tem um parágrafo com `4` e missing, outdated e unverified');
});

test('C3 sanidade do oráculo: a lista AFIRMA apanha a frase antiga e a do frontmatter da base, e não apanha a regra', () => {
  for (const s of ['The check also warns when the original gauntlet-loop repository has new commits.', 'It never touches a skill you customized unless you say so (and backs it up first), warns about versions not tested with forge and about the ai-memory backup.']) assert.ok(AFIRMA.some((re) => re.test(s)), s);
  assert.ok(!AFIRMA.some((re) => re.test(REGRA)), 'a lista apanha a própria regra');
});
