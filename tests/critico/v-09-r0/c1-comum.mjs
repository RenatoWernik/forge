// V-09 C1 (#133): o caso comum a EN e a PT. No projeto gerado, cada literal está num `code span` e o check está ok; trocar o literal no ficheiro
// põe a FAIL uma linha que estava ok, e essa linha, no caso dos briefs, nomeia o brief sem a regra.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { REGRAS, gerar, conjunto, check, lineState, viradas, fim } from './helpers.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const casos = (nome, lingua) => {
  let antes, P;
  before(async () => { P = await gerar(await conjunto(nome)); antes = check(P); });
  for (const { file, lit } of REGRAS) {
    test(`C1 (${lingua}): ${file} tem \`${lit}\` num code span, a linha do check está ok e, sem o literal, uma linha ok passa a FAIL`, () => {
      const f = join(P, file), t = readFileSync(f, 'utf8');
      assert.match(t, new RegExp('`' + esc(lit) + '[^`\\n]*`'), `${file} não tem o literal num code span`);
      assert.equal(lineState(antes.out, 'briefs'), 'ok', 'a linha dos briefs não está ok no projeto gerado' + fim(antes));
      writeFileSync(f, t.split(lit).join('a manual run'));
      const depois = check(P);
      writeFileSync(f, t);
      assert.equal(depois.status, 1, 'o check passou sem o literal' + fim(depois));
      const v = viradas(antes, depois);
      assert.ok(v.length, 'nenhuma linha que estava ok passou a FAIL' + fim(depois));
      if (file.startsWith('.claude/briefs/')) assert.ok(v.some((l) => l.startsWith('briefs (') && l.includes(basename(file))), 'a linha dos briefs não nomeia ' + basename(file) + ': ' + v.join(' | '));
    });
  }
};