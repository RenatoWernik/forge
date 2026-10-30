import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const skill = readFileSync(fileURLToPath(new URL('../skills/update/SKILL.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

test('the skill has the frontmatter of a skill and every literal of the contract', () => {
  assert.match(skill, /^---\nname: update\ndescription: >-\n/);
  for (const literal of [
    '--check', '--apply', '--yes', '--accept-unverified', '--backup-confirmed', '--overwrite', 'forge-backups', 'speckit-project',
    'specify integration upgrade claude', 'claude plugin marketplace update forge', 'claude plugin update forge@forge', 'not tested with forge',
  ]) assert.ok(skill.includes(literal), literal);
});

test('it states that nothing runs without the yes and that the generated files are never rewritten', () => {
  assert.match(skill, /Nothing runs without the user's yes/);
  assert.match(skill, /never rewrites the files already generated/);
});

test('it never passes --force or a list of ids to --apply, and checks before applying', () => {
  assert.ok(!skill.includes('--force'));
  assert.doesNotMatch(skill, /--apply\s+["'`<]?(all|\*|todos|everything)\b/i);
  assert.doesNotMatch(skill, /--apply\s+[\w<>-]+\s*,/);
  assert.ok(skill.indexOf('--check') < skill.indexOf('--apply'));
  assert.match(skill, /update\.mjs"? --apply <id> --yes/);
});

test('the Spec-Kit project is offered only inside a project with .specify/, and the forge plugin apart', () => {
  assert.match(skill, /Only inside a project that has a `\.specify\/` folder/);
  assert.match(skill, /--apply speckit-project --project/);
  assert.match(skill, /--apply forge --yes/);
});

test('a customized skill is recommended to be skipped, and the ai-memory backup is asked apart', () => {
  assert.match(skill, /`customized`[^\n]*It will not be touched/);
  assert.match(skill, /recommend skipping it/);
  assert.match(skill, /`--backup-confirmed`, for ai-memory[^\n]*backup of ai-memory first/);
});
