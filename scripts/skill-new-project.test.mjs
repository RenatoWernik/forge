import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold, decisionNote, main } from './scaffold.mjs';

const skill = (await readFile(fileURLToPath(new URL('../skills/new-project/SKILL.md', import.meta.url)), 'utf8')).replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\s+/g, ' ');

// The steps are the `## N. Title` headings outside code fences; a body runs to the next `## ` (the `###` stay inside).
const prose = skill.replace(/^\s*```[\s\S]*?^\s*```\s*$/gm, '');
const steps = [...prose.matchAll(/^## (\d+)\.\s+(.+?)\s*$/gm)].map((m) => {
  const next = [...prose.matchAll(/^## (?!#)/gm)].map((x) => x.index).find((i) => i > m.index) ?? prose.length;
  return { n: +m[1], title: m[2], body: prose.slice(m.index, next) };
});
const step = (title) => steps.find((s) => s.title === title);

test('the steps are the seven of the contract, in order', () => {
  assert.deepEqual(steps.map((s) => `${s.n}. ${s.title}`), [
    '1. Check the machine', '2. Interview', '3. Ask the setup questions', '4. Install the protection hooks',
    '5. Generate the files', '6. Publish and seed the panel', '7. Run the bootstrap',
  ]);
  for (const sub of ['### Translate the documents', '### Check']) assert.match(step('Generate the files').body, new RegExp(`^${sub}\\s*$`, 'm'));
});

test('the cross references to steps follow the renumbering', () => {
  const t = flat(prose);
  assert.match(t, /language the user chooses in step 3/);
  assert.match(t, /so step 5 translates/);
  assert.match(t, /offer the machine check \(step 1\)/);
});

test('the interview covers the five dimensions, states the certainty and has the stop rule', () => {
  const body = flat(step('Interview').body);
  for (const d of ['UI rica', 'lógica e servidor', 'riscos (segredos, dados, dinheiro, segurança)', 'dimensão e prazo', 'quota']) assert.ok(body.includes(d), d);
  assert.ok(body.includes('State your certainty for each dimension as a percentage.'));
  assert.ok(body.includes('Stop asking when every dimension is at 95 % or more, or when the user says "enough" ("chega").'));
  assert.ok(!/full interview comes with a later release/i.test(flat(skill)));
});

test('the interview proposes the mode and the measured pattern, one row per role, and never chooses for the user', () => {
  const body = step('Interview').body;
  assert.match(body, /`rigorous`/);
  assert.match(body, /`accelerated`/);
  const rows = body.split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/`/g, '').trim()));
  const pattern = { developer: 'Haiku xhigh', developerUi: 'Opus high', critic: 'Opus high', tester: 'Haiku xhigh', aux: 'Opus 5.5 high' };
  for (const [role, value] of Object.entries(pattern)) {
    const mine = rows.filter((r) => r[0] === role);
    assert.equal(mine.length, 1, role);
    assert.ok(mine[0].includes(value), `${role}: ${value}`);
  }
  assert.ok(flat(skill).includes('Never choose a model for the user: propose it with its reason and write it to the answers only after the user says yes.'));
});

test('the protection hooks step is not empty and needs the yes of the user', () => {
  assert.match(step('Install the protection hooks').body.replace(/^## .*$/m, ''), /\byes\b/i);
});

test('the panel step seeds notes/n0001 as a decision with the reason of each role', () => {
  const line = step('Publish and seed the panel').body.split('\n').find((l) => l.includes('notes/n0001'));
  assert.ok(line);
  assert.match(line, /decisao/);
  assert.match(line, /reason/);
});

const answers = {
  projectName: 'Acme', language: 'English', mode: 'accelerated', repo: 'acme/billing',
  models: Object.fromEntries(['developer', 'developerUi', 'critic', 'tester', 'aux'].map((r, i) => [r, { model: 'opus', effort: 'high', reason: `reason ${i} <b> "q" & 95 %` }])),
  memory: { workspace: 'acme', project: 'billing' },
};

test('decisionNote reads the reason of every role back from the forge.json of the project', async () => {
  const dest = await mkdtemp(join(tmpdir(), 'forge-note-'));
  try {
    await scaffold(answers, { dest });
    const note = await decisionNote(dest);
    assert.equal(note.kind, 'decisao');
    for (const [role, m] of Object.entries(answers.models)) assert.ok(note.body.split('\n').some((l) => l.startsWith(`${role}:`) && l.includes(m.reason)), role);
    assert.match(note.body, /mode: accelerated/);
  } finally { await rm(dest, { recursive: true, force: true }); }
});

test('--decision-note prints the note of the project as JSON; without a forge.json it fails', async () => {
  const dest = await mkdtemp(join(tmpdir(), 'forge-note-'));
  try {
    const out = [];
    assert.equal(await main(['--dest', dest, '--decision-note'], (s) => out.push(s)), 2);
    await scaffold(answers, { dest });
    out.length = 0;
    assert.equal(await main(['--dest', dest, '--decision-note'], (s) => out.push(s)), 0);
    assert.deepEqual(JSON.parse(out.join('\n')), await decisionNote(dest));
  } finally { await rm(dest, { recursive: true, force: true }); }
});
