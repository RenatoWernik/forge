// F-01 critério 4: o seed meta/framework do painel tem exatamente as 7 chaves, e o FRAMEWORK.md gerado lista as mesmas 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, generate } from './helpers.mjs';

const SEVEN = ['gauntlet', 'ai-memory', 'ponytail', 'sdd', 'tdd', 'mattpocock', 'graphify'].sort();
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const list = (s) => s.split(/,|\band\b|\be\b/).map((x) => x.replace(/[`*\s.]/g, '')).filter(Boolean);

for (const language of ['English', 'Portuguese (Brazil)']) {
  test(`C4: o FW_DEFAULT da página do painel gerada (${language}) tem exatamente as 7 chaves`, async () => {
    const html = read(await generate({ language }), '.claude/dashboard/panel.html');
    const m = html.match(/FW_DEFAULT\s*=\s*(\[[^;]*\]);/);
    assert.ok(m, 'FW_DEFAULT não encontrado no panel.html');
    const keys = JSON.parse(m[1]).map((x) => (Array.isArray(x) ? x[0] : x.key));
    assert.equal(keys.length, 7, 'número de entradas: ' + keys.join());
    assert.deepEqual([...keys].sort(), SEVEN);
  });
}

test('C4: a linha meta/framework do FRAMEWORK.md gerado lista exatamente as 7 chaves', async () => {
  const fw = read(await generate(), 'FRAMEWORK.md');
  const row = fw.split(/\r?\n/).find((l) => /^\|\s*`meta`\s*\|\s*`framework`\s*\|/.test(l));
  assert.ok(row, 'linha | `meta` | `framework` | não encontrada');
  const m = row.match(/`key`:\s*([^|]+)/);
  assert.ok(m, 'a linha não tem a lista `key`: ' + row);
  assert.deepEqual(list(m[1]).sort(), SEVEN, row);
});

test('C4: o seed meta/framework da skill new-project tem exatamente as 7 chaves e a contagem diz 7', () => {
  const skill = readFileSync(join(ROOT, 'skills/new-project/SKILL.md'), 'utf8');
  const line = skill.split(/\r?\n/).find((l) => l.includes('meta/framework'));
  assert.ok(line, 'meta/framework não aparece na skill new-project');
  const m = line.match(/keys\s+(.+?),\s*status\b/);
  assert.ok(m, 'a linha do seed não tem a lista de keys: ' + line);
  assert.deepEqual(list(m[1]).sort(), SEVEN, line);
  const n = line.match(/\bx\s*(\d+)\b/);
  if (n) assert.equal(+n[1], 7, 'a contagem do seed diz ' + n[1]);
});
