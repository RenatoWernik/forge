import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDoctor, main } from './doctor.mjs';

// Fake system boundary: exec, files and network are the only things the doctor touches.
function fakeSys({ platform = 'win32', home = '/h', exec = {}, files = {}, urls = {}, env = {} } = {}) {
  return {
    platform, home, env,
    async exec(cmd, args) {
      const key = [cmd, ...args].join(' ');
      if (key in exec) return exec[key];
      throw Object.assign(new Error('spawn ' + cmd + ' ENOENT'), { code: 'ENOENT' });
    },
    async readFile(path) { return path in files ? files[path] : null; },
    async fetchText(url) {
      if (url in urls) return urls[url];
      throw new Error('HTTP 404 ' + url);
    },
  };
}

const cli = (over = {}) => ({
  id: 'graphify', name: 'Graphify', type: 'cli', group: 'graphify',
  source: 'https://github.com/Graphify-Labs/graphify',
  installDocs: 'https://github.com/Graphify-Labs/graphify#install',
  installed: [{ method: 'command', commands: ['graphify'], args: ['--version'], regex: '(\\d+\\.\\d+\\.\\d+)' }],
  latest: { method: 'github-release', repo: 'Graphify-Labs/graphify' },
  install: { windows: ['uv tool install graphifyy'], macos: ['uv tool install graphifyy'], linux: ['uv tool install graphifyy'] },
  update: { windows: ['uv tool upgrade graphifyy'], macos: ['uv tool upgrade graphifyy'], linux: ['uv tool upgrade graphifyy'] },
  ...over,
});

const REL = (repo, tag) => ['https://api.github.com/repos/' + repo + '/releases/latest', JSON.stringify({ tag_name: tag })];

test('installed CLI older than the latest release: outdated, with the update command for the platform', async () => {
  const sys = fakeSys({
    exec: { 'graphify --version': 'graphify 0.9.53\n' },
    urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]),
  });
  const report = await runDoctor({ components: [cli()] }, sys);
  const c = report.components[0];
  assert.equal(report.platform, 'windows');
  assert.equal(c.installed, true);
  assert.equal(c.installedVersion, '0.9.53');
  assert.equal(c.latestVersion, '0.9.72');
  assert.equal(c.status, 'outdated');
  assert.deepEqual(c.command, ['uv tool upgrade graphifyy']);
});

const PYPI = (pkg, v) => ['https://pypi.org/pypi/' + pkg + '/json', JSON.stringify({ info: { version: v } })];

test('latest version comes from PyPI; equal version is ok and needs no command', async () => {
  const sys = fakeSys({
    exec: { 'graphify --version': 'graphify 0.9.72' },
    urls: Object.fromEntries([PYPI('graphifyy', '0.9.72')]),
  });
  const reg = { components: [cli({ latest: { method: 'pypi', package: 'graphifyy' } })] };
  const c = (await runDoctor(reg, sys)).components[0];
  assert.equal(c.latestVersion, '0.9.72');
  assert.equal(c.status, 'ok');
  assert.equal(c.command, null);
});

test('installed dev version 1.0.8.dev0 is older than release 1.0.13', async () => {
  const sys = fakeSys({
    exec: { 'graphify --version': 'specify 1.0.8.dev0' },
    urls: Object.fromEntries([PYPI('specify-cli', '1.0.13')]),
  });
  const reg = { components: [cli({ installed: [{ method: 'command', commands: ['graphify'], args: ['--version'], regex: '([0-9][0-9a-z.]*)' }], latest: { method: 'pypi', package: 'specify-cli' } })] };
  const c = (await runDoctor(reg, sys)).components[0];
  assert.equal(c.installedVersion, '1.0.8.dev0');
  assert.equal(c.status, 'outdated');
});

test('executable not found: missing, no installed version, install command for the platform', async () => {
  const sys = fakeSys({ platform: 'darwin', urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]) });
  const c = (await runDoctor({ components: [cli()] }, sys)).components[0];
  assert.equal(c.installed, false);
  assert.equal(c.installedVersion, null);
  assert.equal(c.status, 'missing');
  assert.deepEqual(c.command, ['uv tool install graphifyy']);
});

test('latest version comes from the npm registry (scoped package)', async () => {
  const sys = fakeSys({
    exec: { 'graphify --version': 'graphify 4.9.0' },
    urls: { 'https://registry.npmjs.org/@dietrichgebert/ponytail/latest': JSON.stringify({ version: '4.10.0' }) },
  });
  const reg = { components: [cli({ latest: { method: 'npm', package: '@dietrichgebert/ponytail' } })] };
  const c = (await runDoctor(reg, sys)).components[0];
  assert.equal(c.latestVersion, '4.10.0');
  assert.equal(c.status, 'outdated');
});

// A CLI is updated the way it was installed: each detector may carry its own update command.
const UPDATE_UV_TOOL = { windows: ['uv tool upgrade graphifyy'], macos: ['uv tool upgrade graphifyy'], linux: ['uv tool upgrade graphifyy'] };
const UPDATE_PIP = { windows: ['python -m pip install --upgrade graphifyy'], macos: ['python3 -m pip install --upgrade graphifyy'], linux: ['python3 -m pip install --upgrade graphifyy'] };
const FALLBACK = { windows: ['fallback update'], macos: ['fallback update'], linux: ['fallback update'] };
const byOrigin = () => cli({
  update: FALLBACK,
  latest: { method: 'pypi', package: 'graphifyy' },
  installed: [
    { method: 'uv-tool', package: 'graphifyy', update: UPDATE_UV_TOOL },
    { method: 'pip', package: 'graphifyy', update: UPDATE_PIP },
    { method: 'pipx', package: 'graphifyy', update: ['pipx upgrade graphifyy'] },
    { method: 'command', commands: ['graphify'], args: ['--version'], regex: '(\\d+\\.\\d+\\.\\d+)' },
  ],
});

test('CLI installed with pip (second detector): version from pip show, update command is the pip one', async () => {
  const sys = fakeSys({
    exec: { 'uv tool list': 'specify-cli v1.0.8.dev0\n- specify\n', 'python -m pip show graphifyy': 'Name: graphifyy\nVersion: 0.9.53\nSummary: x\n' },
    urls: Object.fromEntries([PYPI('graphifyy', '0.9.72')]),
  });
  const c = (await runDoctor({ components: [byOrigin()] }, sys)).components[0];
  assert.equal(c.installedVersion, '0.9.53');
  assert.equal(c.status, 'outdated');
  assert.deepEqual(c.command, ['python -m pip install --upgrade graphifyy']);
});

test('CLI installed with uv tool: its own upgrade command; a dev suffix on the same numbers (1.0.13.dev0) is older than the release', async () => {
  const sys = fakeSys({
    exec: { 'uv tool list': 'graphifyy v1.0.13.dev0\n- graphify\n' },
    urls: Object.fromEntries([PYPI('graphifyy', '1.0.13')]),
  });
  const c = (await runDoctor({ components: [byOrigin()] }, sys)).components[0];
  assert.equal(c.installedVersion, '1.0.13.dev0');
  assert.equal(c.status, 'outdated');
  assert.deepEqual(c.command, ['uv tool upgrade graphifyy']);
});

test('a release candidate (1.0.13rc1) is older than 1.0.13; the same final version is ok and needs no command', async () => {
  const urls = Object.fromEntries([PYPI('graphifyy', '1.0.13')]);
  const rc = fakeSys({ exec: { 'uv tool list': 'graphifyy v1.0.13rc1\n' }, urls });
  assert.equal((await runDoctor({ components: [byOrigin()] }, rc)).components[0].status, 'outdated');
  const final = fakeSys({ exec: { 'uv tool list': 'graphifyy v1.0.13\n' }, urls });
  const c = (await runDoctor({ components: [byOrigin()] }, final)).components[0];
  assert.equal(c.status, 'ok');
  assert.equal(c.command, null);
});

test('CLI installed with pipx: the update shortcut list applies to every platform; a package name is matched whole, not as a prefix', async () => {
  const urls = Object.fromEntries([PYPI('graphifyy', '0.9.72')]);
  const sys = fakeSys({ platform: 'linux', exec: { 'pipx list --short': 'graphifyy-extra 9.9.9\ngraphifyy 0.9.53\n' }, urls });
  const c = (await runDoctor({ components: [byOrigin()] }, sys)).components[0];
  assert.equal(c.installedVersion, '0.9.53');
  assert.deepEqual(c.command, ['pipx upgrade graphifyy']);
});

test('CLI found only on PATH (no package manager lists it): the component default update command', async () => {
  const sys = fakeSys({ exec: { 'graphify --version': 'graphify 0.9.53' }, urls: Object.fromEntries([PYPI('graphifyy', '0.9.72')]) });
  const c = (await runDoctor({ components: [byOrigin()] }, sys)).components[0];
  assert.equal(c.status, 'outdated');
  assert.deepEqual(c.command, ['fallback update']);
});

const plugin = (over = {}) => cli({
  id: 'ponytail', type: 'plugin',
  installed: [{ method: 'plugin', id: 'ponytail@ponytail' }],
  latest: { method: 'github-release', repo: 'DietrichGebert/ponytail' },
  ...over,
});
const PLUGINS_JSON = (home) => join(home, '.claude', 'plugins', 'installed_plugins.json');

test('installed plugin: version read from installed_plugins.json', async () => {
  const installedPlugins = JSON.stringify({ plugins: { 'ponytail@ponytail': [{ scope: 'user', version: '1.4.0' }] } });
  const sys = fakeSys({
    files: { [PLUGINS_JSON('/h')]: installedPlugins },
    urls: Object.fromEntries([REL('DietrichGebert/ponytail', 'v1.5.0')]),
  });
  const c = (await runDoctor({ components: [plugin()] }, sys)).components[0];
  assert.equal(c.installed, true);
  assert.equal(c.installedVersion, '1.4.0');
  assert.equal(c.status, 'outdated');
});

test('plugin absent from installed_plugins.json (or file missing): missing', async () => {
  const other = JSON.stringify({ plugins: { 'outro@mkt': [{ version: '1.0.0' }] } });
  const urls = Object.fromEntries([REL('DietrichGebert/ponytail', 'v1.5.0')]);
  for (const files of [{ [PLUGINS_JSON('/h')]: other }, {}]) {
    const c = (await runDoctor({ components: [plugin()] }, fakeSys({ files, urls }))).components[0];
    assert.equal(c.status, 'missing');
  }
});

const skill = (over = {}) => cli({
  id: 'graphify-skill', type: 'skill',
  installed: [{ method: 'skill', name: 'graphify', versionFile: '.graphify_version' }],
  latest: { method: 'github-release', repo: 'Graphify-Labs/graphify' },
  ...over,
});
const SKILL_DIR = (home, name) => join(home, '.claude', 'skills', name);

test('installed skill: version read from the version file next to SKILL.md', async () => {
  const dir = SKILL_DIR('/h', 'graphify');
  const sys = fakeSys({
    files: { [join(dir, 'SKILL.md')]: '---\nname: graphify\n---\n', [join(dir, '.graphify_version')]: '0.9.53\n' },
    urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]),
  });
  const c = (await runDoctor({ components: [skill()] }, sys)).components[0];
  assert.equal(c.installedVersion, '0.9.53');
  assert.equal(c.status, 'outdated');
});

test('installed skill: version read from the frontmatter; no SKILL.md means missing', async () => {
  const dir = SKILL_DIR('/h', 'sdd');
  const reg = { components: [skill({ installed: [{ method: 'skill', name: 'sdd' }] })] };
  const urls = Object.fromEntries([REL('Graphify-Labs/graphify', 'v2.1.0')]);
  const withFile = fakeSys({ files: { [join(dir, 'SKILL.md')]: '---\nname: sdd\nversion: 2.1.0\ntriggers:\n  - sdd\n---\n# SDD' }, urls });
  const c = (await runDoctor(reg, withFile)).components[0];
  assert.equal(c.installedVersion, '2.1.0');
  assert.equal(c.status, 'ok');
  assert.equal((await runDoctor(reg, fakeSys({ urls }))).components[0].status, 'missing');
});

const RAW = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
const PT_PATH = 'skills/ponytail/SKILL.md';
const ptSkill = () => skill({
  id: 'ponytail', installed: [{ method: 'skill', name: 'ponytail' }],
  latest: { method: 'github-release', repo: 'DietrichGebert/ponytail', content: { path: PT_PATH } },
});

test('unversioned skill: content identical to the latest release SKILL.md (CRLF vs LF) counts as up to date', async () => {
  const remote = '---\nname: ponytail\n---\nBe lazy.\n';
  const sys = fakeSys({
    files: { [join(SKILL_DIR('/h', 'ponytail'), 'SKILL.md')]: remote.replaceAll('\n', '\r\n') },
    urls: { ...Object.fromEntries([REL('DietrichGebert/ponytail', 'v4.10.0')]), [RAW('DietrichGebert/ponytail', 'v4.10.0', PT_PATH)]: remote },
  });
  const c = (await runDoctor({ components: [ptSkill()] }, sys)).components[0];
  assert.equal(c.status, 'ok');
  assert.equal(c.installedVersion, '4.10.0');
  assert.equal(c.versionSource, 'content');
});

test('unversioned skill: content different from the latest release SKILL.md is outdated, installed version unknown', async () => {
  const sys = fakeSys({
    files: { [join(SKILL_DIR('/h', 'ponytail'), 'SKILL.md')]: 'old text' },
    urls: { ...Object.fromEntries([REL('DietrichGebert/ponytail', 'v4.10.0')]), [RAW('DietrichGebert/ponytail', 'v4.10.0', PT_PATH)]: 'new text' },
  });
  const c = (await runDoctor({ components: [ptSkill()] }, sys)).components[0];
  assert.equal(c.status, 'outdated');
  assert.equal(c.installedVersion, null);
  assert.equal(c.latestVersion, '4.10.0');
});

// ponytail can be a plugin or a loose skill: `claude plugin update` only exists for the plugin.
const ptBoth = () => ({
  ...ptSkill(), type: 'plugin',
  installed: [{ method: 'plugin', id: 'ponytail@ponytail' }, { method: 'skill', name: 'ponytail', update: ['copy the loose skill again'], requires: ['git'] }],
  update: { windows: ['claude plugin update ponytail@ponytail'], macos: ['x'], linux: ['x'] },
});
const ptUrls = Object.fromEntries([REL('DietrichGebert/ponytail', 'v4.10.0')]);

test('ponytail found as a loose skill (second detector) gets the loose-skill update, never `claude plugin update`', async () => {
  const sys = fakeSys({ files: { [join(SKILL_DIR('/h', 'ponytail'), 'SKILL.md')]: 'old text' }, urls: ptUrls });
  const c = (await runDoctor({ components: [ptBoth()] }, sys)).components[0];
  assert.equal(c.status, 'outdated');
  assert.deepEqual(c.command, ['copy the loose skill again']);
});

test('ponytail found as a plugin (first detector) keeps `claude plugin update`, even with a stale loose skill beside it', async () => {
  const sys = fakeSys({
    files: { [PLUGINS_JSON('/h')]: JSON.stringify({ plugins: { 'ponytail@ponytail': [{ version: '4.9.0' }] } }), [join(SKILL_DIR('/h', 'ponytail'), 'SKILL.md')]: 'old text' },
    urls: ptUrls,
  });
  const c = (await runDoctor({ components: [ptBoth()] }, sys)).components[0];
  assert.equal(c.installedVersion, '4.9.0');
  assert.deepEqual(c.command, ['claude plugin update ponytail@ponytail']);
});

test('requires: the tools a command needs are listed with it, per platform, and an origin can replace them', async () => {
  const urls = Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]);
  const withUv = cli({ requires: ['uv'] });
  const missing = (await runDoctor({ components: [withUv] }, fakeSys({ urls }))).components[0];
  assert.deepEqual(missing.requires, ['uv']);
  const perPlatform = cli({ requires: { linux: ['mise'] } });
  assert.deepEqual((await runDoctor({ components: [perPlatform] }, fakeSys({ platform: 'linux', urls }))).components[0].requires, ['mise']);
  assert.deepEqual((await runDoctor({ components: [perPlatform] }, fakeSys({ platform: 'win32', urls }))).components[0].requires, []);
  const viaPip = { ...byOrigin(), requires: ['uv'], installed: [{ method: 'pip', package: 'graphifyy', update: UPDATE_PIP, requires: [] }] };
  const pipSys = fakeSys({ exec: { 'python -m pip show graphifyy': 'Version: 0.9.53' }, urls: Object.fromEntries([PYPI('graphifyy', '0.9.72')]) });
  assert.deepEqual((await runDoctor({ components: [viaPip] }, pipSys)).components[0].requires, []);
  const current = fakeSys({ exec: { 'graphify --version': 'graphify 0.9.72' }, urls });
  assert.deepEqual((await runDoctor({ components: [withUv] }, current)).components[0].requires, []);
});

test('text report shows what a command requires', async () => {
  const out = (await runMain(['--registry', '/r.json'], fakeSys({ files: registryFile([cli({ requires: ['uv'] })]), urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]) }))).out;
  assert.match(out, /requires: uv/);
});

test('skill without releases: latest version is the frontmatter version on the default branch', async () => {
  const path = 'skill.md';
  const remote = '---\nname: sdd\nversion: 2.2.0\n---\n';
  const sys = fakeSys({
    files: { [join(SKILL_DIR('/h', 'sdd'), 'SKILL.md')]: '---\nname: sdd\nversion: 2.1.0\n---\n' },
    urls: { [RAW('SpillwaveSolutions/sdd-skill', 'HEAD', path)]: remote },
  });
  const reg = { components: [skill({ installed: [{ method: 'skill', name: 'sdd' }], latest: { method: 'github-frontmatter', repo: 'SpillwaveSolutions/sdd-skill', path } })] };
  const c = (await runDoctor(reg, sys)).components[0];
  assert.equal(c.latestVersion, '2.2.0');
  assert.equal(c.status, 'outdated');
});

test('skill without releases or tags: latest is the HEAD commit (first 7 chars), content compared at that commit', async () => {
  const sha = '9b1975a1b8f01981f3f1e6b667ad3aaf907178ea';
  const path = '.claude/skills/gauntlet-loop/SKILL.md';
  const sys = fakeSys({
    files: { [join(SKILL_DIR('/h', 'gauntlet-loop'), 'SKILL.md')]: 'same' },
    urls: {
      'https://api.github.com/repos/robonuggets/gauntlet-loop/commits/HEAD': JSON.stringify({ sha }),
      [RAW('robonuggets/gauntlet-loop', sha, path)]: 'same',
    },
  });
  const reg = { components: [skill({ installed: [{ method: 'skill', name: 'gauntlet-loop' }], latest: { method: 'github-head', repo: 'robonuggets/gauntlet-loop', content: { path } } })] };
  const c = (await runDoctor(reg, sys)).components[0];
  assert.equal(c.latestVersion, '9b1975a');
  assert.equal(c.status, 'ok');
});

const CLAUDE_JSON = (home) => join(home, '.claude.json');
const mcp = () => ({
  id: 'ai-memory-mcp', name: 'ai-memory MCP', type: 'mcp', group: 'ai-memory',
  source: 'https://github.com/akitaonrails/ai-memory', installDocs: 'https://github.com/akitaonrails/ai-memory/blob/main/docs/mcp-install.md',
  installed: [{ method: 'mcp', name: 'ai-memory' }], sameAs: 'ai-memory',
  install: { windows: ['ai-memory install-mcp --client claude-code --apply'], macos: ['x'], linux: ['x'] },
  update: { windows: ['update ai-memory'], macos: ['x'], linux: ['x'] },
});
const memCli = (over = {}) => cli({
  id: 'ai-memory', installed: [{ method: 'command', commands: ['ai-memory'], args: ['--version'], regex: '([0-9]+[.][0-9]+[.][0-9]+)' }],
  latest: { method: 'github-release', repo: 'akitaonrails/ai-memory' },
  ...over,
});

test('MCP server registered in ~/.claude.json inherits installed and latest version from its owner CLI', async () => {
  const sys = fakeSys({
    exec: { 'ai-memory --version': 'ai-memory 2.4.1' },
    files: { [CLAUDE_JSON('/h')]: JSON.stringify({ mcpServers: {}, projects: { '/p': { mcpServers: { 'ai-memory': { type: 'http' } } } } }) },
    urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.2')]),
  });
  const [, m] = (await runDoctor({ components: [memCli(), mcp()] }, sys)).components;
  assert.equal(m.installed, true);
  assert.equal(m.installedVersion, '2.4.1');
  assert.equal(m.latestVersion, '2.4.2');
  assert.equal(m.status, 'outdated');
  assert.deepEqual(m.command, ['update ai-memory']);
});

test('MCP server not registered: missing, with the MCP install command', async () => {
  const sys = fakeSys({
    exec: { 'ai-memory --version': 'ai-memory 2.4.2' },
    files: { [CLAUDE_JSON('/h')]: JSON.stringify({ mcpServers: { playwright: {} } }) },
    urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.2')]),
  });
  const [, m] = (await runDoctor({ components: [memCli(), mcp()] }, sys)).components;
  assert.equal(m.status, 'missing');
  assert.deepEqual(m.command, ['ai-memory install-mcp --client claude-code --apply']);
});

test('MCP registered but its owner CLI absent: outdated, latest kept, and the fix is the owner install command', async () => {
  const sys = fakeSys({
    files: { [CLAUDE_JSON('/h')]: JSON.stringify({ mcpServers: { 'ai-memory': {} } }) },
    urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.2')]),
  });
  const owner = memCli({ install: { windows: ['install the cli'], macos: ['x'], linux: ['x'] } });
  const [o, m] = (await runDoctor({ components: [owner, mcp()] }, sys)).components;
  assert.equal(o.status, 'missing');
  assert.equal(m.status, 'outdated');
  assert.equal(m.installed, true);
  assert.equal(m.installedVersion, null);
  assert.equal(m.latestVersion, '2.4.2');
  assert.deepEqual(m.command, ['install the cli']);
});

test('MCP whose owner cannot be checked: unknown with the owner error, no command', async () => {
  const sys = fakeSys({ files: { [CLAUDE_JSON('/h')]: JSON.stringify({ mcpServers: { 'ai-memory': {} } }) } });
  const [o, m] = (await runDoctor({ components: [memCli({ installed: [{ method: 'plugin', id: 'x' }] }), mcp()] }, { ...sys, readFile: async (p) => { if (p.endsWith('installed_plugins.json')) throw new Error('EACCES'); return sys.readFile(p); } })).components;
  assert.equal(o.status, 'unknown');
  assert.equal(m.status, 'unknown');
  assert.match(m.error, /EACCES/);
  assert.equal(m.command, null);
});

test('a missing component keeps the latest version it looked up, and says so in the text report', async () => {
  const c = (await runDoctor({ components: [cli()] }, fakeSys({ urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]) }))).components[0];
  assert.equal(c.status, 'missing');
  assert.equal(c.latestVersion, '0.9.72');
  const out = (await runMain(['--registry', '/r.json'], fakeSys({ files: registryFile([cli()]), urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]) }))).out;
  assert.match(out, /not installed - latest 0\.9\.72/);
});

test('a network failure in one source does not sink the report: that component is unknown with the error, the rest carry on', async () => {
  const sys = fakeSys({
    exec: { 'graphify --version': 'graphify 0.9.53', 'other --version': 'other 1.0.0' },
    urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.53')]),
  });
  const other = cli({ id: 'other', installed: [{ method: 'command', commands: ['other'], regex: '([0-9.]+)' }], latest: { method: 'github-release', repo: 'a/b' } });
  const report = await runDoctor({ components: [cli(), other] }, sys);
  assert.equal(report.components[0].status, 'ok');
  const o = report.components[1];
  assert.equal(o.status, 'unknown');
  assert.equal(o.installedVersion, '1.0.0');
  assert.equal(o.latestVersion, null);
  assert.match(o.error, /HTTP 404/);
  assert.equal(o.command, null);
});

test('network failure with the component absent: still missing, with the install command', async () => {
  const c = (await runDoctor({ components: [cli()] }, fakeSys())).components[0];
  assert.equal(c.status, 'missing');
  assert.deepEqual(c.command, ['uv tool install graphifyy']);
  assert.equal(c.latestVersion, null);
});

test('corrupt Claude config file: unknown with the error, the report survives', async () => {
  const sys = fakeSys({ files: { [PLUGINS_JSON('/h')]: '{not json' }, urls: Object.fromEntries([REL('DietrichGebert/ponytail', 'v1.5.0')]) });
  const c = (await runDoctor({ components: [plugin()] }, sys)).components[0];
  assert.equal(c.status, 'unknown');
  assert.ok(c.error);
});

test('executable candidates outside PATH: ~ and %VAR% are expanded, an unset variable skips the candidate', async () => {
  const exe = '/h/AppData/ai-memory.exe';
  const sys = fakeSys({
    env: { LOCALAPPDATA: '/h/AppData' },
    exec: { [exe + ' --version']: 'ai-memory 2.4.1' },
    urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.1')]),
  });
  const spec = { method: 'command', commands: ['ai-memory', '%NAO_EXISTE%/x', '%LOCALAPPDATA%/ai-memory.exe'], regex: '([0-9]+[.][0-9]+[.][0-9]+)' };
  const c = (await runDoctor({ components: [memCli()].map((m) => ({ ...m, installed: [spec] })) }, sys)).components[0];
  assert.equal(c.installedVersion, '2.4.1');
  assert.equal(c.status, 'ok');
  const tilde = { ...spec, commands: ['~/bin/tool'] };
  const sys2 = fakeSys({ exec: { [join('/h', 'bin', 'tool') + ' --version']: 'ai-memory 2.4.1' }, urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.1')]) });
  const c2 = (await runDoctor({ components: [{ ...memCli(), installed: [tilde] }] }, sys2)).components[0];
  assert.equal(c2.installedVersion, '2.4.1');
});

function runMain(argv, sys) {
  let out = '';
  return main(argv, sys, (text) => { out += text + '\n'; }).then((code) => ({ code, out }));
}
const registryFile = (components) => ({ '/r.json': JSON.stringify({ components }) });

test('--json prints the report as JSON and exits 1 when something needs action', async () => {
  const sys = fakeSys({
    exec: { 'graphify --version': 'graphify 0.9.53' },
    files: registryFile([cli()]),
    urls: Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]),
  });
  const { code, out } = await runMain(['--json', '--registry', '/r.json'], sys);
  const report = JSON.parse(out);
  assert.equal(report.platform, 'windows');
  assert.equal(report.components[0].id, 'graphify');
  assert.equal(report.components[0].status, 'outdated');
  assert.equal(report.components[0].source, 'https://github.com/Graphify-Labs/graphify');
  assert.equal(code, 1);
});

test('text report: per component installed or missing, versions, exact command and link, runs nothing; exits 0 when everything is current', async () => {
  const urls = Object.fromEntries([REL('Graphify-Labs/graphify', 'v0.9.72')]);
  const stale = await runMain(['--registry', '/r.json'], fakeSys({ exec: { 'graphify --version': 'graphify 0.9.53' }, files: registryFile([cli()]), urls }));
  assert.match(stale.out, /outdated/);
  assert.match(stale.out, /Graphify/);
  assert.match(stale.out, /installed 0\.9\.53/);
  assert.match(stale.out, /latest 0\.9\.72/);
  assert.match(stale.out, /uv tool upgrade graphifyy/);
  assert.match(stale.out, /https:\/\/github\.com\/Graphify-Labs\/graphify#install/);
  assert.match(stale.out, /nothing was run/i);
  const missing = await runMain(['--registry', '/r.json'], fakeSys({ files: registryFile([cli()]), urls }));
  assert.match(missing.out, /missing/);
  assert.match(missing.out, /uv tool install graphifyy/);
  const fresh = await runMain(['--registry', '/r.json'], fakeSys({ exec: { 'graphify --version': 'graphify 0.9.72' }, files: registryFile([cli()]), urls }));
  assert.equal(fresh.code, 0);
});

test('unreadable registry: clear error and exit 2', async () => {
  const { code, out } = await runMain(['--registry', '/nada.json'], fakeSys());
  assert.equal(code, 2);
  assert.match(out, /registry/i);
});

// --- the real registry (forge/components.json) ---
const REGISTRY_URL = new URL('../components.json', import.meta.url);
const real = JSON.parse(readFileSync(REGISTRY_URL, 'utf8')).components;
const PLATFORM_KEYS = ['windows', 'macos', 'linux'];
const EXTERNAL_TOOLS = ['git', 'mise']; // required by some commands, not components of their own
const commandsFor = (m, platform) => (Array.isArray(m) ? m : m[platform]);
const listedTools = (m) => (Array.isArray(m) ? m : Object.values(m ?? {}).flat());
const allCommands = (platform) => real.flatMap((c) => [c.install, c.update, ...c.installed.map((i) => i.update)].filter(Boolean).flatMap((m) => commandsFor(m, platform)));

test('real registry: every component is complete, on all three platforms, with an official https source and install link', () => {
  const ids = real.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of real) {
    assert.ok(['skill', 'plugin', 'cli', 'mcp'].includes(c.type), c.id + ' type');
    assert.ok(c.name && c.group, c.id + ' name/group');
    assert.match(c.source, /^https:\/\//, c.id + ' source');
    assert.match(c.installDocs, /^https:\/\//, c.id + ' installDocs');
    assert.ok(c.installed.length > 0);
    for (const i of c.installed) assert.ok(['command', 'pip', 'uv-tool', 'pipx', 'plugin', 'skill', 'mcp'].includes(i.method), c.id + ' detector');
    if (c.sameAs) assert.ok(ids.includes(c.sameAs), c.id + ' sameAs');
    else assert.ok(['github-release', 'github-head', 'github-frontmatter', 'npm', 'pypi'].includes(c.latest.method), c.id + ' latest');
    for (const r of listedTools(c.requires)) assert.ok(ids.includes(r) || EXTERNAL_TOOLS.includes(r), c.id + ' requires ' + r);
    for (const i of c.installed) {
      for (const r of listedTools(i.requires)) assert.ok(ids.includes(r) || EXTERNAL_TOOLS.includes(r), c.id + ' origin requires ' + r);
      if (i.update) for (const p of PLATFORM_KEYS) assert.ok(commandsFor(i.update, p).length > 0 && commandsFor(i.update, p).every((x) => typeof x === 'string' && x.trim()), `${c.id} ${i.method} update ${p}`);
    }
    for (const kind of ['install', 'update']) {
      for (const p of PLATFORM_KEYS) {
        assert.ok(Array.isArray(c[kind][p]) && c[kind][p].length > 0 && c[kind][p].every((x) => typeof x === 'string' && x.trim()), `${c.id} ${kind} ${p}`);
      }
    }
  }
});

test('real registry: covers the six component groups of the framework', () => {
  const groups = new Set(real.map((c) => c.group));
  for (const g of ['gauntlet-loop', 'ai-memory', 'ponytail', 'sdd', 'matt-pocock', 'graphify']) assert.ok(groups.has(g), g);
  const types = new Set(real.map((c) => c.type));
  for (const t of ['skill', 'plugin', 'cli', 'mcp']) assert.ok(types.has(t), t);
});

test('real registry: the groups are exactly those six (the prerequisite group aside, tdd comes with matt-pocock)', () => {
  const groups = [...new Set(real.map((c) => c.group))].filter((g) => g !== 'prerequisite').sort();
  assert.deepEqual(groups, ['ai-memory', 'gauntlet-loop', 'graphify', 'matt-pocock', 'ponytail', 'sdd']);
});

test('real registry: never pins a version (latest is always looked up, commands install the newest)', () => {
  assert.ok(!/"version"\s*:/.test(JSON.stringify(real)));
  assert.ok(!/(@v?[0-9]+[.][0-9]+|==[0-9]|--tag|\/download\/v[0-9])/.test(JSON.stringify(real.map((c) => [c.install, c.update]))));
});

test('real registry: no personal or company data', () => {
  const text = readFileSync(REGISTRY_URL, 'utf8');
  // Forbidden words are assembled from pieces so this file stays clean of them too.
  const words = [['key', 'rus'], ['one', 'drive'], ['skill', '.?', 'kri', 'ti'], ['wer', 'nik'], ['ren', 'ato']].map((w) => new RegExp(w.join(''), 'i'));
  const paths = [/C:[\/]Users/i, /\/Users\//, /\/home\/[a-z]/, /[\w.]+@[\w-]+\.[a-z]{2,}/i];
  for (const bad of [...words, ...paths]) assert.ok(!bad.test(text), String(bad));
});

test('real registry: no Windows command chains with || or && (Windows PowerShell 5.1 rejects both)', () => {
  const commands = allCommands('windows');
  assert.ok(commands.length > 10);
  for (const cmd of commands) assert.ok(!/\|\||&&/.test(cmd), cmd);
});

// A machine like the one this was written on: uv and graphify from pip, spec-kit from uv tool,
// ponytail and the graphify skill as loose skills, everything else current or absent.
const byId = (report) => Object.fromEntries(report.components.map((c) => [c.id, c]));
function pipMachine(platform = 'win32') {
  const skills = join('/h', '.claude', 'skills');
  return fakeSys({
    platform,
    exec: {
      'uv tool list': 'specify-cli v1.0.8.dev0\n- specify\n',
      'python -m pip show uv': 'Name: uv\nVersion: 0.12.9\n', 'python3 -m pip show uv': 'Name: uv\nVersion: 0.12.9\n',
      'python -m pip show graphifyy': 'Name: graphifyy\nVersion: 0.9.53\n', 'python3 -m pip show graphifyy': 'Name: graphifyy\nVersion: 0.9.53\n',
    },
    files: {
      [join(skills, 'ponytail', 'SKILL.md')]: 'old text',
      [join(skills, 'graphify', 'SKILL.md')]: '---\nname: graphify\n---\n',
      [join(skills, 'graphify', '.graphify_version')]: '0.9.53\n',
    },
    urls: {
      ...Object.fromEntries([REL('astral-sh/uv', 'v0.12.20'), REL('DietrichGebert/ponytail', 'v4.10.0'), PYPI('graphifyy', '0.9.72'), PYPI('specify-cli', '1.0.13')]),
      [RAW('DietrichGebert/ponytail', 'v4.10.0', PT_PATH)]: 'new text',
    },
  });
}

test('real registry on a pip / uv tool / loose skill machine: every outdated component gets the command of its real origin', async () => {
  const r = byId(await runDoctor({ components: real }, pipMachine()));
  assert.deepEqual(r.uv.command, ['python -m pip install --upgrade uv']);
  assert.deepEqual(r.graphify.command, ['python -m pip install --upgrade graphifyy']);
  assert.deepEqual(r['spec-kit'].command, ['uv tool upgrade specify-cli']);
  assert.deepEqual(r['spec-kit'].requires, ['uv']);
  assert.equal(r['spec-kit'].installedVersion, '1.0.8.dev0');
  assert.equal(r.ponytail.status, 'outdated');
  assert.ok(!r.ponytail.command.some((x) => x.includes('claude plugin')), 'a loose skill has no plugin to update');
  assert.ok(r.ponytail.command.some((x) => x.includes('DietrichGebert/ponytail')));
  assert.deepEqual(r['graphify-skill'].command, ['graphify install']);
  assert.deepEqual(r['graphify-skill'].requires, ['graphify']);
});

test('real registry on macOS and Linux keeps python3 for pip; the same machine on Linux shows mise for ai-memory', async () => {
  const mac = byId(await runDoctor({ components: real }, pipMachine('darwin')));
  assert.deepEqual(mac.uv.command, ['python3 -m pip install --upgrade uv']);
  const linux = byId(await runDoctor({ components: real }, fakeSys({ platform: 'linux', urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.2')]) })));
  assert.deepEqual(linux['ai-memory'].requires, ['mise']);
  const windows = byId(await runDoctor({ components: real }, fakeSys({ urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.2')]) })));
  assert.deepEqual(windows['ai-memory'].requires, []);
});

// The MCP server keeps ai-memory.exe open. Windows lets a running .exe be renamed but not overwritten,
// so the update sequence must move the old file aside (dropping an earlier .old) before extracting.
const aimemory = (version, platform = 'win32') => fakeSys({
  platform,
  exec: { 'ai-memory --version': 'ai-memory ' + version },
  files: { [CLAUDE_JSON('/h')]: JSON.stringify({ mcpServers: { 'ai-memory': {} } }) },
  urls: Object.fromEntries([REL('akitaonrails/ai-memory', 'v2.4.2')]),
});

test('real registry, Windows: the ai-memory update (CLI and MCP) frees the running .exe before extracting', async () => {
  const r = byId(await runDoctor({ components: real }, aimemory('2.4.1')));
  for (const id of ['ai-memory', 'ai-memory-mcp']) {
    assert.equal(r[id].status, 'outdated', id);
    const [cmd] = r[id].command;
    const at = (needle) => cmd.indexOf(needle);
    assert.ok(at('Remove-Item "$Exe.old"') >= 0, id + ' drops an earlier .old');
    assert.ok(at('Rename-Item $Exe "ai-memory.exe.old"') > at('Remove-Item "$Exe.old"'), id + ' renames the running exe aside');
    assert.ok(at('Expand-Archive') > at('Rename-Item'), id + ' extracts only after the rename');
    assert.equal(at('$ErrorActionPreference = "Stop"'), 0, id + ' stops at the first failure');
  }
});

test('real registry: an ai-memory update tells the user to restart the ai-memory serve process, not Claude Code, on every platform', async () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const r = byId(await runDoctor({ components: real }, aimemory('2.4.1', platform)));
    for (const id of ['ai-memory', 'ai-memory-mcp']) assert.match((r[id].notes ?? []).join(' '), /Restart the `ai-memory serve` process/, platform + ' ' + id);
  }
});

test('real registry: no restart note when ai-memory is current; the text report shows the note under the command', async () => {
  const current = byId(await runDoctor({ components: real }, aimemory('2.4.2')));
  assert.equal(current['ai-memory'].notes, undefined);
  const path = fileURLToPath(REGISTRY_URL);
  let out = '';
  const sys = aimemory('2.4.1');
  const files = { [path]: readFileSync(REGISTRY_URL, 'utf8'), [CLAUDE_JSON('/h')]: JSON.stringify({ mcpServers: { 'ai-memory': {} } }) };
  await main(['--registry', path], { ...sys, readFile: async (f) => files[f] ?? null }, (s) => { out = s; });
  assert.match(out, /^ {4}note: Restart the `ai-memory serve` process/m);
});

test('entry point: run as a script it reports a missing registry with exit 2', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./doctor.mjs', import.meta.url)), '--registry', join(tmpdir(), 'forge-no-such-registry.json')], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stdout, /Cannot read the component registry/);
});
