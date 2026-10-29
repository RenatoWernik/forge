// F-01 critério 3: projetos em inglês e em português passam o check.cjs com «All ok.», e o --env não tem nenhuma linha do claude-mem.
// Barra: tudo o que não é o claude-mem mantém o comportamento (as outras linhas do check, por nome, ficam iguais às de beb6338).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, BASE, generate, check, lineNames, ENV_ISOLATED, TERM_RE } from './helpers.mjs';

const LANGS = ['English', 'Portuguese (Brazil)'];
// Os ataques «barra» comparam com beb6338: só valem no ramo do F-01 (os tickets seguintes mudam as linhas do check de propósito).
const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const ONLY_F01 = { skip: !/^f-01-/.test(branch) && 'só no ramo do F-01' };

const baselineCheck = () => {
  const r = spawnSync('git', ['show', BASE + ':templates/.claude/check.cjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, 'git show ' + BASE + ' falhou: ' + r.stderr);
  return r.stdout;
};

for (const language of LANGS) {
  test(`C3: um projeto gerado em ${language} passa o check.cjs com «All ok.» e sem FAIL`, async () => {
    const r = check(await generate({ language }));
    assert.equal(r.status, 0, r.out);
    assert.doesNotMatch(r.out, /^FAIL/m);
    assert.match(r.out, /All ok\./);
  });

  test(`C3: o --env de um projeto em ${language} não tem nenhuma linha do claude-mem, e as outras linhas do --env continuam lá`, async () => {
    const r = check(await generate({ language }), ['--env'], ENV_ISOLATED);
    const lines = r.out.split(/\r?\n/);
    assert.deepEqual(lines.filter((l) => TERM_RE.test(l) || /claude.?mem|37777/i.test(l)), [], 'linhas do claude-mem no --env');
    for (const re of [/^(ok|FAIL)\s+ai-memory: server answers/, /^(ok|FAIL)\s+Spec-Kit:/, /^(ok|FAIL)\s+Matt Pocock:/, /^(ok|FAIL)\s+Graphify:/, /^(ok|FAIL)\s+git:/, /^(ok|FAIL)\s+global skills/, /^info {2}CP0:/]) {
      assert.ok(lines.some((l) => re.test(l)), 'o --env perdeu a linha ' + re + '\n' + r.out.slice(0, 2000));
    }
  });
}

test('C3 barra: nenhuma linha do check.cjs (sem --env) de beb6338 desaparece', ONLY_F01, async () => {
  const dest = await generate();
  const now = lineNames(check(dest).out);
  writeFileSync(join(dest, '.claude/check.cjs'), baselineCheck());
  const before = lineNames(check(dest).out);
  assert.ok(before.length > 50, 'a referência correu mal: ' + before.length + ' linhas');
  assert.deepEqual(before.filter((n) => !now.includes(n)), [], 'linhas de beb6338 que desapareceram');
});

test('C3 barra: as linhas do --env de beb6338, menos a do claude-mem, continuam todas lá', ONLY_F01, async () => {
  const dest = await generate();
  const ENV_LINE = /^(ai-memory|claude-mem|Spec-Kit|Matt Pocock|Graphify|git|global skills|constitution|cp-\* tags|CP0)\b/;
  const names = (out) => out.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2}|info {2})/.test(l)).map((l) => l.slice(6)).filter((l) => ENV_LINE.test(l));
  const now = names(check(dest, ['--env'], ENV_ISOLATED).out);
  writeFileSync(join(dest, '.claude/check.cjs'), baselineCheck());
  const before = names(check(dest, ['--env'], ENV_ISOLATED).out).filter((l) => !/^claude-mem/.test(l));
  assert.ok(before.length >= 9, 'a referência correu mal: ' + before.join(' | '));
  assert.deepEqual(before.filter((n) => !now.includes(n)), [], 'linhas do --env de beb6338 que desapareceram');
});
