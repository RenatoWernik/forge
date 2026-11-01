import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scaffold } from './scaffold.mjs';

// The oracle of the error register (F-22a, issue #75): scripts/corpus/learnings/ run through the check.cjs of a generated project, with the clock fixed.
const CORPUS = fileURLToPath(new URL('./corpus/learnings/', import.meta.url));
const { parse, validate } = createRequire(import.meta.url)('../templates/.claude/learnings.cjs');
const FORM = 'learnings: every entry of learnings/ is well formed';
const TODAY = '2026-10-31';
const answers = {
  projectName: 'Acme Billing', language: 'English', mode: 'rigorous', repo: 'acme/billing',
  models: {
    developer: { model: 'sonnet', effort: 'high', reason: 'logic and server code' },
    developerUi: { model: 'opus', effort: 'high', reason: 'rich UI needs a stronger model' },
    critic: { model: 'opus', effort: 'high', reason: 'the critic stays on the strongest model' },
    tester: { model: 'haiku', effort: 'xhigh', reason: 'the batch suite is mechanical work' },
    aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
  },
  memory: { workspace: 'acme', project: 'billing' },
};

let dest;
const DOCS = {}; // CLAUDE.md and AGENTS.md as the scaffold wrote them: every run starts from them
before(async () => {
  dest = await mkdtemp(join(tmpdir(), 'forge-learnings-'));
  await scaffold(answers, { dest });
  for (const f of ['CLAUDE.md', 'AGENTS.md']) DOCS[f] = await readFile(join(dest, f), 'utf8');
  for (const rel of (await readFile(join(CORPUS, 'tree.txt'), 'utf8')).split(/\r?\n/).filter(Boolean)) {
    await mkdir(dirname(join(dest, rel)), { recursive: true });
    await writeFile(join(dest, rel), '// corpus tree\n');
  }
});
after(() => rm(dest, { recursive: true, force: true }));

// learnings/ holds only the given files ({ name: text }); null removes the folder. block: the Learned rules block that .claude/learn.mjs readout writes from them, in CLAUDE.md and AGENTS.md
const run = async (files, args = ['--today', TODAY], block = false) => {
  await rm(join(dest, 'learnings'), { recursive: true, force: true });
  for (const [f, text] of Object.entries(DOCS)) await writeFile(join(dest, f), text);
  if (files) {
    await mkdir(join(dest, 'learnings'), { recursive: true });
    for (const [n, t] of Object.entries(files)) await writeFile(join(dest, 'learnings', n), t);
  }
  const env = { ...process.env, HOME: dest, USERPROFILE: dest, DISABLE_AUTOUPDATER: '1' };
  if (block) assert.equal(spawnSync(process.execPath, ['.claude/learn.mjs', 'readout'], { cwd: dest, encoding: 'utf8', env }).status, 0);
  const r = spawnSync(process.execPath, ['.claude/check.cjs', ...args], { cwd: dest, encoding: 'utf8', env });
  const out = r.stdout + r.stderr;
  return { code: r.status, out, line: out.split(/\r?\n/).find((l) => l.slice(6).startsWith(FORM)) };
};
const mdFiles = async (sub) => (await readdir(join(CORPUS, sub))).filter((n) => n.endsWith('.md')).sort();

for (const n of await mdFiles('valid')) {
  test(`corpus valid/${n}: the learnings line is ok, no FAIL, exit 0`, async () => {
    const r = await run({ '2026-10.md': await readFile(join(CORPUS, 'valid', n), 'utf8') }, undefined, true);
    assert.match(r.line, /^ok {4}/, r.out.slice(-1500));
    assert.equal(r.code, 0, r.out.slice(-1500));
    assert.match(r.out, /All ok\./);
  });
}
for (const n of await mdFiles('invalid')) {
  test(`corpus invalid/${n}: FAIL naming the id and the field of its expect line`, async () => {
    const text = await readFile(join(CORPUS, 'invalid', n), 'utf8');
    const [, id, field] = text.split(/\r?\n/)[0].match(/^<!-- expect: (E-\d+) ([A-Z][A-Z-]*) -->$/);
    const r = await run({ '2026-10.md': text });
    assert.match(r.line, /^FAIL {2}/, r.out.slice(-1500));
    assert.ok(r.line.includes(`${id} ${field}:`), `the detail does not name "${id} ${field}":\n${r.line}`);
    assert.equal(r.code, 1);
  });
}

test('no learnings/ folder, or only its README.md: the line is ok with (no entries)', async () => {
  for (const files of [null, { 'README.md': '# Learnings\n' }]) {
    const r = await run(files);
    assert.equal(r.line, 'ok    ' + FORM + ' (no entries)');
    assert.equal(r.code, 0);
  }
});

test('ids go on across two files of different months, and the entries of each keep the month of their file', async () => {
  const a = await readFile(join(CORPUS, 'valid', 'same-day-review.md'), 'utf8');
  const second = a.replace('# Learnings 2026-10', '# Learnings 2026-11').replace('## E-001', '## E-002').replaceAll('2026-10-20', '2026-11-03').replace('fixed-test-port', 'other-class');
  const r = await run({ '2026-10.md': a, '2026-11.md': second });
  assert.match(r.line, /^ok {4}/, r.out.slice(-1500));
  assert.equal(r.code, 0);
});

test('a file that is not YYYY-MM.md or README.md is a FAIL, whatever it holds', async () => {
  for (const n of ['notes.md', '2026-10.txt', '2026-1.md', '2026-13.md']) {
    const r = await run({ [n]: '# notes\n' });
    assert.match(r.line, /^FAIL {2}/, n);
    assert.ok(r.line.includes(n), r.line);
  }
});

test('--today: a past REVIEW-BY on an open entry is a warn line (exit 0); a date that is not YYYY-MM-DD is a FAIL', async () => {
  const open = (await readFile(join(CORPUS, 'valid', 'climb-and-triggers.md'), 'utf8'));
  const late = await run({ '2026-10.md': open }, ['--today', '2026-11-21'], true);
  assert.ok(late.out.includes('warn  learnings: open entries past their REVIEW-BY (today 2026-11-21): E-005 (2026-11-20)'), late.out.slice(-800));
  assert.equal(late.code, 0);
  const bad = await run({ '2026-10.md': open }, ['--today', '1-11-2026']);
  assert.match(bad.line, /^FAIL {2}/);
  assert.equal(bad.code, 1);
});

// the history rule (C4) on the module: a line cut in the middle is a changed line, and an appended entry needs no blank line
const head = '# Learnings 2026-10\n\n## E-001\n- DATE: 2026-10-20\n- REVIEW-BY: 2026-11-03\n- STATUS: open\n';
const grows = (now, was = head) => validate([], { headTexts: { '2026-10.md': was }, texts: { '2026-10.md': now } }).fails;
test('history: only STATUS lines change, a new entry is appended, CRLF is the same text', () => {
  assert.deepEqual(grows(head.replace('open', 'prevented')), []);
  assert.deepEqual(grows(head + '\n## E-002\n- DATE: 2026-10-21\n'), []);
  assert.deepEqual(grows(head + '## E-002\n- DATE: 2026-10-21\n'), []);
  assert.deepEqual(grows(head.replace(/\n/g, '\r\n')), []);
});
test('history: a line that only grows at its end, a removed entry and a missing file are changes', () => {
  assert.equal(grows(head.replace('REVIEW-BY: 2026-11-03', 'REVIEW-BY: 2026-11-03 hacked')).length, 1);
  assert.equal(grows(head.replace('- DATE: 2026-10-20\n', '')).length, 1);
  assert.equal(grows('# Learnings 2026-10\n').length, 1);
  assert.equal(validate([], { headTexts: { '2026-10.md': head }, texts: {} }).fails.length, 1);
});

test('a path with a drive letter is absolute, whatever the letter and the separator', () => {
  const entry = (path) => parse(`# Learnings 2026-10\n\n## E-001\n- REGRESSION: ${path}\n`, '2026-10.md').entries;
  for (const p of ['C' + ':/x.md', 'd' + ':\\x.md']) assert.ok(validate(entry(p)).fails.some((f) => f.message.startsWith('E-001 REGRESSION: an absolute path')), p);
});

test('parse: the first line must be "# Learnings YYYY-MM" of the file name, and an expect comment before it does not count', () => {
  assert.equal(parse('# Learnings 2026-11\n', '2026-10.md').problems.length, 1);
  assert.equal(parse('## E-001\n', '2026-10.md').problems.length, 1);
  assert.equal(parse('<!-- expect: x -->\n\n# Learnings 2026-10\n', '2026-10.md').problems.length, 0);
});

test('validate fails closed: without an exists function every path of a test/hook/check entry does not exist', () => {
  const e = parse(`# Learnings 2026-10\n\n## E-001\n- PREVENTION: test\n- PREVENTION-PATH: tests/x.test.mjs\n`, '2026-10.md').entries;
  assert.ok(validate(e).fails.some((f) => f.message.startsWith('E-001 PREVENTION-PATH: tests/x.test.mjs does not exist')));
  assert.ok(!validate(e, { exists: () => true }).fails.some((f) => f.message.startsWith('E-001 PREVENTION-PATH')));
});

test('parse: CRLF and a BOM are not a problem', () => {
  const p = parse('﻿<!-- expect: x -->\r\n# Learnings 2026-10\r\n\r\n## E-001\r\n- DATE: 2026-10-20\r\n\r\n', '2026-10.md');
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.entries.map((e) => [e.id, e.fields.length]), [['E-001', 1]]);
});

// class: anything in a YYYY-MM.md that is not the title, a blank line or a valid entry is a problem (an almost-entry would escape every rule)
for (const bad of ['## e-001', '### E-001', '##  E-001', '## E-001 extra', '## E-', '## Notes', '# Learnings 2026-10', 'free text', '-  DATE: 2026-10-20']) {
  test(`parse: «${bad}» in a register file is a problem, with its line`, () => {
    const p = parse(`# Learnings 2026-10\n\n## E-001\n- DATE: 2026-10-20\n${bad}\n- SYMPTOM: s\n`, '2026-10.md');
    assert.ok(p.problems.some((m) => m.startsWith('2026-10.md line 5: ')), JSON.stringify(p.problems));
  });
}
test('parse: the fields below a bad heading belong to no entry, and a comment after the title is a problem', () => {
  const p = parse('# Learnings 2026-10\n\n## E-001\n- DATE: 2026-10-20\n## Notes\n- TRIGGER: bogus\n<!-- x -->\n', '2026-10.md');
  assert.deepEqual(p.entries[0].fields, [['DATE', '2026-10-20']]);
  assert.equal(p.problems.length, 3);
});
test('check: a mistitled entry is a FAIL on the learnings line, not (no entries)', async () => {
  const text = (await readFile(join(CORPUS, 'valid', 'same-day-review.md'), 'utf8')).replace('## E-001', '## e-001');
  const r = await run({ '2026-10.md': text });
  assert.match(r.line, /^FAIL {2}/);
  assert.ok(r.line.includes('2026-10.md line '), r.line);
});
test('check: --today=X is the same as --today X, a bad one is a FAIL', async () => {
  const open = await readFile(join(CORPUS, 'valid', 'climb-and-triggers.md'), 'utf8');
  assert.ok((await run({ '2026-10.md': open }, ['--today=2026-11-21'])).out.includes('(today 2026-11-21): E-005 (2026-11-20)'));
  assert.match((await run({ '2026-10.md': open }, ['--today=1-11-2026'])).line, /^FAIL {2}/);
});
test('history: a BOM is not a change', () => {
  assert.deepEqual(grows('﻿' + head), []);
  assert.deepEqual(grows(head, '﻿' + head), []);
});
// the style line skips the Learned rules block (the register's own words) and still reads the text around it
test('style: a dash inside the Learned rules block is the register\'s text, a dash right after the block is a FAIL', async () => {
  const text = (await readFile(join(CORPUS, 'valid', 'climb-and-triggers.md'), 'utf8')).replace(/^- SYMPTOM: (.*)$/gm, (m, s) => `- SYMPTOM: ${s} — again`);
  const style = (out) => out.split(/\r?\n/).find((l) => l.slice(6).startsWith('style: '));
  const inside = await run({ '2026-10.md': text }, undefined, true);
  assert.ok((await readFile(join(dest, 'CLAUDE.md'), 'utf8')).includes('— again (learnings/'), 'the dash is not in the block');
  assert.match(style(inside.out), /^ok {4}/, inside.out.slice(-800));
  await writeFile(join(dest, 'CLAUDE.md'), (await readFile(join(dest, 'CLAUDE.md'), 'utf8')) + '\nA dash — right after the block.\n');
  const env = { ...process.env, HOME: dest, USERPROFILE: dest, DISABLE_AUTOUPDATER: '1' };
  const after = spawnSync(process.execPath, ['.claude/check.cjs', '--today', TODAY], { cwd: dest, encoding: 'utf8', env });
  assert.match(style(after.stdout), /^FAIL {2}/);
});
// learn.mjs refuses a rule that repeats an invariant by the TITLES of learnings.cjs; check.cjs keeps its own copy of the list
test('the invariant titles of learnings.cjs are the TITLES of check.cjs', async () => {
  const src = await readFile(fileURLToPath(new URL('../templates/.claude/check.cjs', import.meta.url)), 'utf8');
  const { TITLES } = createRequire(import.meta.url)('../templates/.claude/learnings.cjs');
  assert.deepEqual(TITLES, [...src.match(/const TITLES = (\[.*\])/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
});
