import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scaffold } from './scaffold.mjs';
import { sync, main } from './sync.mjs';

const PKG = fileURLToPath(new URL('../', import.meta.url));
const ANSWERS = {
  projectName: 'Acme Billing',
  language: 'English',
  mode: 'rigorous',
  models: {
    developer: { model: 'sonnet', effort: 'high', reason: 'logic and server code' },
    developerUi: { model: 'opus', effort: 'high', reason: 'rich UI needs a stronger model' },
    critic: { model: 'opus', effort: 'high', reason: 'the critic stays on the strongest model' },
    tester: { model: 'haiku', effort: 'xhigh', reason: 'the batch suite is mechanical work' },
    aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
  },
  memory: { workspace: 'acmeworks', project: 'invoicing' },
  script: 'sh',
  dashboardUrl: 'https://claude.ai/artifact/AbC123_x-y',
};

const tmp = () => mkdtemp(join(tmpdir(), 'forge-sync-'));
const read = (dir, rel) => readFile(join(dir, rel), 'utf8');
const git = (cwd, ...args) => spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' });

async function project(over = {}) {
  const dir = await tmp();
  await scaffold({ ...ANSWERS, ...over }, { dest: dir });
  return dir;
}

// edits a generated file: replaces a literal piece of its text
async function edit(dir, rel, from, to) {
  const text = await read(dir, rel);
  assert.ok(text.includes(from), `fixture: ${rel} has no "${from}"`);
  await writeFile(join(dir, rel), text.replace(from, to));
}

// applies a patch to a fresh copy of the package templates, exactly as the user would after saying yes
async function applied(patch) {
  const copy = await tmp();
  await cp(join(PKG, 'templates'), copy, { recursive: true });
  const file = join(await tmp(), 'sync.patch');
  await writeFile(file, patch);
  const check = git(copy, 'apply', '--check', file);
  assert.equal(check.status, 0, `git apply --check failed: ${check.stderr}`);
  assert.equal(git(copy, 'apply', file).status, 0);
  return copy;
}

const template = (rel) => readFile(join(PKG, 'templates', rel), 'utf8');

test('an edit on a plain line of a workflow becomes a patch that git applies to the templates and reproduces the edit', async () => {
  const dir = await project();
  const from = 'FRAMEWORK.md does not repeat them.';
  await edit(dir, '.claude/workflows/gauntlet-build.js', from, `${from} Edited in the project.`);
  const { patch, files } = await sync(dir, PKG);
  assert.deepEqual(files, ['.claude/workflows/gauntlet-build.js']);
  const copy = await applied(patch);
  const expected = (await template('.claude/workflows/gauntlet-build.js')).replace(from, `${from} Edited in the project.`);
  assert.equal(await read(copy, '.claude/workflows/gauntlet-build.js'), expected);
});

// a copy of the package with the patch applied: scaffolding from it must give back the edited project, file by file
async function patchedPackage(patch) {
  const pkg = await tmp();
  await cp(join(PKG, 'templates'), join(pkg, 'templates'), { recursive: true });
  await cp(join(PKG, 'scripts'), join(pkg, 'scripts'), { recursive: true });
  const file = join(await tmp(), 'sync.patch');
  await writeFile(file, patch);
  const applyResult = git(join(pkg, 'templates'), 'apply', file);
  assert.equal(applyResult.status, 0, applyResult.stderr);
  return pkg;
}

test('bar: edits to a workflow and to FRAMEWORK.md come back as a patch that git applies, that scaffolds the same project and that never carries the project data', async () => {
  const dir = await project();
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, 'looping until ours wins or the user stops', 'looping until ours wins, the user stops or the budget ends');
  await edit(dir, 'FRAMEWORK.md', 'Orchestrator manual of Acme Billing.', 'Orchestrator manual of Acme Billing (invoicing, acmeworks, panel https://claude.ai/artifact/AbC123_x-y).');
  const { patch, files, leaks } = await sync(dir, PKG);
  assert.deepEqual(files, [wf, 'FRAMEWORK.md']);
  assert.deepEqual(leaks, []);
  for (const secret of ['Acme Billing', 'acmeworks', 'invoicing', 'AbC123_x-y']) assert.ok(!patch.includes(secret), `patch leaks ${secret}`);
  assert.ok(patch.includes('+Orchestrator manual of {{PROJECT_NAME}} ({{MEM_PROJECT}}, {{MEM_WORKSPACE}}, panel {{DASHBOARD_URL}}).'));
  assert.ok(patch.includes("looping until ours wins, the user stops or the budget ends"));
  assert.ok(patch.includes('per piece, {{developer}} builds')); // context lines keep the markers of the template
  const pkg = await patchedPackage(patch);
  const { scaffold: scaffoldPatched } = await import(pathToFileURL(join(pkg, 'scripts', 'scaffold.mjs')).href);
  const again = await tmp();
  await scaffoldPatched(ANSWERS, { dest: again });
  for (const rel of [wf, 'FRAMEWORK.md', 'CLAUDE.md', '.claude/dashboard/panel.html']) assert.equal(await read(again, rel), await read(dir, rel), rel);
});

test('a project nobody edited gives an empty patch, whatever the setup answers were', async () => {
  const variants = [
    {},
    { language: 'Portuguese (Brazil)', script: 'ps', plainStyle: false },
    { dashboardUrl: undefined, models: { ...ANSWERS.models, critic: { model: 'claude-opus-4-1', effort: 'max', label: 'Opus 4.1', reason: 'a stronger critic' }, aux: { model: 'haiku', effort: 'low', reason: 'cheaper panel' } } },
    { language: 'Spanish', langTag: 'es', panelStrings: { running: 'En ejecucion', live: 'en vivo</script>' } },
    { projectName: 'sonnet', memory: { workspace: 'sh', project: 'en' } },
  ];
  for (const over of variants) {
    const { patch, files } = await sync(await project(over), PKG);
    assert.deepEqual(files, [], JSON.stringify(over));
    assert.equal(patch, '');
  }
});

test('values that look like everyday words come back as markers only where the template line carries them', async () => {
  const dir = await project();
  await edit(dir, 'BOOTSTRAP.md', '--script sh` (once', '--script sh` --again sh (once');
  await edit(dir, '.claude/workflows/gauntlet-build.js', "detail: 'registers pieces and agents in the queue', model: 'sonnet'", "detail: 'registers pieces and agents in the queue', model: 'sonnet', note: 'sonnet stays'");
  await writeFile(join(dir, 'CLAUDE.md'), `${await read(dir, 'CLAUDE.md')}Run the sh scripts with sonnet.\n`);
  const { patch } = await sync(dir, PKG);
  assert.ok(patch.includes('--script {{SPECIFY_SCRIPT}}` --again {{SPECIFY_SCRIPT}} (once'));
  assert.ok(patch.includes("model: '{{aux.model}}', note: '{{aux.model}} stays'"));
  assert.ok(patch.includes('+Run the sh scripts with sonnet.\n'), 'an inserted line has no template line to borrow markers from');
  const pkg = await patchedPackage(patch);
  const { scaffold: scaffoldPatched } = await import(pathToFileURL(join(pkg, 'scripts', 'scaffold.mjs')).href);
  const again = await tmp();
  await scaffoldPatched(ANSWERS, { dest: again });
  for (const rel of ['BOOTSTRAP.md', '.claude/workflows/gauntlet-build.js', 'CLAUDE.md']) assert.equal(await read(again, rel), await read(dir, rel), rel);
});

test('deleted lines, lines inserted at the top and a missing final newline are all reproduced', async () => {
  const dir = await project();
  const text = await read(dir, 'FRAMEWORK.md');
  const lines = text.split('\n');
  const dropped = lines[4];
  await writeFile(join(dir, 'FRAMEWORK.md'), `Inserted on top of Acme Billing.\n${lines.filter((l, i) => i !== 4).join('\n').replace(/\n$/, '')}`);
  const { patch } = await sync(dir, PKG);
  assert.ok(patch.includes('+Inserted on top of {{PROJECT_NAME}}.\n'));
  assert.ok(patch.includes(`-${dropped}\n`) || dropped === '');
  assert.ok(patch.includes('\ No newline at end of file'));
  const pkg = await patchedPackage(patch);
  const { scaffold: scaffoldPatched } = await import(pathToFileURL(join(pkg, 'scripts', 'scaffold.mjs')).href);
  const again = await tmp();
  await scaffoldPatched(ANSWERS, { dest: again });
  assert.equal(await read(again, 'FRAMEWORK.md'), await read(dir, 'FRAMEWORK.md'));
});

test('Windows line endings alone are not an edit', async () => {
  const dir = await project();
  await writeFile(join(dir, 'CLAUDE.md'), (await read(dir, 'CLAUDE.md')).replace(/\n/g, '\r\n'));
  assert.equal((await sync(dir, PKG)).patch, '');
});

test('a template the project no longer has (BOOTSTRAP.md after CP0) is reported and skipped, not deleted from the package', async () => {
  const dir = await project();
  await rm(join(dir, 'BOOTSTRAP.md'));
  await edit(dir, 'CLAUDE.md', 'Whoever builds never judges.', 'Whoever builds never judges, ever.');
  const { patch, files, missing } = await sync(dir, PKG);
  assert.deepEqual(missing, ['BOOTSTRAP.md']);
  assert.deepEqual(files, ['CLAUDE.md']);
  assert.ok(!patch.includes('BOOTSTRAP.md'));
});

test('project data the sync cannot recognise (another spelling of the name) is flagged instead of passed on silently', async () => {
  const dir = await project();
  await writeFile(join(dir, 'CLAUDE.md'), `${await read(dir, 'CLAUDE.md')}Owner: ACME BILLING team.\n`);
  const { leaks } = await sync(dir, PKG);
  assert.deepEqual(leaks, [{ file: 'CLAUDE.md', line: 'Owner: ACME BILLING team.' }]);
});

test('the command prints the patch, changes nothing in the project or the package and exits 3 when project data may leak', async () => {
  const dir = await project();
  await edit(dir, 'CLAUDE.md', 'Whoever builds never judges.', 'Whoever builds never judges, ever.');
  const before = [await read(dir, 'CLAUDE.md'), await template('CLAUDE.md')];
  let out = '', err = '';
  assert.equal(await main(['--project', dir, '--package', PKG], (s) => { out += s; }, (s) => { err += `${s}\n`; }), 0);
  assert.match(out, /^diff --git a\/CLAUDE\.md b\/CLAUDE\.md\n/);
  assert.match(err, /1 file\(s\) differ from the templates: CLAUDE\.md/);
  assert.deepEqual([await read(dir, 'CLAUDE.md'), await template('CLAUDE.md')], before);
  await writeFile(join(dir, 'CLAUDE.md'), `${before[0]}Owner: ACME BILLING team.\n`);
  out = err = '';
  assert.equal(await main(['--project', dir, '--package', PKG], (s) => { out += s; }, (s) => { err += `${s}\n`; }), 3);
  assert.match(err, /WARNING possible project data in CLAUDE\.md: Owner: ACME BILLING team\./);
  assert.ok(out.includes('+Owner: ACME BILLING team.'));
});

test('a folder that is not a forge project and a missing --project are refused with a usage message', async () => {
  let err = '';
  assert.equal(await main(['--project', await tmp()], () => {}, (s) => { err += s; }), 2);
  assert.match(err, /not a forge project/);
  err = '';
  assert.equal(await main([], () => {}, (s) => { err += s; }), 2);
  assert.match(err, /--project is required[\s\S]*usage: node sync\.mjs/);
});

// scaffolds the patched package with the given answers: the result must be the edited project, file by file
async function assertRoundTrip(patch, answers, dir, rels) {
  const pkg = await patchedPackage(patch);
  const { scaffold: scaffoldPatched } = await import(pathToFileURL(join(pkg, 'scripts', 'scaffold.mjs')).href);
  const again = await tmp();
  await scaffoldPatched(answers, { dest: again });
  for (const rel of rels) assert.equal(await read(again, rel), await read(dir, rel), rel);
}

test('a line inserted in the same hunk as an edited marker line does not steal its markers', async () => {
  const dir = await project();
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, "  description: 'Build gauntlet", "  // new comment\n  description: 'Build gauntlet");
  await edit(dir, wf, 'or the user stops', 'or the user stops it');
  const { patch, leaks } = await sync(dir, PKG);
  assert.deepEqual(leaks, []);
  assert.ok(patch.includes("+  // new comment\n"));
  assert.ok(patch.includes('per piece, {{developer}} builds (TDD + ponytail) and {{critic}} judges blind against the bar, looping until ours wins or the user stops it'), patch);
  assert.ok(!patch.includes('sonnet high builds'), patch);
  await assertRoundTrip(patch, ANSWERS, dir, [wf]);
});

test('developer and critic on the same model and effort keep their own markers when the line is edited', async () => {
  const same = { ...ANSWERS, models: { ...ANSWERS.models, critic: { model: 'sonnet', effort: 'high', reason: 'same model as the developer' } } };
  const dir = await project(same);
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, 'or the user stops', 'or the user stops it');
  const { patch } = await sync(dir, PKG);
  assert.ok(patch.includes('per piece, {{developer}} builds (TDD + ponytail) and {{critic}} judges blind against the bar, looping until ours wins or the user stops it'), patch);
  await assertRoundTrip(patch, same, dir, [wf]);
});

test('an added line that still holds the models of the project is flagged, since nothing tells which marker it was', async () => {
  const dir = await project();
  await writeFile(join(dir, 'CLAUDE.md'), `${await read(dir, 'CLAUDE.md')}Builds run on sonnet high here.\n`);
  const { leaks } = await sync(dir, PKG);
  assert.deepEqual(leaks, [{ file: 'CLAUDE.md', line: 'Builds run on sonnet high here.' }]);
});

test('an edit that turns a model or effort marker into a fixed value is flagged, so the template keeps following the setup answers', async () => {
  const dir = await project();
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, 'and opus high judges', 'and opus max judges');
  const { patch, leaks } = await sync(dir, PKG);
  const line = "  description: 'Build gauntlet: per piece, {{developer}} builds (TDD + ponytail) and opus max judges blind against the bar, looping until ours wins or the user stops',";
  assert.deepEqual(leaks, [{ file: wf, line }]);
  assert.ok(patch.includes(`+${line}\n`), patch);
  let out = '', err = '';
  assert.equal(await main(['--project', dir, '--package', PKG], (s) => { out += s; }, (s) => { err += `${s}\n`; }), 3);
  assert.ok(err.includes(`WARNING possible project data in ${wf}: ${line}`), err);
  assert.ok(out.includes(`+${line}`));
});

test('a project named with an everyday word (Build) gets no swap where the word is only text of the template, but keeps its name where the template has the marker', async () => {
  const dir = await project({ projectName: 'Build' });
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, 'or the user stops', 'or the user stops it');
  await edit(dir, 'FRAMEWORK.md', 'Orchestrator manual of Build.', 'Orchestrator manual of Build (invoicing).');
  const { patch, leaks } = await sync(dir, PKG);
  assert.deepEqual(leaks, []);
  assert.ok(patch.includes("+  description: 'Build gauntlet: per piece, {{developer}} builds (TDD + ponytail) and {{critic}} judges blind against the bar, looping until ours wins or the user stops it',"), patch);
  assert.ok(patch.includes('+Orchestrator manual of {{PROJECT_NAME}} ({{MEM_PROJECT}}).'), patch);
  assert.ok(!patch.includes('{{PROJECT_NAME}} gauntlet'), patch);
  await assertRoundTrip(patch, { ...ANSWERS, projectName: 'Build' }, dir, [wf, 'FRAMEWORK.md']);
});

test('with an everyday-word project name, the name typed by hand on a new line is still flagged, and the plain word in the template text is not', async () => {
  const dir = await project({ projectName: 'Build' });
  await edit(dir, 'CLAUDE.md', 'Whoever builds never judges.', 'Whoever builds never judges, ever.');
  assert.deepEqual((await sync(dir, PKG)).leaks, []);
  await writeFile(join(dir, 'CLAUDE.md'), `${await read(dir, 'CLAUDE.md')}Owner: Build team.\n`);
  assert.deepEqual((await sync(dir, PKG)).leaks, [{ file: 'CLAUDE.md', line: 'Owner: Build team.' }]);
});

test('with an everyday-word project name, a further copy of the word on an edited marker line is flagged and not swapped for the marker', async () => {
  const dir = await project({ projectName: 'Build' });
  await edit(dir, 'FRAMEWORK.md', 'Orchestrator manual of Build.', 'Orchestrator manual of Build. Build gauntlet runs first.');
  const { patch, leaks } = await sync(dir, PKG);
  const head = 'Orchestrator manual of {{PROJECT_NAME}}. Build gauntlet runs first.';
  assert.ok(patch.includes(`+${head}`), patch);
  assert.equal(leaks.length, 1);
  assert.ok(leaks[0].file === 'FRAMEWORK.md' && leaks[0].line.startsWith(head), leaks[0].line);
  assert.equal(await main(['--project', dir, '--package', PKG], () => {}, () => {}), 3);
});

test('with an everyday-word project name that is also the template text before the marker (Orchestrator), the marker is put back where the name is, not on the template word', async () => {
  const dir = await project({ projectName: 'Orchestrator' });
  await edit(dir, 'FRAMEWORK.md', 'Orchestrator manual of Orchestrator.', 'Orchestrator manual of Orchestrator, edited.');
  const { patch, leaks } = await sync(dir, PKG);
  assert.ok(patch.includes('+Orchestrator manual of {{PROJECT_NAME}}, edited.'), patch);
  assert.deepEqual(leaks, []);
  assert.equal(await main(['--project', dir, '--package', PKG], () => {}, () => {}), 0);
  await assertRoundTrip(patch, { ...ANSWERS, projectName: 'Orchestrator' }, dir, ['FRAMEWORK.md']);
});

test('a value is put back as a marker only as a whole word: "shell" on the script line stays "shell"', async () => {
  const dir = await project();
  await edit(dir, 'BOOTSTRAP.md', '(once, serial;', '(once, in a shell that should, serial;');
  const { patch, leaks } = await sync(dir, PKG);
  assert.ok(patch.includes('--script {{SPECIFY_SCRIPT}}` (once, in a shell that should, serial;'), patch);
  assert.ok(!patch.includes('{{SPECIFY_SCRIPT}}ell'), patch);
  assert.deepEqual(leaks, []);
  await assertRoundTrip(patch, ANSWERS, dir, ['BOOTSTRAP.md']);
});

test('a model typed with a letter or digit stuck to it (sonnet5) is flagged as a frozen value, not turned into {{aux.model}}5', async () => {
  const dir = await project();
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, "detail: 'registers pieces and agents in the queue', model: 'sonnet'", "detail: 'registers pieces and agents in the queue', model: 'sonnet5'");
  const { patch, leaks } = await sync(dir, PKG);
  const line = "    { title: 'Panel', detail: 'registers pieces and agents in the queue', model: 'sonnet5' },";
  assert.ok(patch.includes(`+${line}\n`), patch);
  assert.ok(!patch.includes('{{aux.model}}5'), patch);
  assert.deepEqual(leaks, [{ file: wf, line }]);
  assert.equal(await main(['--project', dir, '--package', PKG], () => {}, () => {}), 3);
});

test('"opus highest" in place of "opus high" is flagged as a frozen value, not turned into {{critic}}est', async () => {
  const dir = await project();
  const wf = '.claude/workflows/gauntlet-build.js';
  await edit(dir, wf, 'and opus high judges', 'and opus highest judges');
  const { patch, leaks } = await sync(dir, PKG);
  const line = "  description: 'Build gauntlet: per piece, {{developer}} builds (TDD + ponytail) and opus highest judges blind against the bar, looping until ours wins or the user stops',";
  assert.ok(patch.includes(`+${line}\n`), patch);
  assert.ok(!patch.includes('{{critic}}est'), patch);
  assert.deepEqual(leaks, [{ file: wf, line }]);
  assert.equal(await main(['--project', dir, '--package', PKG], () => {}, () => {}), 3);
});
