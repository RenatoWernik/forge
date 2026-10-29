// F-05, adenda do orquestrador (seguimento #20):
//   1. o FRAMEWORK.md §2 deixa de proibir /make-plan e /learn-codebase (skills do claude-mem, que já saiu) e continua a proibir o
//      que deve: os outros itens da lista «Do not use» de e083b6a ficam lá (leitura minha de «volta a proibir o que deve»,
//      PERGUNTA 3 na #6);
//   2. a nota «There is no step 7» do BOOTSTRAP.md diz a verdade: cada coisa que ela diz que cita os passos 8 e 9 cita-os mesmo.
// Oráculo: (1) a ausência das duas skills no template e nos projetos gerados, mais a lista literal dos 11 itens que continuam
// proibidos, procurados no bloco «Do not use» até ao título seguinte; (2) a nota existe e, para cada fonte que nomeia (`check.cjs`,
// os workflows, as skills), essa fonte do pacote contém «step 8» ou «step 9».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, COMBOS, generate } from './helpers.mjs';

const GONE = [/make-plan/, /learn-codebase/];
const STILL = ['`sdd`', '`to-spec`', '`to-tickets`', '`triage`', '`wayfinder`', '`grill-with-docs`', '`grill-me`', '`/speckit-implement`', '`/implement`', '`specify workflow`', '`code-review`'];
const doNotUse = (text) => {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => /^Do not use\b/i.test(l.trim()));
  if (i < 0) return undefined;
  let e = i + 1; while (e < lines.length && !/^#/.test(lines[e])) e++;
  return lines.slice(i, e).join('\n');
};

test('#20: o template FRAMEWORK.md não fala de /make-plan nem de /learn-codebase', () => {
  const fw = readFileSync(join(ROOT, 'templates/FRAMEWORK.md'), 'utf8');
  assert.deepEqual(GONE.filter((re) => re.test(fw)).map(String), []);
});

for (const [name, answers] of COMBOS) {
  test(`#20 ${name}: o FRAMEWORK.md gerado não proíbe /make-plan nem /learn-codebase e continua a proibir os outros 11 itens`, async () => {
    const { raw } = await generate(answers);
    const fw = raw['FRAMEWORK.md'];
    assert.deepEqual(GONE.filter((re) => re.test(fw)).map(String), [], 'ainda fala das skills do claude-mem');
    const block = doNotUse(fw);
    assert.ok(block, 'não há bloco «Do not use»');
    assert.deepEqual(STILL.filter((x) => !block.includes(x)), [], 'itens que deixaram de ser proibidos');
  });
}

const walk = (p) => (!existsSync(p) ? [] : statSync(p).isFile() ? [p] : readdirSync(p).flatMap((x) => walk(join(p, x))));
const cites = (files) => files.length > 0 && files.some((f) => /step [89]\b/i.test(readFileSync(f, 'utf8')));
const SOURCES = [
  ['check.cjs', /check\.cjs/, () => [join(ROOT, 'templates/.claude/check.cjs')]],
  ['the workflows', /workflows?/i, () => walk(join(ROOT, 'templates/.claude/workflows')).filter((f) => f.endsWith('.js'))],
  ['the skills', /skills?/i, () => walk(join(ROOT, 'skills')).filter((f) => f.endsWith('SKILL.md'))],
];

test('#20: a nota «There is no step 7» do BOOTSTRAP.md só diz que cita os passos 8 e 9 quem os cita de facto', async () => {
  const { raw } = await generate(COMBOS[0][1]);
  const note = raw['BOOTSTRAP.md'].split(/\r?\n/).find((l) => /no step 7/i.test(l));
  assert.ok(note, 'a nota do step 7 desapareceu');
  const said = SOURCES.filter(([, re]) => re.test(note));
  assert.ok(said.length > 0, 'a nota não diz quem cita os passos: ' + note);
  assert.deepEqual(said.filter(([, , files]) => !cites(files())).map(([k]) => k), [], 'a nota diz que estes citam os passos 8 e 9, e não citam: ' + note);
});
