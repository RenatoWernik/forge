// claude-mem left the framework (F-01): no file of the package mentions it, and the component tables of the READMEs list the 7 that remain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SELF = 'scripts/sem-claude-mem.test.mjs';
const TERMS = /claude[-_]mem|mcp-search|smart_|get_observations|get_tool_uses|timeline/i;
const SCOPE = ['templates', 'skills', 'scripts', 'components.json', 'README.md', 'README.pt-BR.md', '.claude-plugin'];
const READMES = ['README.md', 'README.pt-BR.md'];

const files = (path) => statSync(path).isDirectory() ? readdirSync(path).flatMap((n) => files(join(path, n))) : [path];

test('no file of the package mentions claude-mem or its tools', () => {
  const hits = [];
  for (const abs of SCOPE.flatMap((s) => files(join(ROOT, s)))) {
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel === SELF) continue;
    readFileSync(abs, 'utf8').split(/\r?\n/).forEach((l, i) => { if (TERMS.test(l)) hits.push(`${rel}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(hits, []);
});

for (const readme of READMES) {
  test(`${readme}: the component table has 7 numbered rows, and the heading says 7`, () => {
    const lines = readFileSync(join(ROOT, readme), 'utf8').split(/\r?\n/);
    const h = lines.findIndex((l) => /^## .*\bcomponen(ts|tes)\b/i.test(l));
    assert.ok(h >= 0, 'heading of the components not found');
    assert.match(lines[h], /\b7\b/);
    const start = lines.findIndex((l, i) => i > h && l.startsWith('|'));
    const end = lines.findIndex((l, i) => i > start && !l.startsWith('|'));
    const rows = lines.slice(start + 2, end < 0 ? undefined : end); // without the header and the separator
    assert.deepEqual(rows.map((r) => r.split('|')[1].trim()), ['1', '2', '3', '4', '5', '6', '7']);
  });
}

// The READMEs describe forge v2 (F-14): the literal identifiers that a translation never changes, section by section.
const V2 = {
  'the two modes': [/## (The two modes|Os 2 modos)/, ['rigorous', 'accelerated', 'GitHub Issues']],
  'the panel': [/## (The panel|O painel)/, ['panel.html', 'painel.json', 'painel/estado', 'painel/vida', 'forge-painel', 'mod']],
  'the hooks': [/## (The three protection hooks|Os três hooks de proteção)/, ['killByName', 'backgroundTests', 'idleWatch', 'forge-matar-por-nome', 'forge-testes-em-primeiro-plano', 'forge-vigia-de-agentes']],
  'the update': [/## (Update|Atualização)/, ['/forge:update', '--check', '--accept-unverified', '--backup-confirmed', '--overwrite']],
  'the requirements': [/## (Requirements|Requisitos)/, ['Node 22.1']],
};
const section = (text, re) => {
  const ls = text.split(/\r?\n/), i = ls.findIndex((l) => re.test(l)), j = ls.findIndex((l, k) => k > i && /^## /.test(l));
  return i < 0 ? '' : ls.slice(i, j < 0 ? undefined : j).join('\n');
};
for (const readme of READMES) {
  test(`${readme}: the sections of v2 carry their literal terms, and the 3 skills are named`, () => {
    const text = readFileSync(join(ROOT, readme), 'utf8');
    const missing = Object.entries(V2).flatMap(([name, [re, terms]]) => terms.filter((t) => !section(text, re).includes(t)).map((t) => `${name}: ${t}`));
    assert.deepEqual(missing, []);
    assert.deepEqual(['/forge:new-project', '/forge:update', '/forge:sync'].filter((s) => !text.includes(s)), []);
  });
}