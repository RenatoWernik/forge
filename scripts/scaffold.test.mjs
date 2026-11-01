import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scaffold, setPanelUrl, main } from './scaffold.mjs';
import { fileURLToPath } from 'node:url';

const answers = (over = {}) => ({
  projectName: 'Acme Billing',
  language: 'English',
  mode: 'rigorous',
  repo: 'acme/billing',
  models: {
    developer: { model: 'sonnet', effort: 'high', reason: 'logic and server code' },
    developerUi: { model: 'opus', effort: 'high', reason: 'rich UI needs a stronger model' },
    critic: { model: 'opus', effort: 'high', reason: 'the critic stays on the strongest model' },
    tester: { model: 'haiku', effort: 'xhigh', reason: 'the batch suite is mechanical work' },
    aux: { model: 'sonnet', effort: 'medium', reason: 'panel records only' },
  },
  memory: { workspace: 'acme', project: 'billing' },
  ...over,
});

const tmp = () => mkdtemp(join(tmpdir(), 'forge-scaffold-'));

test('dry run lists the generated tree and writes nothing to the destination', async () => {
  const dest = await tmp();
  const { files } = await scaffold(answers(), { dest, dryRun: true });
  assert.deepEqual([...files].sort(), [
    '.ai-memory.toml',
    '.checkpoints/README.md',
    '.checkpoints/painel.json',
    '.claude/acordar.mjs',
    '.claude/ai-memory.cjs',
    '.claude/briefs/batch.md',
    '.claude/briefs/critic.md',
    '.claude/briefs/dev.md',
    '.claude/briefs/round-minus-1.md',
    '.claude/check.cjs',
    '.claude/dashboard/panel.html',
    '.claude/forge.json',
    '.claude/graph.mjs',
    '.claude/hooks/forge-ai-memory.mjs',
    '.claude/hooks/forge-contexto.mjs',
    '.claude/hooks/forge-retoma.mjs',
    '.claude/painel-gravar.mjs',
    '.claude/painel-leitor.mjs',
    '.claude/painel-vida.mjs',
    '.claude/retoma.mjs',
    '.claude/start-ai-memory.mjs',
    '.claude/workflows/gauntlet-attacks.js',
    '.claude/workflows/gauntlet-batch.js',
    '.claude/workflows/gauntlet-build.js',
    '.claude/workflows/gauntlet-ponytail.js',
    '.graphifyignore',
    '.gitignore',
    'AGENTS.md',
    'BOOTSTRAP.md',
    'CLAUDE.md',
    'FRAMEWORK.md',
  ].sort());
  assert.deepEqual(await readdir(dest), []);
});

const read = (dest, rel) => readFile(join(dest, rel), 'utf8');

test('a real run writes forge.json with the chosen models and fills every marker of the templates', async () => {
  const dest = await tmp();
  await scaffold(answers(), { dest });
  const { escalation, ...saved } = JSON.parse(await read(dest, '.claude/forge.json'));
  assert.deepEqual(saved, {
    language: 'English',
    langTag: 'en',
    plainStyle: true,
    mode: 'rigorous',
    models: answers().models,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(escalation).map(([k, c]) => [k, c.value])), { sameCriterionFailures: 2, attacksRedOnDelivery: true, minutesWithoutProgress: 30, visualBelowReference: true });
  for (const [k, c] of Object.entries(escalation)) assert.match(c.description, /^[^\r\n]+$/, `${k}: one line`);
  const toml = await read(dest, '.ai-memory.toml');
  assert.match(toml, /^workspace = "acme"$/m);
  assert.match(toml, /^project = "billing"$/m);
  const build = await read(dest, '.claude/workflows/gauntlet-build.js');
  assert.match(build.split('\n')[2], /sonnet high builds.*opus high judges/);
  assert.match(await read(dest, 'CLAUDE.md'), /^# Acme Billing$/m);
  for (const rel of (await scaffold(answers(), { dest: await tmp(), dryRun: true })).files) {
    if (rel !== '.claude/check.cjs') assert.doesNotMatch(await read(dest, rel), /\{\{[\w.]+\}\}/, `${rel} still has a marker`);
  }
});

test('invalid answers are all reported at once and nothing is written', async () => {
  const dest = await tmp();
  const bad = answers({
    projectName: '<script>x</script>',
    language: '',
    models: { developer: { model: 'sonnet', effort: 'ultra' }, critic: { model: 'opus', effort: 'high', match: 'gpt' } },
    memory: { workspace: 'has space', project: 'billing' },
  });
  await assert.rejects(scaffold(bad, { dest }), (e) => {
    for (const part of ['projectName', 'language', 'models.developer.effort', 'models.critic.match', 'models.aux', 'memory.workspace']) {
      assert.ok(e.message.includes(part), `${part} missing in: ${e.message}`);
    }
    return true;
  });
  assert.deepEqual(await readdir(dest), []);
});

test('repo is validated as owner/name, named in the error, and the valid value reaches the manual and the bootstrap', async () => {
  const dest = await tmp();
  for (const repo of [undefined, '', 'acme', 'acme/billing/x', 'https://github.com/acme/billing', 'acme/..', 'acme/bil$ling', 7]) {
    await assert.rejects(scaffold(answers({ repo }), { dest }), /^Error: invalid answers:\n(- .*\n)*- repo: /m, String(repo));
  }
  assert.deepEqual(await readdir(dest), []);
  await scaffold(answers({ repo: 'Acme-Org/billing.app' }), { dest });
  for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) assert.doesNotMatch(await read(dest, rel), /\{\{REPO\}\}/, rel);
  assert.match(await read(dest, 'FRAMEWORK.md'), /`Acme-Org\/billing\.app`/);
  assert.match(await read(dest, 'BOOTSTRAP.md'), /tracker = GitHub \(`Acme-Org\/billing\.app`\)/);
});

test('mode, the 5 roles and their reasons are validated all at once, naming each field; a flag never drops the reason of the file', async () => {
  const dest = await tmp();
  const a = answers({ mode: 'turbo' });
  delete a.models.developerUi;
  a.models.critic.reason = '   ';
  a.models.tester.effort = 'ultra';
  await assert.rejects(scaffold(a, { dest }), (e) => {
    for (const part of ['mode:', 'models.developerUi:', 'models.critic.reason:', 'models.tester.effort:']) assert.ok(e.message.includes(part), `${part} missing in: ${e.message}`);
    for (const ok of ['models.developer:', 'models.developer.', 'models.aux']) assert.ok(!e.message.includes(ok), `false alarm ${ok} in: ${e.message}`);
    return true;
  });
  assert.deepEqual(await readdir(dest), []);
  const out = [];
  const code = await main(['--answers', ANSWERS_FILE, '--mode', 'accelerated', '--developer', 'sonnet:max:Lab', '--dest', dest], (m) => out.push(m));
  assert.equal(code, 0, out.join('\n'));
  const saved = JSON.parse(await read(dest, '.claude/forge.json'));
  assert.equal(saved.mode, 'accelerated');
  assert.deepEqual(saved.models.developer, { model: 'sonnet', effort: 'max', label: 'Lab', reason: answers().models.developer.reason });
});

test('the answers example documented in skills/new-project/SKILL.md passes the scaffold without errors', async () => {
  const skill = await readFile(fileURLToPath(new URL('../skills/new-project/SKILL.md', import.meta.url)), 'utf8');
  const example = JSON.parse(skill.slice(skill.indexOf('Write the answers as JSON')).match(/```json\r?\n([\s\S]*?)\r?\n```/)[1]);
  const dest = await tmp();
  const { files } = await scaffold(example, { dest, dryRun: true });
  assert.ok(files.includes('.claude/forge.json'));
  assert.deepEqual(Object.keys(example.models), ['developer', 'developerUi', 'critic', 'tester', 'aux']);
  assert.deepEqual(await readdir(dest), []);
});

test('an existing file is never overwritten without force; a dry run reports the conflict', async () => {
  const dest = await tmp();
  await writeFile(join(dest, 'CLAUDE.md'), 'mine\n');
  await assert.rejects(scaffold(answers(), { dest }), /CLAUDE\.md/);
  assert.deepEqual(await readdir(dest), ['CLAUDE.md']);
  assert.deepEqual((await scaffold(answers(), { dest, dryRun: true })).conflicts, ['CLAUDE.md']);
  await scaffold(answers(), { dest, force: true });
  assert.match(await read(dest, 'CLAUDE.md'), /^# Acme Billing$/m);
});

test('the answers reach the generated documents: scope, panel URL, script type, models and language', async () => {
  const dest = await tmp();
  await scaffold(answers({ script: 'ps', dashboardUrl: 'https://claude.ai/artifact/AbC123_x-y' }), { dest });
  const bootstrap = await read(dest, 'BOOTSTRAP.md');
  assert.match(bootstrap, /--integration claude --script ps/);
  assert.match(bootstrap, /workspace:"acme", project:"billing", path:"_rules\/framework\.md"/);
  assert.match(await read(dest, 'CLAUDE.md'), /https:\/\/claude\.ai\/artifact\/AbC123_x-y/);
  const first = (await read(dest, 'FRAMEWORK.md')).match(/```json\r?\n([\s\S]*?)\r?\n```/)[1];
  assert.deepEqual(JSON.parse(first).models, answers().models);
  assert.equal(JSON.parse(first).language, 'English');
  assert.match(await read(dest, 'FRAMEWORK.md'), /\| Developer \(build and Ponytail\) \| sonnet high \|/);
});

test('without a panel URL the documents carry the pending URL, and setPanelUrl swaps it everywhere', async () => {
  const dest = await tmp();
  await scaffold(answers(), { dest });
  assert.match(await read(dest, 'CLAUDE.md'), /https:\/\/claude\.ai\/artifact\/PANEL-URL-PENDING/);
  const { changed } = await setPanelUrl(dest, 'https://claude.ai/artifact/Real42');
  assert.ok(changed.includes('CLAUDE.md') && changed.includes('FRAMEWORK.md') && changed.includes('BOOTSTRAP.md'));
  for (const rel of changed) assert.doesNotMatch(await read(dest, rel), /PANEL-URL-PENDING/);
  assert.match(await read(dest, 'BOOTSTRAP.md'), /"dashboardUrl":"https:\/\/claude\.ai\/artifact\/Real42"/);
  await assert.rejects(setPanelUrl(dest, 'https://evil.example/x'), /panel URL/);
});

test('the panel page speaks the project language: Portuguese built in, any other through panelStrings', async () => {
  const en = await tmp(), pt = await tmp(), es = await tmp();
  await scaffold(answers(), { dest: en });
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest: pt });
  await scaffold(answers({ language: 'Spanish', langTag: 'es', panelStrings: { running: 'En ejecucion', live: 'en vivo</script>' } }), { dest: es });
  const html = (d) => read(d, '.claude/dashboard/panel.html');
  assert.match(await html(en), /const T = Object\.assign\(\{\}, EN, \{\}\);/);
  assert.match(await html(en), /LANG = "en"/);
  assert.match(await html(pt), /LANG = "pt-BR"/);
  assert.match(await html(pt), /"running":"Executando"/);
  assert.match(await html(es), /LANG = "es"/);
  assert.match(await html(es), /"running":"En ejecucion"/);
  assert.ok(!(await html(es)).includes('"live":"en vivo</script>"'));
  assert.ok((await html(es)).includes('"live":"en vivo\\u003c/script>"'));
  assert.match(await html(pt), /<title>Acme Billing Gauntlet Control<\/title>/);
});

test('a language given as a tag (pt-BR, pt) gets the Portuguese panel, like the language name does', async () => {
  for (const language of ['pt-BR', 'pt']) {
    const dest = await tmp();
    await scaffold(answers({ language }), { dest });
    const html = await read(dest, '.claude/dashboard/panel.html');
    assert.match(html, /LANG = "pt-BR"/, language);
    assert.match(html, /"running":"Executando"/, language);
  }
});

test('plainStyle false drops the style rule from CLAUDE.md and forge.json records it', async () => {
  const dest = await tmp();
  await scaffold(answers({ plainStyle: false }), { dest });
  assert.equal(JSON.parse(await read(dest, '.claude/forge.json')).plainStyle, false);
  assert.doesNotMatch(await read(dest, 'CLAUDE.md'), /No dash, arrow or emoji/);
  const plain = await tmp();
  await scaffold(answers(), { dest: plain });
  assert.match(await read(plain, 'CLAUDE.md'), /No dash, arrow or emoji in the prose of CLAUDE\.md, AGENTS\.md, FRAMEWORK\.md and BOOTSTRAP\.md\./);
});

const CHECK = (cwd) => spawnSync(process.execPath, ['.claude/check.cjs'], { cwd, encoding: 'utf8' });

test('the language is stored canonically, whatever the spelling: "Inglês" gives English/en and the project passes the check with no translation', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Inglês' }), { dest });
  const saved = JSON.parse(await read(dest, '.claude/forge.json'));
  assert.equal(saved.language, 'English');
  assert.equal(saved.langTag, 'en');
  assert.match(await read(dest, 'CLAUDE.md'), /are written in English \(commits/);
  const r = CHECK(dest);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok {4}language: /m);
});

test('"português" gives Portuguese (Brazil)/pt-BR: the Portuguese panel, and the check asks for a Portuguese body', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'português' }), { dest });
  const saved = JSON.parse(await read(dest, '.claude/forge.json'));
  assert.equal(saved.language, 'Portuguese (Brazil)');
  assert.equal(saved.langTag, 'pt-BR');
  assert.match(await read(dest, '.claude/dashboard/panel.html'), /LANG = "pt-BR"/);
  assert.match(await read(dest, 'FRAMEWORK.md'), /"language": ?"Portuguese \(Brazil\)"/);
  const before = CHECK(dest);
  assert.equal(before.status, 1, 'English body under pt-BR');
  assert.match(before.stdout, /^FAIL {2}language: .*not in Portuguese \(Brazil\)/m);
});

// [what the user typed, canonical name, BCP 47 tag]: names of the language in the user's language or in its own, and tags
const SPELLINGS = [
  ['English', 'English', 'en'], ['english', 'English', 'en'], ['Inglés', 'English', 'en'], ['Anglais', 'English', 'en'], ['Englisch', 'English', 'en'], ['en', 'English', 'en'], ['EN', 'English', 'en'],
  ['en-US', 'English (United States)', 'en-US'], ['en_gb', 'English (United Kingdom)', 'en-GB'],
  ['Portuguese (Brazil)', 'Portuguese (Brazil)', 'pt-BR'], ['português (Brasil)', 'Portuguese (Brazil)', 'pt-BR'], ['Portugués', 'Portuguese (Brazil)', 'pt-BR'], ['portugais', 'Portuguese (Brazil)', 'pt-BR'],
  ['Portuguese', 'Portuguese (Brazil)', 'pt-BR'], ['pt', 'Portuguese (Brazil)', 'pt-BR'], ['PT_br', 'Portuguese (Brazil)', 'pt-BR'],
  ['Portuguese (Portugal)', 'Portuguese (Portugal)', 'pt-PT'], ['pt-PT', 'Portuguese (Portugal)', 'pt-PT'], ['Português (Portugal)', 'Portuguese (Portugal)', 'pt-PT'],
  ['Spanish', 'Spanish', 'es'], ['Espanhol', 'Spanish', 'es'], ['Español', 'Spanish', 'es'], ['Español (México)', 'Spanish (Mexico)', 'es-MX'],
  ['Français', 'French', 'fr'], ['Deutsch', 'German', 'de'], ['Italiano', 'Italian', 'it'], ['日本語', 'Japanese', 'ja'], ['  Japonês ', 'Japanese', 'ja'], ['中文', 'Chinese', 'zh'], ['zh-Hans', 'Chinese (Simplified)', 'zh-Hans'],
];

test('every spelling of a language the user might type is stored as the English name plus the BCP 47 tag', async () => {
  for (const [typed, name, tag] of SPELLINGS) {
    const dest = await tmp();
    await scaffold(answers({ language: typed }), { dest });
    const saved = JSON.parse(await read(dest, '.claude/forge.json'));
    assert.deepEqual([saved.language, saved.langTag], [name, tag], typed);
  }
});

test('a language that cannot be normalized is refused with a clear message, and nothing is written', async () => {
  for (const typed of ['Xyzzy', 'Elvish speak', 'pt-XX', 'en-ZZ', 'qq', '1234']) {
    const dest = await tmp();
    await assert.rejects(scaffold(answers({ language: typed }), { dest }), (e) => /language: .*not a language I recognize.*for example English, Inglês, português \(Brasil\) or pt-BR/.test(e.message), typed);
    assert.deepEqual(await readdir(dest), [], typed);
  }
  const out = [];
  assert.equal(await main([...FLAGS.map((f) => (f === 'English' ? 'Xyzzy' : f)), '--dest', await tmp()], (m) => out.push(m)), 2);
  assert.match(out.join('\n'), /language: .*not a language I recognize/);
});

test('an explicit langTag refines the region of the language and is refused when it names another language', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Spanish', langTag: 'es-MX' }), { dest });
  const saved = JSON.parse(await read(dest, '.claude/forge.json'));
  assert.deepEqual([saved.language, saved.langTag], ['Spanish (Mexico)', 'es-MX']);
  await assert.rejects(scaffold(answers({ language: 'English', langTag: 'pt-BR' }), { dest: await tmp() }), /langTag: .*English/);
  await assert.rejects(scaffold(answers({ language: 'English', langTag: 'not a tag' }), { dest: await tmp() }), /langTag/);
});

test('the check follows the langTag of forge.json, not the spelling of the name; an older forge.json without langTag keeps working', async () => {
  const dest = await tmp();
  await scaffold(answers(), { dest });
  const { mode, models, escalation } = JSON.parse(await read(dest, '.claude/forge.json'));
  const write = (o) => writeFile(join(dest, '.claude/forge.json'), JSON.stringify({ plainStyle: true, mode, models, escalation, ...o }));
  await write({ language: 'Anglais', langTag: 'en' });
  assert.equal(CHECK(dest).status, 0, 'English body, tag en');
  await write({ language: 'Anglais', langTag: 'pt-BR' });
  const wrong = CHECK(dest);
  assert.equal(wrong.status, 1, 'English body, tag pt-BR');
  assert.match(wrong.stdout, /^FAIL {2}language: .*not in Anglais/m);
  await write({ language: 'English' });
  assert.equal(CHECK(dest).status, 0, 'no langTag: falls back to the name');
  await write({ language: 'Portuguese (Brazil)' });
  assert.equal(CHECK(dest).status, 1, 'no langTag, Portuguese name, English body');
  await write({ language: 'English', langTag: 'not a tag' });
  assert.equal(CHECK(dest).status, 1, 'a malformed langTag fails the language line');
});

test('the generated check.cjs passes with no FAIL, in English and in Portuguese, with the CP0 bootstrap present', async () => {
  for (const language of ['English', 'Portuguese (Brazil)']) {
    const dest = await tmp();
    await scaffold(answers({ language }), { dest });
    if (language !== 'English') await rewrite(dest, [], { headings: NATURAL });
    const r = CHECK(dest);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /^FAIL/m);
    assert.match(r.stdout, /^ok {4}bootstrap: args: gauntlet-ponytail/m);
    assert.match(r.stdout, /^ok {4}manual: the args example in FRAMEWORK\.md/m);
    assert.match(r.stdout, /^ok {4}style: no dash, arrow or emoji/m);
    assert.match(r.stdout, /^ok {4}language: /m, language);
    assert.match(r.stdout, /All ok\./);
  }
});

test('the --env check names the machine and project tools that remain, and no line of the removed memory plugin', async () => {
  const dest = await tmp();
  await scaffold(answers(), { dest });
  // no tool on PATH and no reachable ai-memory server: only the line names are read, nothing real is called
  const home = await tmp();
  const env = { ...process.env, PATH: '', Path: '', AI_MEMORY_URL: 'http://127.0.0.1:9', HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: home };
  const r = spawnSync(process.execPath, ['.claude/check.cjs', '--env'], { cwd: dest, encoding: 'utf8', env });
  const names = r.stdout.split(/\r?\n/).filter((l) => /^(ok {4}|FAIL {2}|info {2})/.test(l)).map((l) => l.slice(6).split(':')[0]);
  for (const tool of ['ai-memory', 'Spec-Kit', 'Matt Pocock', 'Graphify', 'git', 'CP0']) assert.ok(names.includes(tool), `${tool} missing in: ${names}`);
  assert.doesNotMatch(r.stdout, /claude.?mem|37777/i);
});

test('the panel seed and the FRAMEWORK.md table list exactly the 7 framework keys, in English and in Portuguese', async () => {
  const KEYS = ['gauntlet', 'ai-memory', 'ponytail', 'sdd', 'tdd', 'mattpocock', 'graphify'];
  for (const language of ['English', 'Portuguese (Brazil)']) {
    const dest = await tmp();
    await scaffold(answers({ language }), { dest });
    const panel = await read(dest, '.claude/dashboard/panel.html');
    assert.deepEqual([...panel.match(/const FW_DEFAULT = (\[.*\]);/)[1].matchAll(/\["([\w-]+)","/g)].map((m) => m[1]), KEYS, language);
    const row = (await read(dest, 'FRAMEWORK.md')).split('\n').find((l) => l.startsWith('| `meta` | `framework` |'));
    assert.deepEqual(row.split('`key`: ')[1].replace(/\s*\|\s*$/, '').split(', '), KEYS, language);
  }
});

// Stand-in for the translation step of the new-project skill: prose outside code fences and backticks becomes one sentence of the target language per line
// (list markers, table bars, code and backtick spans stay), headings are renamed freely. Unmapped headings become a generic word: no heading text is special.
const LINE = {
  pt: 'Esta parte descreve o que o agente faz para cada peça, com o teste e a evidência que não podem faltar.',
  es: 'Esta parte describe lo que hace el agente para cada pieza, con la prueba y la evidencia que no pueden faltar.',
};
const NATURAL = { '## Step 8': '## Etapa 8', '## 5. Checkpoint script': '## 5. Script do checkpoint', '## 1. Roles and models': '## 1. Funções e modelos' };
const translate = (text, { line = LINE.pt, headings = {}, prose = true } = {}) => {
  let fence = false;
  return text.split(/\r?\n/).map((l) => {
    if (/^\s*```/.test(l)) { fence = !fence; return l; }
    if (fence || !l.trim() || /^[|\s:-]+$/.test(l)) return l;
    if (l.startsWith('#')) return headings[l] ?? l.replace(/^(#{2,} )(\d+\. )?.*$/, '$1$2Seção');
    if (!prose) return l;
    return l.match(/^\s*(?:[-*] |\d+\. |> |\| )?/)[0] + line + (l.includes('Verifies:') ? ' Verifica: ' : ' ') + (l.match(/`[^`]*`/g) ?? []).join(' ');
  }).join('\n');
};
// the files of the language check: the four documents, the four role briefs and the format of the checkpoints
const BRIEFS = ['dev', 'critic', 'round-minus-1', 'batch'].map((b) => `.claude/briefs/${b}.md`);
const PROSE = ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md', 'BOOTSTRAP.md', ...BRIEFS, '.checkpoints/README.md'];
const rewrite = async (dest, rules, opts) => {
  for (const rel of PROSE) {
    const text = opts ? translate(await read(dest, rel), opts) : await read(dest, rel);
    await writeFile(join(dest, rel), rules.reduce((t, [from, to]) => t.replaceAll(from, to), text));
  }
};

test('the generated check reads the language of the body text: a natural translation with new headings passes, headings alone and the wrong language fail', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest });
  const untranslated = CHECK(dest);
  assert.equal(untranslated.status, 1, untranslated.stdout);
  assert.match(untranslated.stdout, /^FAIL {2}language: /m);
  for (const rel of ['CLAUDE.md', 'FRAMEWORK.md', 'BOOTSTRAP.md']) assert.ok(untranslated.stdout.includes(rel), rel + ' not named');

  await rewrite(dest, [], { headings: NATURAL, prose: false });
  const headingsOnly = CHECK(dest);
  assert.equal(headingsOnly.status, 1, 'headings in Portuguese over an English body: ' + headingsOnly.stdout);
  assert.match(headingsOnly.stdout, /^FAIL {2}language: .*FRAMEWORK\.md/m);

  const natural = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest: natural });
  await rewrite(natural, [], { headings: NATURAL });
  const translated = CHECK(natural);
  assert.equal(translated.status, 0, translated.stdout);
  assert.match(translated.stdout, /^ok {4}language: /m);

  const es = await tmp();
  await scaffold(answers({ language: 'Spanish', langTag: 'es' }), { dest: es });
  assert.equal(CHECK(es).status, 1, 'English body under a Spanish forge.json');
  await rewrite(es, [], { line: LINE.es });
  assert.equal(CHECK(es).status, 0, 'any non-English language: the English is gone from the body');
  const ptOnEs = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest: ptOnEs });
  await rewrite(ptOnEs, [], { line: LINE.es });
  assert.equal(CHECK(ptOnEs).status, 1, 'Spanish body under a Portuguese forge.json');

  const en = await tmp();
  await scaffold(answers(), { dest: en });
  await rewrite(en, [], { headings: NATURAL });
  assert.equal(CHECK(en).status, 1, 'Portuguese under an English forge.json');
});

test('the generated check scores each section: a Portuguese CLAUDE.md with some sections still in English fails and names them', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest });
  const original = await read(dest, 'CLAUDE.md');
  await rewrite(dest, [], { headings: NATURAL });
  const KEPT = ['## User global rules', '## Where things are', '## Style', '## Generated blocks'];
  const mixed = original.split(/^(?=## )/m).map((s) => (KEPT.some((k) => s.startsWith(k)) ? s : translate(s, { headings: NATURAL, line: LINE.pt.repeat(2) }))).join('');
  await writeFile(join(dest, 'CLAUDE.md'), mixed);
  const r = CHECK(dest);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^FAIL {2}language: .*\(not in Portuguese \(Brazil\): CLAUDE\.md \[User global rules, Where things are, Style\]\)$/m);
});

test('the generated check scores each sub-step too: a Portuguese FRAMEWORK.md with steps 4 to 7 of section 5 still in English fails and names them', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest });
  const original = await read(dest, 'FRAMEWORK.md');
  const KEPT = /^### Step [4-7]\./;
  const mixed = original.split(/^(?=#{2,} )/m).map((s) => (KEPT.test(s) ? s : translate(s, { headings: NATURAL, line: LINE.pt.repeat(2) }))).join('');
  await writeFile(join(dest, 'FRAMEWORK.md'), mixed);
  for (const rel of PROSE.filter((f) => f !== 'FRAMEWORK.md')) await writeFile(join(dest, rel), translate(await read(dest, rel), { headings: NATURAL }));
  const r = CHECK(dest);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^FAIL {2}language: .*\(not in Portuguese \(Brazil\): FRAMEWORK\.md \[Step 4\. Graphify, Step 5\. Memory, Step 6\. Panel, Step 7\. Approval and tag\]\)$/m);
});

test('a translation that keeps the identifiers leaves the check green; one that renames a key of the args breaks it', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest });
  await rewrite(dest, [['"title":"Step 0: framework"', '"title":"Passo 0: framework"'], ['"title":"gauntlet-build"', '"title":"Gauntlet de construção"']], { headings: NATURAL });
  const kept = CHECK(dest);
  assert.equal(kept.status, 0, kept.stdout);
  assert.match(kept.stdout, /^ok {4}bootstrap: args: gauntlet-build/m);

  await rewrite(dest, [['"checkpoint":{"n":0', '"ponto":{"n":0']]);
  const broken = CHECK(dest);
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /^FAIL {2}bootstrap: args: gauntlet-build/m);
});

test('no generated file carries personal or company data, and the manual keeps its twelve invariants', async () => {
  // built from pieces so this test file does not contain the words it forbids
  const forbidden = new RegExp(['Key' + 'rus', 'Kri' + 'ti', 'One' + 'Drive', 'Ren' + 'ato', 'Wer' + 'nik', 'DGG1' + 'oUcP', 'Users' + '[/' + String.fromCharCode(92) + String.fromCharCode(92) + ']'].join('|'), 'i');
  const dest = await tmp();
  const { files } = await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest });
  for (const rel of files) assert.doesNotMatch(await read(dest, rel), forbidden, rel);
  const claude = await read(dest, 'CLAUDE.md');
  for (let n = 1; n <= 12; n++) assert.ok(claude.includes(`\n${n}. **`), 'invariant ' + n);
  for (const h of ['## Terms', '## Invariants', '## Where things are', '## Style', '## Generated blocks']) assert.ok(claude.includes(h), h);
  const upToBlocks = claude.slice(0, claude.indexOf('## Generated blocks')).split('\n').length + 2;
  assert.ok(upToBlocks < 80, 'CLAUDE.md is ' + upToBlocks + ' lines up to its generated blocks');
});

test('no generated file, in English or Portuguese, cites the skill resolving-merge-conflicts (removed from the Matt Pocock skills)', async () => {
  for (const language of ['English', 'Portuguese (Brazil)']) {
    const dest = await tmp();
    const { files } = await scaffold(answers({ language }), { dest });
    for (const rel of files) assert.doesNotMatch(await read(dest, rel), /resolving-merge-conflicts/, `${language}: ${rel}`);
  }
});

test('the .checkpoints/README.md names the 7 fields of a checkpoint and the file name <role>-<ticket>.md, in the language of the template', async () => {
  const dest = await tmp();
  await scaffold(answers(), { dest });
  const readme = await read(dest, '.checkpoints/README.md');
  assert.ok(readme.includes('`.checkpoints/<role>-<ticket>.md`'));
  for (const field of ['role', 'ticket', 'phase', 'round', 'HEAD', 'next step', 'pending']) assert.match(readme, new RegExp('^\\| `' + field + '` \\|', 'm'), field);
  assert.doesNotMatch(readme, /\b(papel|fase|ronda)\b|pr[óo]ximo passo|pend[êe]ncias/i);
});

test('each of the 4 role briefs opens with the warning that the hook context alerts belong to the orchestrator, within its first 5 lines', async () => {
  const dest = await tmp();
  await scaffold(answers(), { dest });
  for (const rel of BRIEFS) {
    const text = await read(dest, rel);
    const top = text.split('\n').slice(0, 5).join('\n');
    assert.ok(top.includes('`CONTEXT WARNING`') && top.includes('`CONTEXT CRITICAL`') && /orchestrator's session, never to yours/.test(top) && /never a reason to stop/.test(top), rel);
    assert.doesNotMatch(text, /\{\{[\w.]+\}\}/, rel);
  }
});

test('invariants: any one of the 12 items without its label (Verifies: in English, Verifica: in Portuguese) fails the line', async () => {
  for (const [language, label] of [['English', 'Verifies:'], ['Portuguese (Brazil)', 'Verifica:']]) {
    const dest = await tmp();
    await scaffold(answers({ language }), { dest });
    if (language !== 'English') await rewrite(dest, [], { headings: NATURAL });
    const original = await read(dest, 'CLAUDE.md'), lines = original.split('\n');
    assert.match(CHECK(dest).stdout, /^ok {4}invariants: /m, language);
    const items = lines.flatMap((l, i) => (/^\d+\. /.test(l) ? [i] : [])).slice(0, 12);
    assert.equal(items.length, 12, language);
    for (const i of items) {
      assert.ok(lines[i].includes(label), `${language}: item at line ${i + 1} has no ${label}`);
      await writeFile(join(dest, 'CLAUDE.md'), lines.map((l, j) => (j === i ? l.replace(label, 'Seen in:') : l)).join('\n'));
      assert.match(CHECK(dest).stdout, /^FAIL {2}invariants: /m, `${language}: item at line ${i + 1}`);
    }
  }
});

const GH = '`gh issue view <n> --json body,comments`', KEEP = GH + ' and keep a copy in `docs/tickets/<n>.md`';
test('ticket contract: a contract kept in a project file fails the line in each of the four documents, in English and in Portuguese, and in CLAUDE.md and AGENTS.md together the mirror line stays ok', async () => {
  for (const language of ['English', 'Portuguese (Brazil)']) {
    const make = async () => {
      const dest = await tmp();
      await scaffold(answers({ language }), { dest });
      if (language !== 'English') await rewrite(dest, [], { headings: NATURAL });
      return dest;
    };
    const swap = async (dest, rel) => { const t = await read(dest, rel); assert.ok(t.includes(GH), rel); await writeFile(join(dest, rel), t.replaceAll(GH, KEEP)); };
    const ok = await make();
    assert.match(CHECK(ok).stdout, /^ok {4}ticket contract: GitHub Issues/m, language);
    for (const rel of ['CLAUDE.md', 'AGENTS.md', 'FRAMEWORK.md']) {
      const dest = await make();
      await swap(dest, rel);
      assert.match(CHECK(dest).stdout, /^FAIL {2}ticket contract: GitHub Issues/m, `${language} ${rel}`);
    }
    const boot = await make();
    await writeFile(join(boot, 'BOOTSTRAP.md'), (await read(boot, 'BOOTSTRAP.md')) + '\nSave each contract in `docs/tickets/<n>.md`.\n');
    assert.match(CHECK(boot).stdout, /^FAIL {2}ticket contract: GitHub Issues/m, `${language} BOOTSTRAP.md`);
    const both = await make();
    await swap(both, 'CLAUDE.md');
    await swap(both, 'AGENTS.md');
    const r = CHECK(both).stdout;
    assert.match(r, /^FAIL {2}ticket contract: GitHub Issues/m, language + ' CLAUDE.md and AGENTS.md together');
    assert.match(r, /^ok {4}AGENTS\.md mirrors CLAUDE\.md/m, language);
    const noGh = await make();
    for (const rel of ['CLAUDE.md', 'AGENTS.md']) await writeFile(join(noGh, rel), (await read(noGh, rel)).replaceAll(GH, '`gh issue view <n>`'));
    assert.match(CHECK(noGh).stdout, /^FAIL {2}ticket contract: GitHub Issues/m, language + ' without the gh command in CLAUDE.md and AGENTS.md');
  }
});

// The class of «the contract in a project file»: a file reference named like a contract, in any folder, with or without code spans. The first six are the variants a critic tried.
const LOCAL_FILES = ['`.gauntlet/contracts/T012.md`', 'docs/tickets/12.md', '`specs/001-x/contract.md`', '`CONTRACT.md`', '`docs/tickets/12.md`', '`.gauntlet/<n>.md`', '`tickets/<id>.json`'];
test('ticket contract: every contract file name of the class fails the line, and a tickets/ folder or ticketing code that is not a contract file does not', async () => {
  for (const language of ['English', 'Portuguese (Brazil)']) {
    const dest = await tmp();
    await scaffold(answers({ language }), { dest });
    if (language !== 'English') await rewrite(dest, [], { headings: NATURAL });
    const original = await read(dest, 'FRAMEWORK.md');
    const verdict = async (extra) => { await writeFile(join(dest, 'FRAMEWORK.md'), original + '\n' + extra + '\n'); return CHECK(dest).stdout; };
    for (const f of LOCAL_FILES) assert.match(await verdict(`- Agents read the contract from ${f} and work from that file.`), /^FAIL {2}ticket contract: GitHub Issues/m, `${language}: ${f}`);
    const fine = await verdict('- The helpdesk code lives in `src/tickets/api.ts` and the folder `tickets/`, with `docs/tickets/README.md` and `tickets/` tests.');
    assert.match(fine, /^ok {4}ticket contract: GitHub Issues/m, language + ': a tickets/ folder is not a contract file');
  }
});

// developerUi, tester and the reasons only come through --answers; the flags still override the roles of the file
const ANSWERS_FILE = join(await tmp(), 'answers.json');
await writeFile(ANSWERS_FILE, JSON.stringify(answers()));
const FLAGS = ['--answers', ANSWERS_FILE, '--mode', 'rigorous', '--name', 'Acme Billing', '--language', 'English', '--developer', 'sonnet:high', '--critic', 'opus:high:Opus', '--aux', 'sonnet:medium', '--workspace', 'acme', '--project', 'billing'];

test('the command line: a dry run lists the tree, a real run writes it, and a missing answer exits 2 with the usage', async () => {
  const dest = await tmp();
  const out = [];
  assert.equal(await main([...FLAGS, '--dest', dest, '--dry-run'], (m) => out.push(m)), 0);
  assert.match(out.join('\n'), /dry run, nothing written.*\n {2}\.ai-memory\.toml/);
  assert.deepEqual(await readdir(dest), []);

  const script = fileURLToPath(new URL('./scaffold.mjs', import.meta.url));
  const real = spawnSync(process.execPath, [script, ...FLAGS, '--dest', dest], { encoding: 'utf8' });
  assert.equal(real.status, 0, real.stderr);
  assert.equal(JSON.parse(await read(dest, '.claude/forge.json')).models.critic.label, 'Opus');

  const missing = spawnSync(process.execPath, [script, '--dest', await tmp(), '--name', 'X'], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stdout, /models\.developer: missing[\s\S]*usage: node scaffold\.mjs/);
  assert.match(missing.stdout, /^- mode: /m);
});

test('--repo overrides the repo of the answers file and an invalid one exits 2', async () => {
  const dest = await tmp();
  assert.equal(await main([...FLAGS, '--repo', 'flag-owner/flag-name', '--dest', dest], () => {}), 0);
  assert.match(await read(dest, 'FRAMEWORK.md'), /`flag-owner\/flag-name`/);
  assert.equal(await main([...FLAGS, '--repo', 'not a repo', '--dest', await tmp()], () => {}), 2);
});

test('--answers reads a JSON file and a flag overrides the same key', async () => {
  const dest = await tmp(), file = join(await tmp(), 'answers.json');
  await writeFile(file, JSON.stringify(answers()));
  assert.equal(await main(['--answers', file, '--name', 'Other Name', '--dest', dest], () => {}), 0);
  assert.match(await read(dest, 'CLAUDE.md'), /^# Other Name$/m);
  assert.match(await read(dest, '.ai-memory.toml'), /workspace = "acme"/);
});

test('--set-panel-url swaps the pending URL through the command line', async () => {
  const dest = await tmp();
  await main([...FLAGS, '--dest', dest], () => {});
  const out = [];
  assert.equal(await main(['--dest', dest, '--set-panel-url', 'https://claude.ai/artifact/Zed9'], (m) => out.push(m)), 0);
  assert.match(await read(dest, 'FRAMEWORK.md'), /Zed9/);
  assert.equal(await main(['--dest', dest, '--set-panel-url', 'https://claude.ai/artifact/Zed9'], () => {}), 2);
});

test('the language check skips the English blocks the installers append (graphify, Agent skills)', async () => {
  const dest = await tmp();
  await scaffold(answers({ language: 'Portuguese (Brazil)' }), { dest });
  await rewrite(dest, [], { headings: NATURAL });
  const claude = await read(dest, 'CLAUDE.md');
  await writeFile(join(dest, 'CLAUDE.md'), claude + '\n## graphify\n\nThis project has a knowledge graph with god nodes, and the rules are that the agent must run the query first when the graph exists, before it reads the files of the project.\n\n### Rules\n\nThe agent must run the query first when the graph exists, and it must read the report only for a broad review of the architecture, because the report is larger than the answer of a query.\n');
  const r = CHECK(dest);
  assert.equal(r.status, 0, r.stdout);
});
