// F-01 critério 2: nenhuma referência ao claude-mem no pacote, e o teste novo do dev apanha-a em qualquer sítio do âmbito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, ABSENCE_TEST, scanHits, copyPackage, runNodeTest, edit, generate, walk, TERM_RE } from './helpers.mjs';

test('C2: o varrimento de templates/, skills/, scripts/, components.json e dos dois READMEs não encontra nenhum termo', () => {
  const hits = scanHits();
  assert.deepEqual(hits, [], hits.length + ' ocorrências:\n' + hits.slice(0, 40).join('\n'));
});

test('C2: os projetos gerados (inglês e português) não têm nenhum termo em nenhum ficheiro', async () => {
  for (const language of ['English', 'Portuguese (Brazil)']) {
    const dest = await generate({ language });
    const hits = walk(dest).filter((f) => TERM_RE.test(readFileSync(f, 'utf8'))).map((f) => f.slice(dest.length + 1));
    assert.deepEqual(hits, [], language);
  }
});

test('C2: existe o teste novo ' + ABSENCE_TEST, () => {
  assert.ok(existsSync(join(ROOT, ABSENCE_TEST)), ABSENCE_TEST + ' não existe');
});

const precondition = () => {
  assert.ok(existsSync(join(ROOT, ABSENCE_TEST)), 'pré-condição: ' + ABSENCE_TEST + ' não existe');
  const clean = runNodeTest(copyPackage(), ABSENCE_TEST);
  assert.equal(clean.status, 0, 'pré-condição: o teste de ausência tem de passar numa cópia limpa do pacote\n' + clean.out.slice(-1500));
};

// Classe: o termo em sítios inesperados do âmbito (pastas com ponto, ficheiros sem extensão, maiúsculas, a meio de uma palavra,
// JSON, toml, HTML, CRLF, outro teste que não é o de ausência). Cada um tem de fazer falhar o teste do dev numa cópia.
const PLANTS = [
  ['templates/.claude/workflows/gauntlet-build.js', (t) => t + '\n// see Claude-Mem\n'],
  ['templates/.claude/workflows/critico-novo.js', () => 'export const x = "smart_outline";\n'],
  ['templates/.gitignore', (t) => t + '.claude-mem/\n'],
  ['templates/.ai-memory.toml', (t) => t + '# CLAUDE_MEM\n'],
  ['templates/.claude/dashboard/panel.html', (t) => t + '<!-- smart_unfold -->\n'],
  ['templates/a/b/c/NOTAS', () => 'usa o mcp-search aqui\r\noutra linha\r\n'],
  ['skills/sync/SKILL.md', (t) => t + '\nUse smart_search.\n'],
  ['skills/new-project/SKILL.md', (t) => t + '\nthe timeline-report skill\n'],
  ['scripts/doctor.mjs', (t) => t + '\n// get_observations\n'],
  ['scripts/critico-outro.test.mjs', () => "// fixture: 'get_tool_uses'\n"],
  ['components.json', (t) => t.replace('"$comment": "', '"$comment": "xclaude-memx ')],
  ['README.md', (t) => t + '\nSee also Claude_Mem.\n'],
  ['README.pt-BR.md', (t) => t + '\nVeja também o CLAUDE-MEM.\n'],
];

for (const [rel, f] of PLANTS) {
  test('C2 oráculo: um termo plantado em ' + rel + ' faz falhar o teste de ausência', () => {
    precondition();
    const dir = copyPackage();
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    edit(dir, rel, f);
    assert.ok(TERM_RE.test(readFileSync(join(dir, rel), 'utf8')), 'o ataque não plantou o termo em ' + rel);
    const r = runNodeTest(dir, ABSENCE_TEST);
    assert.notEqual(r.status, 0, 'o teste de ausência passou com o termo em ' + rel);
  });
}
