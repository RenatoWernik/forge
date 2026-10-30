// F-14 critério 1: o passo 8 do BOOTSTRAP.md valida os 4 workflows (gauntlet-attacks, gauntlet-build, gauntlet-batch e
// gauntlet-ponytail) com args que o check.cjs valida.
// Oráculo (o do contrato): as linhas `bootstrap: args` do check.cjs para os 4 blocos, mais a mutação que parte um campo de cada bloco.
// Leitura do crítico (PERGUNTA 4 na #15):
//   - cada workflow tem pelo menos uma linha do check cujo nome começa por «bootstrap: args» e nomeia o workflow;
//   - o workflow de cada bloco ```json do BOOTSTRAP.md lê-se pelos campos dele: `units` = ponytail; `pieces` + `testCommand` = batch;
//     `pieces` + `attacks` = build; `pieces` sem `attacks` = attacks. Se não houver bloco próprio do attacks, o bloco do build serve
//     os dois (o texto atual: «the args below without attacks»);
//   - a mutação apaga o campo central do bloco (`pieces`, ou `units`): o check sai ≠ 0, a linha `bootstrap: args` de cada workflow
//     desse bloco fica FAIL, e as linhas dos workflows que não usam esse bloco continuam ok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { gerar, corpusAnswers, check, linhas, allOk, falhas, readFileSync, writeFileSync } from './helpers.mjs';

const WF = ['gauntlet-attacks', 'gauntlet-build', 'gauntlet-batch', 'gauntlet-ponytail'];
const FENCE = /```json\r?\n([\s\S]*?)\r?\n```/g;
const boot = (l) => l.name.startsWith('bootstrap: args');
const nomeia = (l, w) => new RegExp(`\\b${w}\\b`).test(l.name);

const blocos = (text) => {
  const bs = [...text.matchAll(FENCE)].map((m) => ({ raw: m[1], obj: JSON.parse(m[1]) }));
  for (const b of bs) {
    const o = b.obj;
    b.usos = o.units ? ['gauntlet-ponytail'] : o.pieces && o.testCommand ? ['gauntlet-batch'] : o.pieces && o.attacks ? ['gauntlet-build'] : o.pieces ? ['gauntlet-attacks'] : [];
  }
  if (!bs.some((b) => b.usos.includes('gauntlet-attacks'))) for (const b of bs) if (b.usos.includes('gauntlet-build')) b.usos.push('gauntlet-attacks');
  return bs;
};

for (const mode of ['rigorous', 'accelerated']) {
  test(`C1 (${mode}): o check.cjs de um projeto gerado tem uma linha «bootstrap: args» ok para cada um dos 4 workflows e acaba em «All ok.»`, async () => {
    const proj = await gerar({ ...corpusAnswers('en-plain-published'), mode });
    const r = check(proj);
    assert.ok(allOk(r), falhas(r.out));
    const ls = linhas(r.out).filter(boot);
    for (const w of WF) assert.ok(ls.some((l) => nomeia(l, w) && l.state === 'ok'), `nenhuma linha «bootstrap: args» ok nomeia ${w}; linhas: ${JSON.stringify(ls)}`);
  });
}

test('C1: os blocos json do passo 8 do BOOTSTRAP.md, lidos pelos campos, cobrem os 4 workflows', async () => {
  const proj = await gerar({ ...corpusAnswers('en-plain-published'), mode: 'rigorous' });
  const bs = blocos(readFileSync(join(proj, 'BOOTSTRAP.md'), 'utf8'));
  assert.deepEqual([...new Set(bs.flatMap((b) => b.usos))].sort(), [...WF].sort(), JSON.stringify(bs.map((b) => ({ campos: Object.keys(b.obj), usos: b.usos }))));
});

test('C1 mutação: apagar o campo central de cada bloco do passo 8 faz FAIL na linha «bootstrap: args» do workflow desse bloco, e só nessa', async () => {
  const proj = await gerar({ ...corpusAnswers('en-plain-published'), mode: 'rigorous' });
  const file = join(proj, 'BOOTSTRAP.md'), orig = readFileSync(file, 'utf8');
  const bs = blocos(orig);
  assert.ok(bs.length >= 2, 'o BOOTSTRAP.md tem ' + bs.length + ' blocos json');
  const erros = [];
  for (const [i, b] of bs.entries()) {
    const campo = 'pieces' in b.obj ? 'pieces' : 'units' in b.obj ? 'units' : 'checkpoint';
    const { [campo]: _, ...partido } = b.obj;
    let k = -1;
    writeFileSync(file, orig.replace(FENCE, (m, raw) => (++k === i ? m.replace(raw, JSON.stringify(partido, null, 1)) : m)));
    const r = check(proj);
    const ls = linhas(r.out).filter(boot);
    if (r.status === 0) erros.push(`bloco ${i} (${b.usos}) sem «${campo}»: o check sai 0`);
    for (const w of b.usos) if (!ls.some((l) => l.state === 'FAIL' && nomeia(l, w))) erros.push(`bloco ${i} sem «${campo}»: nenhuma linha «bootstrap: args» de ${w} em FAIL; ${JSON.stringify(ls)}`);
    for (const w of WF.filter((x) => !b.usos.includes(x))) {
      const so = ls.filter((l) => nomeia(l, w) && !b.usos.some((u) => nomeia(l, u)));
      if (!so.length || so.some((l) => l.state !== 'ok')) erros.push(`bloco ${i} sem «${campo}»: a linha «bootstrap: args» de ${w}, que não usa o bloco, não está ok; ${JSON.stringify(so)}`);
    }
  }
  writeFileSync(file, orig);
  assert.deepEqual(erros, []);
});
