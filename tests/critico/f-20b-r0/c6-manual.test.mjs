// Ronda −1 do F-20b (#71), C6: o setup e o manual. Oráculos: contagens de texto, a lista do dry run do scaffold, o compat.json contra a fixture da
// 3.2.10, e o único assert autorizado em scripts/scaffold.test.mjs (git diff contra a base).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, BASE, ANSWERS, apaga } from './helpers.mjs';

const ler = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const conta = (t, s) => t.split(s).length - 1;
const secao = (t, n) => { const i = t.search(new RegExp('^## ' + n + '\\. ', 'm')); if (i < 0) return ''; const j = t.slice(i + 1).search(/^## \d+\. /m); return j < 0 ? t.slice(i) : t.slice(i, i + 1 + j); };

test('C6 SKILL new-project: um passo entre o ## 5. e o ## 7. com memoria.mjs --plan e depois memoria.mjs --apply, cada um uma só vez no ficheiro', () => {
  const t = ler('skills/new-project/SKILL.md');
  assert.equal(conta(t, 'memoria.mjs --plan'), 1, 'memoria.mjs --plan');
  assert.equal(conta(t, 'memoria.mjs --apply'), 1, 'memoria.mjs --apply');
  const c5 = t.search(/^## 5\. /m), c7 = t.search(/^## 7\. /m), p = t.indexOf('memoria.mjs --plan'), a = t.indexOf('memoria.mjs --apply');
  assert.ok(c5 >= 0 && c7 > c5, 'faltam os títulos ## 5. e ## 7.');
  assert.ok(p > c5 && p < c7 && a > p && a < c7, `fora do sítio: ## 5.@${c5} plan@${p} apply@${a} ## 7.@${c7}`);
});

test('C6 afirmações falsas removidas: «machine-level and done once» (SKILL) e «done once by forge\'s setup» (FRAMEWORK)', () => {
  assert.equal(conta(ler('skills/new-project/SKILL.md'), 'machine-level and done once'), 0);
  assert.equal(conta(ler('templates/FRAMEWORK.md'), "done once by forge's setup"), 0);
});

test('C6 FRAMEWORK §3: os passos são do memoria.mjs --apply, nunca do install-hooks ou do install-mcp em bruto (embutem o token); o bloco toml mostra a [forge]', () => {
  const s3 = secao(ler('templates/FRAMEWORK.md'), 3);
  assert.ok(s3, 'sem §3');
  assert.ok(s3.includes('memoria.mjs --apply'), '§3 sem memoria.mjs --apply');
  for (const k of ['install-hooks', 'install-mcp']) assert.ok(s3.includes(k), '§3 sem ' + k);
  assert.match(s3, /token/i, '§3 não diz porquê (o token)');
  const blocos = [...s3.matchAll(/```toml\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(blocos.some((b) => /^\[forge\]$/m.test(b) && /^server_url\s*=/m.test(b) && /^data_dir\s*=/m.test(b)), 'nenhum bloco toml do §3 mostra a [forge] com server_url e data_dir');
});

test('C6 FRAMEWORK §9 Known failures: uma linha com o sintoma «ai-memory: OFF» e outra com «ai-memory: CONFLICT», cada uma com causa e ação', () => {
  const s9 = secao(ler('templates/FRAMEWORK.md'), 9);
  const linhas = s9.split('\n').filter((l) => l.startsWith('|'));
  for (const k of ['ai-memory: OFF', 'ai-memory: CONFLICT']) {
    const ls = linhas.filter((l) => l.split('|')[1]?.includes(k));
    assert.equal(ls.length, 1, `§9: ${ls.length} linhas com ${k} no sintoma`);
    const cel = ls[0].split('|').slice(1, -1).map((x) => x.trim());
    assert.equal(cel.length, 3, 'a linha tem de ter sintoma, causa e ação: ' + ls[0]);
    assert.ok(cel.every(Boolean), 'célula vazia: ' + ls[0]);
  }
});

test('C6 compat.json › ai-memory › surface.commands ganha serve, init e mcp-bridge (nomes da fixture 3.2.10); o verifiedWith não muda; os antigos ficam', () => {
  const c = JSON.parse(ler('compat.json')).components['ai-memory'];
  const base = JSON.parse(spawnSync('git', ['show', BASE + ':compat.json'], { cwd: ROOT, encoding: 'utf8' }).stdout).components['ai-memory'];
  for (const k of ['ai-memory serve', 'ai-memory init', 'ai-memory mcp-bridge']) assert.ok(c.surface.commands.includes(k), 'falta ' + k);
  for (const k of base.surface.commands) assert.ok(c.surface.commands.includes(k), 'perdeu ' + k);
  assert.equal(c.verifiedWith, base.verifiedWith);
  const fx = JSON.parse(ler('scripts/fixtures/compat/surface-2026-10-29.json')).sources.find((s) => s.id === 'ai-memory');
  for (const k of ['serve', 'init', 'mcp-bridge']) assert.ok(fx.names.includes(k), 'a fixture não tem ' + k);
});

test('C6 o scaffold (dry run) lista .claude/start-ai-memory.mjs e .claude/hooks/forge-ai-memory.mjs', async () => {
  const { scaffold } = await import(pathToFileURL(join(ROOT, 'scripts/scaffold.mjs')).href);
  const dest = mkdtempSync(join(tmpdir(), 'critico-f20b-dry-'));
  try {
    const { files } = await scaffold(ANSWERS(), { dest, dryRun: true });
    for (const f of ['.claude/start-ai-memory.mjs', '.claude/hooks/forge-ai-memory.mjs']) assert.ok(files.includes(f), 'falta ' + f);
  } finally { apaga(dest); }
});

test('C6 assert autorizado: scripts/scaffold.test.mjs só ganha as duas entradas na lista do dry run, e nada mais muda', () => {
  // compara com a main atual (o merge-base), para que as entradas de outros tickets que a main já tem não contem; sem origin/main, com a base fixa
  const mb = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
  const desde = mb.status === 0 ? mb.stdout.trim() : BASE;
  const d = spawnSync('git', ['diff', '-U0', desde, '--', 'scripts/scaffold.test.mjs'], { cwd: ROOT, encoding: 'utf8' }).stdout.replace(/\r\n/g, '\n');
  const mais = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1).trim());
  const menos = d.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  assert.deepEqual(menos, [], 'linhas removidas ou mudadas');
  assert.deepEqual(mais.sort(), ["'.claude/hooks/forge-ai-memory.mjs',", "'.claude/start-ai-memory.mjs',"]);
});