// Seguimentos que o orquestrador decidiu fechar no F-14:
//   #52 ponto 2  o crítico lê só o corpo da issue e os comentários do orquestrador e dos críticos, nunca a Ronda 0 do dev, nos briefs e
//                nos workflows. Oráculo: em cada texto que um crítico lê sobre o contrato (os briefs critic.md e round-minus-1.md, o prompt
//                do crítico do gauntlet-build em todas as rondas, o prompt do gauntlet-attacks), há uma frase com «Round 0» e uma negação
//                (never, not, do not, without, skip, ignore, except), e a linha (o parágrafo) que diz o que se lê nos comentários nomeia o
//                orquestrador e os críticos, sem «all/every comments».
//   #53 ponto 3  C01 e C1 são o mesmo critério. Oráculo: C1 na R1 e qualquer grafia do critério 1 (C01, c1, C001, « C1 ») na R2 dão
//                `redesign` no rigoroso; C1 e C2 continuam diferentes.
//   #53 ponto 1  o texto do workflow já não diz «loop until ours wins». Oráculo: nenhum workflow do template tem /loop\w* until ours wins/.
//   #53 ponto 4  um sameCriterionFailures maior que 2 escala. Oráculo: rigoroso, redesigns 1, value 3, o mesmo critério reprovado na R1,
//                na R2 e na R3 dá `escalate` com condition sameCriterionFailures na R3 (PERGUNTA 2 na #15 sobre o caso redesigns 0).
//   FRAMEWORK.md `locked:` passa a `blocked:` e «edesign» passa a «redesign».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { ROOT, runBuild, args, piece, ESC, B, reasonOf, show, readFileSync } from './helpers.mjs';

const T = (rel) => readFileSync(join(ROOT, 'templates', rel), 'utf8');
const frases = (t) => t.replace(/`/g, '').split(/(?<=[.!?])\s+|\r?\n/).map((s) => s.trim()).filter(Boolean);
const NEG = /\b(never|not|no|do not|don't|without|skip|ignore|except)\b/i;
const semRonda0 = (t) => frases(t).some((f) => /\bRound 0\b/i.test(f) && NEG.test(f));
// os comentários lidos: basta o parágrafo (uma linha do brief ou do prompt), não a mesma frase
const comentarios = (t) => t.replace(/`/g, '').split(/\r?\n/).some((f) => /comments?\b/i.test(f) && /orchestrator/i.test(f) && /critic/i.test(f) && !/(all|every)\s+(the\s+|its\s+)?comments/i.test(f));
const verifica = (nome, t) => {
  const e = [];
  if (!semRonda0(t)) e.push(`${nome}: nenhuma frase exclui a Round 0 do desenvolvedor`);
  if (!comentarios(t)) e.push(`${nome}: nenhuma linha diz que dos comentários só contam os do orquestrador e dos críticos`);
  return e;
};

test('#52: os briefs do crítico (critic.md e round-minus-1.md) excluem a Ronda 0 do dev e leem só os comentários do orquestrador e dos críticos', () => {
  assert.deepEqual(['critic.md', 'round-minus-1.md'].flatMap((b) => verifica(b, T('.claude/briefs/' + b))), []);
});

test('#52: o prompt do crítico do gauntlet-build, na R1 e na R2, exclui a Ronda 0 do dev e lê só os comentários do orquestrador e dos críticos', async () => {
  const x = await runBuild(args(), [{ blocking: [B('C1')] }]);
  assert.ok(x.crit.length >= 2, show(x));
  assert.deepEqual(x.crit.flatMap((c) => verifica(c.opts.label, c.prompt)), []);
});

test('#52: o prompt do crítico da Ronda −1 (gauntlet-attacks) exclui a Ronda 0 e lê só os comentários do orquestrador e dos críticos', () => {
  const src = T('.claude/workflows/gauntlet-attacks.js');
  const m = src.match(/const prompt = p => `([\s\S]*?)`\n/);
  assert.ok(m, 'o prompt do crítico não foi encontrado no gauntlet-attacks.js');
  assert.deepEqual(verifica('gauntlet-attacks', m[1]), []);
});

for (const grafia of ['C01', 'c1', 'C001', ' C1 ']) {
  test(`#53: C1 na R1 e «${grafia}» na R2 são o mesmo critério: redesign no rigoroso`, async () => {
    const x = await runBuild(args(), [{ blocking: [B('C1')] }, { blocking: [B(grafia)] }]);
    assert.equal(reasonOf(x.r?.stopped), 'redesign', show(x));
    assert.equal(x.devs.length, 2, show(x));
  });
}

test('#53 guarda: C1 na R1 e C2 na R2 continuam critérios diferentes (sem redesign na R2)', async () => {
  const x = await runBuild(args(), [{ blocking: [B('C1')] }, { blocking: [B('C2')] }]);
  assert.ok(x.devs.length === 3 && reasonOf(x.r.stopped) !== 'redesign', show(x));
});

test('#53: nenhum workflow do template diz «loop until ours wins» (as rondas têm limite pelo modo)', () => {
  const dir = join(ROOT, 'templates/.claude/workflows');
  const hits = readdirSync(dir).filter((n) => n.endsWith('.js')).flatMap((n) => readFileSync(join(dir, n), 'utf8').split(/\r?\n/).map((l, i) => [n, i + 1, l]).filter(([, , l]) => /loop\w*\s+until\s+ours\s+wins/i.test(l)).map(([n, i, l]) => `${n}:${i}: ${l.trim().slice(0, 120)}`));
  assert.deepEqual(hits, []);
});

test('#53: com redesigns 1 e sameCriterionFailures 3, o mesmo critério reprovado na R1, R2 e R3 escala na R3 (condition sameCriterionFailures)', async () => {
  const x = await runBuild(args({ escalation: ESC({ sameCriterionFailures: 3 }), pieces: [piece({ redesigns: 1 })] }), [{ blocking: [B('C1')] }, { blocking: [B('C1')] }, { blocking: [B('C1')] }]);
  assert.equal(reasonOf(x.r?.stopped), 'escalate', show(x));
  assert.equal(x.r.condition ?? x.r.stopped?.condition, 'sameCriterionFailures', show(x));
  assert.equal(x.devs.length, 3, show(x));
});

test('#53 guarda: com redesigns 1 e sameCriterionFailures 2, o mesmo critério reprovado 2× continua a escalar na R2', async () => {
  const x = await runBuild(args({ pieces: [piece({ redesigns: 1 })] }), [{ blocking: [B('C1')] }, { blocking: [B('C1')] }]);
  assert.equal(reasonOf(x.r?.stopped), 'escalate', show(x));
  assert.equal(x.devs.length, 2, show(x));
});

test('FRAMEWORK.md: já não diz `locked:` nem «edesign»; o bloqueio por ataques sem resultado diz blocked:{reason:"gaps"}', () => {
  const t = T('FRAMEWORK.md');
  assert.deepEqual(t.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => /(^|[^b])locked:/i.test(l) || /\bedesign/i.test(l)).map(([i, l]) => i + ': ' + l.slice(0, 160)), []);
  assert.ok((t.match(/blocked:\{reason:"gaps"/g) ?? []).length >= 2, 'blocked:{reason:"gaps"} aparece menos de 2 vezes');
});
