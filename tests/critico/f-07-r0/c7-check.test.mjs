// F-07, a verificação `node .claude/check.cjs` dos critérios 1, 3, 4 e 6: os projetos do corpus ficam em «All ok.» nos dois modos e
// nas duas línguas, e o check DÁ POR um workflow que quebra o contrato (uma mutação que passa é um invariante sem verificação).
// Oráculo: mutações num projeto gerado. Cada uma acrescenta, logo a seguir ao meta do workflow, um prelúdio que muda o
// comportamento sem tocar no código do dev (embrulha o agent() ou reescreve os args); o check tem de sair com 1. Um prelúdio neutro
// (controlo) tem de deixar o check em «All ok.», para provar que a falha vem da mutação e não do prelúdio.
// Mais: os exemplos de args do FRAMEWORK.md e do BOOTSTRAP.md (os «modelos de ticket» que o utilizador copia) com um critério
// absoluto sem oracle fazem o check falhar.
// Depende do F-06: só a mutação «sem o brief da Ronda −1». Leitura da PERGUNTA 2 (args.attacks) na mutação «salta a Ronda −1».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ATTACKS, BUILD, MODES, ANSWERS, generate, check, fails, R0_BYPASS } from './helpers.mjs';

const WF = '.claude/workflows';
const META = /^export const meta = \{[\s\S]*?^\}/m;
const withPrelude = (dest, file, prelude) => {
  const f = join(dest, WF, file);
  assert.ok(existsSync(f), `${file} não existe no projeto gerado`);
  const src = readFileSync(f, 'utf8'), m = src.match(META);
  assert.ok(m, `${file}: sem meta`);
  writeFileSync(f, src.slice(0, m.index + m[0].length) + '\n;' + prelude + ';\n' + src.slice(m.index + m[0].length));
};
const wrap = (body) => `{ const __a = agent; agent = ${body} }`;
const TEXT = ['objective', 'input', 'fails', 'outOfScope', 'env', 'output'];
const FILL = `if (args && Array.isArray(args.pieces)) args = { ...args, pieces: args.pieces.map(p => p && typeof p === 'object' ? { ...p, issue: Number.isInteger(p.issue) && p.issue > 0 ? p.issue : 4242, ${TEXT.map((k) => `${k}: typeof p.${k} === 'string' && p.${k}.trim() ? p.${k} : 'mutant ${k}'`).join(', ')}, criteria: (Array.isArray(p.criteria) && p.criteria.length ? p.criteria : [{}]).map(c => ({ text: c && typeof c.text === 'string' && c.text.trim() ? c.text : 'mutant text', command: c && typeof c.command === 'string' && c.command.trim() ? c.command : 'node --test', oracle: c && ['corpus', 'property', 'reference', 'threshold'].includes(c.oracle) ? c.oracle : 'corpus' })) } : p) }`;
const ISSUE = "if (args && Array.isArray(args.pieces)) args = { ...args, pieces: args.pieces.map(p => p && typeof p === 'object' ? { ...p, issue: Number.isInteger(p.issue) && p.issue > 0 ? p.issue : 4242 } : p) }";

for (const language of ['English', 'Portuguese']) {
  for (const mode of MODES) {
    test(`C7 corpus: um projeto gerado (${language}, ${mode}) tem o gauntlet-attacks e fica em «All ok.»`, async () => {
      const { dest } = await generate(ANSWERS({ language, mode }));
      assert.ok(existsSync(join(dest, WF, ATTACKS)), 'o projeto gerado não tem .claude/workflows/gauntlet-attacks.js');
      const r = check(dest);
      assert.equal(r.status, 0, fails(r.out));
      assert.match(r.out, /All ok\./);
    });
  }
}

const MUTANTS = [
  ['controlo: prelúdio neutro no gauntlet-attacks e no gauntlet-build', [[ATTACKS, wrap('(p, o) => __a(p, o)')], [BUILD, wrap('(p, o) => __a(p, o)')]], 0],
  ['C1: o gauntlet-build deixa de validar o contrato (os campos em falta são preenchidos antes da validação)', [[BUILD, FILL]], 1],
  ['C1: o gauntlet-attacks deixa de validar o contrato', [[ATTACKS, FILL]], 1],
  ['C1: o gauntlet-build aceita uma peça sem issue', [[BUILD, ISSUE]], 1],
  ['C1: o gauntlet-attacks aceita uma peça sem issue', [[ATTACKS, ISSUE]], 1],
  ['C3: o crítico da Ronda −1 corre com outro modelo', [[ATTACKS, wrap("(p, o) => __a(p, o && o.schema ? { ...o, model: 'zz-mutant' } : o)")]], 1],
  ['C3: o crítico da Ronda −1 corre com outro esforço', [[ATTACKS, wrap("(p, o) => __a(p, o && o.schema ? { ...o, effort: o.effort === 'low' ? 'max' : 'low' } : o)")]], 1],
  ['C3: dois críticos por peça', [[ATTACKS, wrap('async (p, o) => { if (o && o.schema) await __a(p, o); return __a(p, o) }')]], 1],
  ['C3: o prompt deixa de mandar ler a issue com --json body,comments', [[ATTACKS, wrap("(p, o) => __a(String(p).split('--json body,comments').join('--json body'), o)")]], 1],
  ['C3: as lacunas do crítico perdem-se no retorno', [[ATTACKS, wrap('async (p, o) => { const r = await __a(p, o); return r && typeof r === "object" && Array.isArray(r.gaps) ? { ...r, gaps: [] } : r }')]], 1],
  ['C4: o gauntlet-build salta a Ronda −1 (todas as peças com um resultado limpo)', [[BUILD, R0_BYPASS]], 1],
];

for (const [label, edits, code] of MUTANTS) {
  test(`C7 mutação → check ${code ? 'falha' : '«All ok.»'}: ${label}`, async () => {
    const { dest } = await generate(ANSWERS());
    for (const [file, prelude] of edits) withPrelude(dest, file, prelude);
    const r = check(dest);
    assert.equal(r.status, code, code ? 'o check não deu pela mutação:\n' + r.out.slice(-1200) : fails(r.out));
  });
}

test('C7 mutação → check falha (depende do F-06): o prompt do crítico da Ronda −1 deixa de apontar para o brief', async () => {
  const { dest } = await generate(ANSWERS());
  withPrelude(dest, ATTACKS, wrap("(p, o) => __a(String(p).replace(/\\.claude\\/briefs\\/[\\w.-]+\\.md/g, ''), o)"));
  const r = check(dest);
  assert.equal(r.status, 1, 'o check não deu pela mutação:\n' + r.out.slice(-1200));
});

// O 1.º bloco json do FRAMEWORK.md (o que a linha «manual» corre) e o 1.º do BOOTSTRAP.md (os args do gauntlet-build no passo 8)
for (const doc of ['FRAMEWORK.md', 'BOOTSTRAP.md']) {
  test(`C7 modelo de ticket: o exemplo de args do ${doc} com um critério absoluto sem oracle faz o check falhar`, async () => {
    const { dest } = await generate(ANSWERS());
    const f = join(dest, doc), md = readFileSync(f, 'utf8');
    const m = md.match(/```json\r?\n([\s\S]*?)\r?\n```/);
    assert.ok(m, `${doc}: sem bloco json`);
    const ex = JSON.parse(m[1]);
    const p = (ex.pieces || []).find((x) => Array.isArray(x?.criteria) && x.criteria.length);
    assert.ok(p, `${doc}: o exemplo de args não traz peças com o contrato (criteria)`);
    p.criteria[0] = { text: 'The export never drops a row', command: p.criteria[0].command || 'node --test' };
    writeFileSync(f, md.replace(m[1], JSON.stringify(ex, null, 2)));
    const r = check(dest);
    assert.equal(r.status, 1, `o check aceitou o exemplo do ${doc} com «never» sem oracle:\n` + r.out.slice(-1200));
  });
}
