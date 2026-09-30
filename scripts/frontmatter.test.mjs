import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = fileURLToPath(new URL('../', import.meta.url));

// ponytail: YAML subset (flat `key: value`, double-quoted, single-quoted, plain and |/> block
// scalars), no dependencies; switch to a real YAML parser the day a SKILL.md needs nesting or lists.
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) throw new Error('no frontmatter block between --- lines');
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!kv) throw new Error(`not a "key: value" line: ${line}`);
    const [, key, raw = ''] = kv;
    const value = raw.trim();
    if (/^[|>][+-]?$/.test(value)) {
      const body = [];
      while (i + 1 < lines.length && /^([ \t]+|$)/.test(lines[i + 1])) body.push(lines[++i].trim());
      out[key] = body.join(value[0] === '|' ? '\n' : ' ').trim();
    } else if (value.startsWith('"')) {
      try { out[key] = JSON.parse(value); } catch { throw new Error(`bad double-quoted value for ${key}: ${value}`); }
    } else if (value.startsWith("'")) {
      if (!/^'([^']|'')*'$/.test(value)) throw new Error(`bad single-quoted value for ${key}: ${value}`);
      out[key] = value.slice(1, -1).replaceAll("''", "'");
    } else {
      if (/^[&*!%@`\[\]{}>|?,-]/.test(value)) throw new Error(`plain value for ${key} starts with a YAML indicator: ${value}`);
      if (/:(\s|$)/.test(value)) throw new Error(`plain value for ${key} contains ": " (quote it or use a block): ${value}`);
      if (/\s#/.test(value)) throw new Error(`plain value for ${key} contains " #" (quote it or use a block): ${value}`);
      out[key] = value;
    }
  }
  return out;
}

async function skillFiles(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) found.push(...(await skillFiles(p)));
    else if (e.name === 'SKILL.md') found.push(p);
  }
  return found;
}

test('every SKILL.md of the package has valid YAML frontmatter with name and description', async () => {
  const files = await skillFiles(PKG);
  assert.ok(files.length >= 2, `expected at least 2 SKILL.md files, found ${files.length}`);
  for (const file of files) {
    const fm = parseFrontmatter(await readFile(file, 'utf8'));
    assert.match(fm.name ?? '', /^[a-z0-9][a-z0-9-]*$/, `${file}: name`);
    assert.ok((fm.description ?? '').length > 0, `${file}: description is empty`);
  }
});

test('a plain description holding ": " is rejected, the way YAML rejects it', () => {
  const bad = '---\nname: x\ndescription: Sets up a project: checks the machine\n---\n# x\n';
  assert.throws(() => parseFrontmatter(bad), /contains ": "/);
});

test('the same description in double quotes or in a block parses to the full text', () => {
  const quoted = parseFrontmatter('---\nname: x\ndescription: "Sets up a project: checks the machine"\n---\n');
  const block = parseFrontmatter('---\nname: x\ndescription: >-\n  Sets up a project: checks\n  the machine\n---\n');
  assert.equal(quoted.description, 'Sets up a project: checks the machine');
  assert.equal(block.description, 'Sets up a project: checks the machine');
});
