// V-09 C2 (#133): o NO_MERGE e as linhas da regra «sem push, PR nem merge sem o sim» ficam intactos (procurados pelo conteúdo, nunca pelo número da
// linha) e continuam a morder; num projeto gerado, os literais `push`, `PR` e `merge` só aparecem numa linha nova se for a que o proíbe.
// Reprova do ticket: «um merge na main automatizado». O ÂMBITO da contagem contra o merge-base está em ambito.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, EN, PT, NO_MERGE, REGRAS, temLiteral, ehWorkflow, gerar, conjunto, textos, check, lineState, fim } from './helpers.mjs';

const PINOS = [
  ['templates/.claude/check.cjs', String.raw`      ['no push, PR or merge without the yes of the user', [], [/^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without)\b).*$/im]],`],
  ['templates/.claude/check.cjs', String.raw`  const NO_MERGE = /^(?=.*\bpush\b)(?=.*\bPRs?\b)(?=.*\bmerge\b)(?=.*\b(user|utilizador|usu[áa]rio)\b)(?=.*\b(never|no|not|without|nunca|sem|nenhum)\b).*$/im`],
  ['templates/.claude/check.cjs', String.raw`  await chk('batch: no merge: every prompt of the tester forbids, in one line, push, PR and merge without the yes of the user', () => bTest.length > 0 && [...bTest, ...only(bFlaky.calls, /^batch:/)].every(c => NO_MERGE.test(c.prompt)))`],
  ['templates/.claude/workflows/gauntlet-batch.js', `const NO_MERGE = 'Never push, open a PR or merge into the main branch: each one needs the yes of the user, which only the orchestrator can ask for.'`],
  ['templates/.claude/briefs/batch.md', '6. Never push, open a PR or merge into the main branch without the yes of the user, which only the orchestrator can ask for.'],
  ['templates/FRAMEWORK.md', '- **Limits.** The tester never pushes, opens a PR or merges without the yes of the user, and never opens a real `claude` session.'],
];

for (const [file, linha] of PINOS) {
  test(`C2 (guarda): ${file} tem, byte a byte, a linha «${linha.trim().slice(0, 60)}...»`, () => {
    assert.ok(readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/).includes(linha), 'a linha mudou ou saiu');
  });
}

const FORA = [
  ['.claude/workflows/gauntlet-batch.js', PINOS[3][1].match(/'(.*)'/)[1], 'batch: no merge: every prompt of the tester forbids, in one line, push, PR and merge without the yes of the user'],
  ['.claude/briefs/batch.md', PINOS[4][1].slice(3), 'briefs'],
];
for (const [file, texto, linha] of FORA) {
  test(`C2 (guarda): tirar a proibição de ${file} põe a FAIL a linha «${linha.slice(0, 40)}»`, async () => {
    const P = await gerar(await conjunto(EN));
    assert.equal(lineState(check(P).out, linha), 'ok', 'a linha não está ok no projeto gerado');
    const f = join(P, file), t = readFileSync(f, 'utf8');
    assert.ok(t.includes(texto), `${file} não tem a proibição`);
    writeFileSync(f, t.split(texto).join('Ask nobody.'));
    const d = check(P);
    assert.equal(lineState(d.out, linha), 'FAIL', 'a linha continuou ok sem a proibição' + fim(d));
  });
}

const NOVOS = ['.claude/executor.mjs', '.claude/check-ticket.mjs', '.claude/avancar.mjs'];
for (const [nome, lingua] of [[EN, 'EN'], [PT, 'PT']]) {
  test(`C2 (${lingua}): uma linha do projeto gerado que leva um dos 3 módulos só tem push, PR ou merge se for a que os proíbe`, async () => {
    const T = textos(await gerar(await conjunto(nome)));
    const linhas = Object.entries(T).flatMap(([rel, s]) => s.split(/\r?\n/).filter((l) => NOVOS.some((n) => l.includes(n))).map((l) => [rel, l]));
    const ficheiros = new Set(linhas.map(([rel]) => rel));
    assert.deepEqual(REGRAS.map((r) => r.file).filter((f) => !ficheiros.has(f)), [], 'ficheiros sem nenhuma linha com os módulos novos');
    const mas = linhas.filter(([, l]) => temLiteral(l) && !NO_MERGE.test(l)).map(([rel, l]) => `${rel}: ${l.trim().slice(0, 200)}`);
    assert.deepEqual(mas, [], 'linhas que falam de push, PR ou merge sem o proibir');
  });

  test(`C2 (guarda, ${lingua}): o texto do projeto gerado não automatiza o merge: sem \`gh pr merge\` nem \`--modo forge\`, o avancar só com \`--modo projeto\` e fora dos workflows e dos briefs dos agentes`, async () => {
    const T = textos(await gerar(await conjunto(nome)));
    const mas = [];
    for (const [rel, s] of Object.entries(T)) {
      if (/gh pr merge/.test(s)) mas.push(`${rel}: gh pr merge`);
      if (s.includes('--modo forge')) mas.push(`${rel}: --modo forge`);
      if (/avancar\.mjs(?! --modo projeto)/.test(s) && !/\.json$/.test(rel)) mas.push(`${rel}: avancar sem --modo projeto`);
      if (s.includes('avancar.mjs') && (ehWorkflow(rel) || rel.startsWith('.claude/briefs/'))) mas.push(`${rel}: o avancar é do orquestrador`);
    }
    assert.deepEqual(mas, []);
  });
}