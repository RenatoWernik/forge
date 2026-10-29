// F-05 critério 5: o contrato vive nas GitHub Issues.
// Oráculo:
//   - literais no FRAMEWORK.md gerado (versão inglesa, leitura minha, PERGUNTA 1 na #6): cada peça do `tasks.md` vira uma issue;
//     os agentes leem o contrato com `gh issue view <n> --json body,comments` (literal do ticket); o contrato é o corpo da issue mais
//     os comentários do orquestrador; o modelo do contrato numa só secção, com os campos do processo v3 (objetivo, entrada,
//     critérios com oráculo e comando, o que reprova e o que é lacuna, âmbito, ambiente, saída);
//   - o valor de `repo` aparece no FRAMEWORK.md e vem da resposta (duas respostas diferentes, dois valores);
//   - corpus de valores de `repo` inválidos: recusados com o nome `repo` e sem escrever nada; corpus de válidos: aceites;
//   - o passo 6 do BOOTSTRAP.md escolhe o tracker GitHub (e deixa de dizer que o fluxo não usa o tracker);
//   - mutação «contrato num ficheiro local»: o check.cjs falha (o nome da linha é a PERGUNTA 4 na #6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { COMBOS, ANSWERS, ANSWERS_PT, REPO, generate, loadScaffold, tmp, check, fails, failNames, edit, sections } from './helpers.mjs';

const GH = '`gh issue view <n> --json body,comments`';
const FIELDS = [['objective', /objective/i], ['input', /\binput/i], ['criteria', /criteri/i], ['oracle', /oracle/i], ['command', /command/i],
  ['what fails', /\bfails?\b/i], ['gap', /\bgaps?\b/i], ['scope', /scope/i], ['environment', /environment/i], ['output', /output/i]];

for (const [name, answers] of COMBOS) {
  test(`C5 ${name}: o FRAMEWORK.md gerado põe o contrato nas GitHub Issues, com o comando literal e o modelo do contrato`, async () => {
    const { raw } = await generate(answers);
    const fw = raw['FRAMEWORK.md'], lines = fw.split(/\r?\n/), bad = [];
    if (!fw.includes(GH)) bad.push('sem ' + GH);
    if (!lines.some((l) => /`tasks\.md`/.test(l) && /\bissues?\b/i.test(l) && /\bpieces?\b/i.test(l))) bad.push('nenhuma linha diz que cada peça do `tasks.md` vira uma issue');
    if (!lines.some((l) => /\bbody\b/.test(l) && /\bcomments\b/.test(l) && /orchestrator/i.test(l))) bad.push('nenhuma linha diz que o contrato é o corpo da issue mais os comentários do orquestrador');
    if (!sections(fw).some((s) => FIELDS.every(([, re]) => re.test(s)))) bad.push('nenhuma secção tem o modelo do contrato com todos os campos: ' + FIELDS.map(([k]) => k).join(', '));
    if (!fw.includes(REPO)) bad.push(`o valor de repo (${REPO}) não aparece`);
    assert.deepEqual(bad, []);
  });
}

test('C5: o repo do FRAMEWORK.md vem da resposta, não de um valor fixo', async () => {
  const { raw } = await generate(ANSWERS({ repo: 'probe-owner/probe.repo_9' }));
  assert.ok(raw['FRAMEWORK.md'].includes('probe-owner/probe.repo_9'), 'o repo da resposta não aparece');
  assert.ok(!raw['FRAMEWORK.md'].includes(REPO), 'aparece um repo que não foi respondido');
});

const INVALID = ['', ' ', 'acme', 'acme/', '/billing', 'acme/billing/x', 'https://github.com/acme/billing', 'git@github.com:acme/billing.git',
  'acme billing/x', 'acme/bill ing', '../billing', 'acme/..', 'acme/billing;rm -rf ~', 'acme/`whoami`', 'acme/bil$ling', 'acme\\billing', 'acme/billing\n', 42, null, ['acme/billing'], { owner: 'acme', name: 'billing' }];
const VALID = ['acme/billing', 'Acme-Org/billing.app', 'acme/billing_v2', 'a1/b'];
const names = (msg) => /(?<![\w.-])repo(?![\w])/.test(msg);

test('C5: o scaffold recusa cada valor de repo inválido do corpus, com o nome «repo», e não escreve nada', async () => {
  const { scaffold } = await loadScaffold();
  const bad = [];
  for (const repo of INVALID) {
    const dest = tmp('inv');
    try { await scaffold(ANSWERS({ repo }), { dest }); bad.push(`${JSON.stringify(repo)}: aceite`); continue; } catch (e) {
      if (!names(String(e.message))) bad.push(`${JSON.stringify(repo)}: a mensagem não nomeia repo (${String(e.message).split('\n')[0]})`);
    }
    if (existsSync(dest) && readdirSync(dest).length) bad.push(`${JSON.stringify(repo)}: escreveu ficheiros`);
  }
  assert.deepEqual(bad, []);
});

test('C5: o scaffold aceita cada valor de repo válido do corpus, e o valor aparece no FRAMEWORK.md', async () => {
  const bad = [];
  for (const repo of VALID) {
    try { const { raw } = await generate(ANSWERS({ repo })); if (!raw['FRAMEWORK.md'].includes(repo)) bad.push(`${repo}: não aparece no FRAMEWORK.md`); } catch (e) { bad.push(`${repo}: recusado (${String(e.message).split('\n').slice(0, 3).join(' ')})`); }
  }
  assert.deepEqual(bad, []);
});

for (const [name, answers] of COMBOS.filter(([n]) => n.endsWith('rigorous'))) {
  test(`C5 ${name}: o passo 6 do BOOTSTRAP.md escolhe o tracker GitHub e não diz que o fluxo não usa o tracker`, async () => {
    const { raw } = await generate(answers);
    const b = raw['BOOTSTRAP.md'], bad = [];
    const row6 = b.split(/\r?\n/).find((l) => /^\|\s*6\s*\|/.test(l));
    if (!row6) bad.push('não há linha do passo 6');
    else if (!(/tracker/i.test(row6) && /GitHub/.test(row6))) bad.push('o passo 6 não escolhe o tracker GitHub: ' + row6.slice(0, 160));
    if (/Local markdown/i.test(b)) bad.push('ainda diz «Local markdown»');
    if (/nothing in the flow uses the tracker/i.test(b)) bad.push('ainda diz que nada no fluxo usa o tracker');
    assert.deepEqual(bad, []);
  });
}

for (const [name, answers] of [['en', ANSWERS()], ['pt', ANSWERS_PT()]]) {
  test(`C5 mutação «contrato num ficheiro local» (${name}): o FRAMEWORK.md a mandar ler o contrato de um ficheiro faz falhar o check.cjs`, async () => {
    const { dest } = await generate(answers);
    const before = check(dest);
    edit(dest, 'FRAMEWORK.md', (t) => {
      if (!t.includes(GH)) throw new Error('o FRAMEWORK.md não tem ' + GH + ' (pré-condição)');
      return t.replaceAll(GH, '`cat specs/<feature>/contracts/<n>.md`');
    });
    const r = check(dest);
    const fresh = [...failNames(r.out)].filter((x) => !failNames(before.out).has(x));
    assert.equal(r.status, 1, 'o check.cjs não falhou');
    assert.ok(fresh.length > 0, 'nenhuma linha passou a falhar\n' + fails(r.out));
  });
}
