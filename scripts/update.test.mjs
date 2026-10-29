import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './update.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = join(ROOT, 'scripts', 'fixtures', 'versions-2026-10-29.json');
const json = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const registry = json('components.json');
const compat = json('compat.json');

const posix = (p) => String(p).replaceAll('\\', '/');
const CFG = '/h/u/.claude';
const skillPath = (name) => `${CFG}/skills/${name}/SKILL.md`;
const plugins = (map) => ({ [`${CFG}/plugins/installed_plugins.json`]: JSON.stringify({ plugins: Object.fromEntries(Object.entries(map).map(([id, v]) => [id, [{ version: v }]])) }) });

// Everything in memory except the package's own files. exec only answers version probes; run and copyDir are recorded, never done.
function machine({ files = {}, probes = {}, urls = {}, failRun, platform = 'linux' } = {}) {
  const m = { calls: [], copies: [], fetches: [], events: [] };
  m.sys = {
    platform, home: '/h/u', env: {},
    exec: async (cmd, args) => { const k = [cmd, ...args].join(' '); if (k in probes) return probes[k]; throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    run: async (cmd, args, opts) => { m.calls.push({ cmd, args, opts }); m.events.push('run'); if (failRun) throw new Error(failRun); return ''; },
    readFile: async (p) => {
      const k = posix(p);
      if (k in files) return files[k];
      if (k.endsWith('/.specify') && Object.keys(files).some((f) => f.startsWith(k + '/'))) throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
      return posix(p).startsWith(posix(ROOT)) ? readFileSync(p, 'utf8') : null;
    },
    copyDir: async (src, dest) => { m.copies.push([posix(src), posix(dest)]); m.events.push('copy'); },
    fetchText: async (u) => { m.fetches.push(u); if (u in urls) return urls[u]; throw new Error('HTTP 404 ' + u); },
  };
  return m;
}
async function run(m, ...argv) {
  const out = [];
  const code = await main(argv, m.sys, (s) => out.push(String(s)));
  return { code, out: out.join('\n') };
}
const status = async (m) => Object.fromEntries(JSON.parse((await run(m, '--check', '--json')).out).components.map((c) => [c.id, c.status]));

const rel = (repo, tag) => [`https://api.github.com/repos/${repo}/releases/latest`, JSON.stringify({ tag_name: tag })];
const urls = (over = {}) => Object.fromEntries([
  rel('astral-sh/uv', '0.13.6'), rel('akitaonrails/ai-memory', 'v3.2.10'), rel('DietrichGebert/ponytail', 'v5.3.3'), rel('mattpocock/skills', 'v1.3.2'),
  ['https://pypi.org/pypi/specify-cli/json', JSON.stringify({ info: { version: '1.2.5' } })],
  ['https://pypi.org/pypi/graphifyy/json', JSON.stringify({ info: { version: '0.9.97' } })],
  ['https://api.github.com/repos/RenatoWernik/gauntlet-loop/commits/HEAD', JSON.stringify({ sha: 'fc6b2fc604ff37fdf4da67ed76980e6af1722629' })],
  ['https://raw.githubusercontent.com/RenatoWernik/gauntlet-loop/fc6b2fc604ff37fdf4da67ed76980e6af1722629/.claude/skills/gauntlet-loop/SKILL.md', 'the head of the fork'],
  ['https://raw.githubusercontent.com/SpillwaveSolutions/sdd-skill/HEAD/skill.md', '---\nname: sdd\nversion: 2.1.0\n---\n'],
  ['https://api.github.com/repos/RenatoWernik/forge/commits/HEAD', JSON.stringify({ sha: 'f0e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d' })],
  ...Object.entries(over),
]);

test('--check on an empty machine: everything missing, exit 1, nothing run', async () => {
  const m = machine({ urls: urls() });
  const r = await run(m, '--check');
  assert.equal(r.code, 1);
  assert.deepEqual(m.calls, []);
  assert.match(r.out, /\[missing\] uv/);
  assert.ok(Object.values(await status(m)).every((s) => s === 'missing'));
});

test('--versions makes the fixture the only source: no fetchText, and no registry source is unknown', async () => {
  const m = machine({ files: plugins({ 'ponytail@ponytail': '5.3.3' }) });
  const r = await run(m, '--check', '--json', '--versions', FIXTURE);
  assert.deepEqual(m.fetches, []);
  const by = Object.fromEntries(JSON.parse(r.out).components.map((c) => [c.id, c]));
  assert.equal(by.ponytail.status, 'ok');
  for (const c of Object.values(by)) assert.notEqual(c.status, 'unknown', c.id);
});

test('the fixture has an entry for the latest source of every component, the forge head and the original of the fork', () => {
  const fx = json('scripts', 'fixtures', 'versions-2026-10-29.json').urls;
  const want = ['https://api.github.com/repos/RenatoWernik/forge/commits/HEAD', 'https://api.github.com/repos/robonuggets/gauntlet-loop/compare/9b1975a...HEAD'];
  for (const c of registry.components.filter((x) => x.latest)) {
    const l = c.latest;
    if (l.method === 'github-release') want.push(`https://api.github.com/repos/${l.repo}/releases/latest`);
    if (l.method === 'github-head') want.push(`https://api.github.com/repos/${l.repo}/commits/HEAD`);
    if (l.method === 'github-frontmatter') want.push(`https://raw.githubusercontent.com/${l.repo}/HEAD/${l.path}`);
    if (l.method === 'pypi') want.push(`https://pypi.org/pypi/${l.package}/json`);
  }
  assert.deepEqual(want.filter((u) => !(u in fx)), []);
});

test('compat.json: pristine only for the skills forge copies, each entry has a ref, a sha256 and an https url; the ai-memory 3.0.0 note needs a backup', () => {
  const withPristine = Object.entries(compat.components).filter(([, e]) => e.pristine).map(([id]) => id);
  assert.deepEqual(withPristine.sort(), ['gauntlet-loop', 'ponytail', 'sdd']);
  for (const id of withPristine) for (const [file, versions] of Object.entries(compat.components[id].pristine)) {
    assert.match(file, /^[\w-]+\/SKILL\.md$/);
    for (const v of versions) assert.ok((v.ref || v.refs?.length) && /^[0-9a-f]{64}$/.test(v.sha256) && /^https:\/\//.test(v.url), `${id} ${file}`);
  }
  assert.equal(compat.components['ai-memory'].notes['3.0.0'].requiresBackup, true);
});

const original = 'a published copy\n';
const sha = (t) => createHash('sha256').update(t.replaceAll('\r\n', '\n').trim()).digest('hex');
const pristineCompat = (text) => {
  const c = structuredClone(compat);
  c.components['gauntlet-loop'].pristine['gauntlet-loop/SKILL.md'] = [{ ref: 'x', sha256: sha(text), url: 'https://example.invalid/x' }];
  return c;
};

// the compat.json is read by main from the package folder, so a synthetic pristine is served through readFile
const withCompat = (m, c) => {
  const read = m.sys.readFile;
  m.sys.readFile = async (p) => (posix(p).endsWith('/compat.json') && posix(p).startsWith(posix(ROOT)) ? JSON.stringify(c) : read(p));
  return m;
};

test('the ponytail pristine has every release from v4.10.0 to v5.3.3 in each of the 6 skills (an intact copy of any release is never customized)', () => {
  const files = Object.values(compat.components.ponytail.pristine);
  assert.equal(files.length, 6);
  const tags = files.map((versions) => versions.flatMap((v) => v.refs).sort().join(' '));
  assert.equal(new Set(tags).size, 1, 'every skill covers the same releases');
  const all = tags[0].split(' ');
  assert.equal(all.length, 15);
  assert.ok(all.includes('v4.10.0') && all.includes('v5.3.3'));
});

test('an update that installs an unverified version is not reported as customized afterwards: the file equals the latest ref', async () => {
  const old = '---\nname: sdd\nversion: 2.1.0\n---\nold body\n';
  const next = '---\nname: sdd\nversion: 2.1.2\n---\nnew body\n';
  const c = structuredClone(compat);
  c.components.sdd.pristine['sdd/SKILL.md'] = [{ ref: 'x', sha256: sha(old), url: 'https://raw.githubusercontent.com/SpillwaveSolutions/sdd-skill/eba9606/skill.md' }];
  const files = { [skillPath('sdd')]: old };
  const m = withCompat(machine({ urls: urls({ 'https://raw.githubusercontent.com/SpillwaveSolutions/sdd-skill/HEAD/skill.md': next }), files }), c);
  m.sys.run = async (cmd, args) => { m.calls.push({ cmd, args }); files[skillPath('sdd')] = next; return ''; };
  assert.equal((await status(m)).sdd, 'unverified');
  const r = await run(m, '--apply', 'sdd', '--yes', '--accept-unverified');
  assert.equal(m.calls.length, 1);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /customized/);
  assert.equal((await status(m)).sdd, 'ok');
  files[skillPath('sdd')] = next + 'my edit';
  assert.equal((await status(m)).sdd, 'customized');
});
test('loose ponytail skills equal to the latest release (above the pristine) are not customized; one edited skill still is', async () => {
  const novo = '---\nname: ponytail\n---\nthe 5.3.4 text\n';
  const pony = ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'];
  const raw = Object.fromEntries(pony.map((n) => [`https://raw.githubusercontent.com/DietrichGebert/ponytail/v5.3.4/skills/${n}/SKILL.md`, novo]));
  const files = Object.fromEntries(pony.map((n) => [skillPath(n), novo]));
  const m = machine({ urls: urls({ ...Object.fromEntries([rel('DietrichGebert/ponytail', 'v5.3.4')]), ...raw }), files });
  assert.equal((await status(m)).ponytail, 'ok');
  files[skillPath('ponytail-help')] = novo + 'my rule';
  assert.equal((await status(m)).ponytail, 'customized');
});
test('a skill that is a published copy is never customized (LF or CRLF); one changed byte makes it customized', async () => {
  for (const [text, expected] of [[original, 'outdated'], [original.replaceAll('\n', '\r\n'), 'outdated'], [original + 'x', 'customized'], ['b' + original, 'customized']]) {
    const m = withCompat(machine({ urls: urls(), files: { [skillPath('gauntlet-loop')]: text } }), pristineCompat(original));
    assert.equal((await status(m))['gauntlet-loop'], expected, JSON.stringify(text));
  }
});

test('a customized skill: the check says it will not be touched and shows a diff, never the command that replaces it', async () => {
  const m = withCompat(machine({ urls: urls(), files: { [skillPath('gauntlet-loop')]: 'my own edits' } }), pristineCompat(original));
  const r = await run(m, '--check');
  assert.match(r.out, /will not be touched/);
  assert.match(r.out, /\bdiff\b/);
  assert.doesNotMatch(r.out, /git clone/);
});

const aim = (v) => ({ probes: { 'ai-memory --version': `ai-memory ${v}` } });

test('--apply barriers: no --yes is 3 and prints the plan; two ids, an unknown id and a hostile id are 2; nothing runs in any of them', async () => {
  for (const [argv, code] of [[['--apply', 'uv'], 3], [['--apply', 'uv', 'ponytail', '--yes'], 2], [['--apply', 'nope', '--yes'], 2], [['--apply', 'x;rm -rf /', '--yes'], 2], [['--apply', '--yes'], 2], [['--check', '--apply', 'uv'], 2]]) {
    const m = machine({ urls: urls(), probes: { 'uv --version': 'uv 0.12.0' } });
    const r = await run(m, ...argv);
    assert.equal(r.code, code, argv.join(' '));
    assert.deepEqual(m.calls, [], argv.join(' '));
  }
});

test('--apply runs the doctor command through a shell, once, and checks the component again afterwards', async () => {
  const m = machine({ urls: urls(), probes: { 'uv --version': 'uv 0.12.0' } });
  const r = await run(m, '--apply', 'uv', '--yes');
  assert.deepEqual(m.calls.map((c) => [c.cmd, c.args]), [['sh', ['-c', 'uv self update']]]);
  assert.match(r.out, /0\.12\.0 -> 0\.13\.6/);
  assert.equal(r.code, 1, 'the fake probe still says 0.12.0, so the component is not ok after');
});

test('--apply of a component that is already ok, or not installed, runs nothing', async () => {
  const ok = machine({ urls: urls(), probes: { 'uv --version': 'uv 0.13.6' } });
  assert.equal((await run(ok, '--apply', 'uv', '--yes')).code, 0);
  assert.deepEqual(ok.calls, []);
  const none = machine({ urls: urls() });
  assert.equal((await run(none, '--apply', 'uv', '--yes')).code, 1);
  assert.deepEqual(none.calls, []);
});

test('--apply: a requires that is not ok, and a sameAs with its owner outdated, refuse and name what comes first', async () => {
  const m = machine({ urls: urls(), probes: { 'uv --version': 'uv 0.12.0', 'uv tool list': 'specify-cli v1.0.0\n- specify' } });
  const r = await run(m, '--apply', 'spec-kit', '--yes');
  assert.equal(r.code, 1);
  assert.match(r.out, /requires uv/);
  const n = machine({ urls: urls(), ...aim('2.5.0'), files: { '/h/u/.claude.json': JSON.stringify({ mcpServers: { 'ai-memory': {} } }) } });
  const s = await run(n, '--apply', 'ai-memory-mcp', '--yes', '--backup-confirmed');
  assert.equal(s.code, 1);
  assert.match(s.out, /--apply ai-memory\b/);
  assert.deepEqual([...m.calls, ...n.calls], []);
});

test('a note that needs a backup bars the update that crosses it (3.0.0 is crossed from 2.x, not from 3.0.0), and its text is shown', async () => {
  const from2 = machine({ urls: urls(), ...aim('2.5.0') });
  const r = await run(from2, '--apply', 'ai-memory', '--yes', '--accept-unverified');
  assert.equal(r.code, 3);
  assert.match(r.out, /upgrading-to-3\.0\.md/);
  assert.deepEqual(from2.calls, []);
  const from3 = machine({ urls: urls(), ...aim('3.0.0') });
  assert.equal((await run(from3, '--apply', 'ai-memory', '--yes')).code, 1);
  assert.equal(from3.calls.length, 1);
});

test('unverified: the latest above verifiedWith is refused without --accept-unverified, and the check says it is not tested with forge', async () => {
  const over = { ...urls(), ...Object.fromEntries([rel('DietrichGebert/ponytail', 'v5.4.0')]) };
  const m = machine({ urls: over, files: plugins({ 'ponytail@ponytail': '5.3.3' }) });
  assert.equal((await status(m)).ponytail, 'unverified');
  assert.match((await run(m, '--check')).out, /not tested with forge/);
  const r = await run(m, '--apply', 'ponytail', '--yes');
  assert.equal(r.code, 3);
  assert.deepEqual(m.calls, []);
});

test('--overwrite: the customized folder is copied to forge-backups/<id>-<UTC stamp>/ in the config folder, before the command runs', async () => {
  const m = withCompat(machine({ urls: urls({ 'https://raw.githubusercontent.com/RenatoWernik/gauntlet-loop/fc6b2fc604ff37fdf4da67ed76980e6af1722629/.claude/skills/gauntlet-loop/SKILL.md': 'new head' }), files: { [skillPath('gauntlet-loop')]: 'my edits' } }), pristineCompat(original));
  const refused = await run(m, '--apply', 'gauntlet-loop', '--yes');
  assert.equal(refused.code, 3);
  assert.deepEqual([m.calls, m.copies], [[], []]);
  await run(m, '--apply', 'gauntlet-loop', '--yes', '--overwrite');
  assert.deepEqual(m.events.slice(0, 2), ['copy', 'run']);
  const [[src, dest]] = m.copies;
  assert.equal(src, `${CFG}/skills/gauntlet-loop`);
  assert.match(dest, new RegExp(`^${CFG}/forge-backups/gauntlet-loop-\\d{8}T\\d{6}Z$`));
});

test('a failing backup stops everything: the command is never run', async () => {
  const m = withCompat(machine({ urls: urls(), files: { [skillPath('gauntlet-loop')]: 'my edits' } }), pristineCompat(original));
  m.sys.copyDir = async () => { throw new Error('disk full'); };
  const r = await run(m, '--apply', 'gauntlet-loop', '--yes', '--overwrite');
  assert.equal(r.code, 1);
  assert.deepEqual(m.calls, []);
});

test('the forge plugin: installed gitCommitSha against the head of main; --apply forge runs the two lines and nothing else', async () => {
  const files = { [`${CFG}/plugins/installed_plugins.json`]: JSON.stringify({ plugins: { 'forge@forge': [{ version: '0.1.0', gitCommitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }] } }) };
  const m = machine({ urls: urls(), files });
  assert.equal((await status(m)).forge, 'outdated');
  const r = await run(m, '--apply', 'forge', '--yes');
  assert.deepEqual(m.calls.map((c) => c.cmd), ['claude plugin marketplace update forge', 'claude plugin update forge@forge']);
  assert.ok(m.calls.every((c) => c.args.length === 0));
  assert.equal(r.code, 1, 'the fake installed_plugins.json did not change');
  files[`${CFG}/plugins/installed_plugins.json`] = JSON.stringify({ plugins: { 'forge@forge': [{ gitCommitSha: 'f0e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d' }] } });
  assert.equal((await status(m)).forge, 'ok');
});

test('speckit-project: needs --project with a .specify/ folder and spec-kit ok; the path is only the cwd, never in the command; never a --force', async () => {
  const project = '/work/my proj;echo $(id)';
  const files = { [`${project}/.specify/memory/constitution.md`]: '# c', ...plugins({}) };
  const base = { urls: urls(), probes: { 'uv --version': 'uv 0.13.6', 'uv tool list': 'specify-cli v1.2.5\n- specify' }, files };
  const m = machine(base);
  assert.equal((await run(m, '--apply', 'speckit-project', '--yes')).code, 2);
  assert.equal((await run(m, '--apply', 'speckit-project', '--project', '/work/none', '--yes')).code, 2);
  assert.equal((await run(m, '--apply', 'speckit-project', '--project', project)).code, 3);
  assert.deepEqual(m.calls, []);
  assert.equal((await run(m, '--apply', 'speckit-project', '--project', project, '--yes')).code, 0);
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].cmd, 'specify integration upgrade claude');
  assert.equal(m.calls[0].opts.cwd, project);
  assert.ok(!JSON.stringify(m.calls).includes('--force'));
  const old = machine({ ...base, probes: { 'uv --version': 'uv 0.13.6', 'uv tool list': 'specify-cli v1.0.0\n- specify' } });
  assert.equal((await run(old, '--apply', 'speckit-project', '--project', project, '--yes')).code, 1);
  assert.deepEqual(old.calls, []);
});

test('the upstream refusal of speckit-project is reported and not retried', async () => {
  const project = '/work/p';
  const m = machine({ urls: urls(), probes: { 'uv --version': 'uv 0.13.6', 'uv tool list': 'specify-cli v1.2.5\n- specify' }, files: { [`${project}/.specify/x`]: '', ...plugins({}) }, failRun: 'refusing to upgrade: a managed file was modified locally' });
  const r = await run(m, '--apply', 'speckit-project', '--project', project, '--yes');
  assert.equal(r.code, 1);
  assert.match(r.out, /refusing to upgrade/);
  assert.equal(m.calls.length, 1);
});

test('a config folder with control characters never reaches the diff line raw', async () => {
  const cfg = '/h/cfg\u001b[31m\nFAKE';
  const m = withCompat(machine({ urls: urls(), files: { [`${cfg}/skills/gauntlet-loop/SKILL.md`]: 'my edits' } }), pristineCompat(original));
  m.sys.env.CLAUDE_CONFIG_DIR = cfg;
  const r = await run(m, '--check');
  assert.match(r.out, /\[customized\]/);
  assert.doesNotMatch(r.out, /\u001b|\nFAKE/);
});

test('--check --json escapes U+2028, U+2029, DEL and C1 controls from a hostile version, and stays valid JSON', async () => {
  const hostile = '5.3.2' + String.fromCharCode(0x2028, 0x2029, 0x7f, 0x85) + 'x';
  const m = machine({ urls: urls(), files: plugins({ 'ponytail@ponytail': hostile }) });
  const r = await run(m, '--check', '--json');
  for (const ch of hostile.slice(5, 9)) assert.ok(!r.out.includes(ch), `raw U+${ch.codePointAt(0).toString(16)}`);
  assert.match(r.out, /\\u2028\\u2029\\u007f\\u0085/);
  assert.equal(JSON.parse(r.out).components.find((c) => c.id === 'ponytail').installedVersion, hostile);
});

test('control characters in a value read from a file never reach the output raw', async () => {
  const files = { [`${CFG}/plugins/installed_plugins.json`]: JSON.stringify({ plugins: { 'forge@forge': [{ version: '0.1.0\u001b[31m\nFAKE', gitCommitSha: 'nothex' }] } }) };
  const r = await run(machine({ urls: urls(), files }), '--check');
  assert.doesNotMatch(r.out, /\u001b|\nFAKE/);
});
