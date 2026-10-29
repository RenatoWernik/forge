import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stripV = (v) => String(v).replace(/^v/i, '');

const numbers = (v) => stripV(v).match(/^\d+(?:\.\d+)*/)?.[0].split('.').map(Number) ?? [];

// -1, 0, 1. A suffix after the numbers (dev0, rc1, beta) sorts below the plain release.
export function compareVersions(a, b) {
  const x = numbers(a), y = numbers(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  const pre = (v) => /^v?\d+(?:\.\d+)*[.\-+]?[a-z]/i.test(v);
  return Math.sign(Number(pre(b)) - Number(pre(a)));
}

// "~" is the home dir, "%VAR%" an environment variable; null when the variable is not set (or empty).
function expand(cmd, sys) {
  const home = cmd.startsWith('~/') ? join(sys.home, cmd.slice(2)) : cmd;
  const vars = [...home.matchAll(/%(\w+)%/g)].map((m) => m[1]);
  return vars.some((v) => !sys.env[v]) ? null : home.replace(/%(\w+)%/g, (_, v) => sys.env[v]);
}

// C0, C1, DEL (all of \p{Cc}) and the Unicode line and paragraph separators. Not global, so test() keeps no state.
const CONTROL_RE = /[\p{Cc}\u2028\u2029]/u;
const PLUGIN_ID =/^[A-Za-z0-9][\w.-]*@[\w.-]+$/;

// The Claude config folder and its .claude.json: CLAUDE_CONFIG_DIR when set (always from sys.env), else under the home dir.
const configDir = (sys) => sys.env.CLAUDE_CONFIG_DIR || join(sys.home, '.claude');
const claudeJson = (sys) => (sys.env.CLAUDE_CONFIG_DIR ? join(sys.env.CLAUDE_CONFIG_DIR, '.claude.json') : join(sys.home, '.claude.json'));

// A value read from the environment or from a file enters a printed command only inside single quotes, where nothing is code.
// PowerShell also treats the typographic single quotes as quotes, so those are doubled too.
const quote = (value, platform) => (platform === 'windows' ? `'${value.replace(/['‘’‚‛]/g, '$&$&')}'` : `'${value.replaceAll("'", "'\\''")}'`);
const asArgument = (value, platform) => (/^[\w.@-]+$/.test(value) ? value : quote(value, platform));

// {slot} in a registry command: one pass, so a substituted value is never read as a slot itself.
const fill = (commands, slots) => commands.map((c) => c.replace(/\{(\w+)\}/g, (m, k) => (k in slots ? slots[k] : m)));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Package managers list their own packages: whichever lists it is how it was installed.
const listed = (candidates, args, line) => async (spec, sys) => {
  for (const cmd of candidates) {
    try {
      const version = (await sys.exec(cmd, args(spec))).match(new RegExp(line(escapeRe(spec.package)), 'm'))?.[1];
      return version ? { version } : null;
    } catch { /* try the next candidate */ }
  }
  return null;
};

const detectors = {
  pip: listed(['python', 'python3'], (s) => ['-m', 'pip', 'show', s.package], () => '^Version:\\s*(\\S+)'),
  'uv-tool': listed(['uv'], () => ['tool', 'list'], (p) => `^${p}\\s+v(\\S+)`),
  pipx: listed(['pipx'], () => ['list', '--short'], (p) => `^${p}\\s+v?(\\S+)`),
  async command(spec, sys) {
    for (const candidate of spec.commands) {
      const cmd = expand(candidate, sys);
      if (cmd === null) continue;
      try {
        const out = await sys.exec(cmd, spec.args ?? ['--version']);
        return { version: out.match(new RegExp(spec.regex))?.[1] ?? null };
      } catch { /* try the next candidate */ }
    }
    return null;
  },
  // spec.id is one plugin; spec.name is the plugin under any marketplace (<name>@<marketplace>), one instance for each.
  async plugin(spec, sys) {
    const raw = await sys.readFile(join(configDir(sys), 'plugins', 'installed_plugins.json'));
    if (!raw) return null;
    const plugins = JSON.parse(raw).plugins;
    if (spec.id) {
      const entry = plugins?.[spec.id]?.[0];
      return entry ? { version: entry.version ?? null } : null;
    }
    // Only well-formed ids count: anything else (control characters, quotes, spaces) is ignored, never echoed.
    const ours = Object.entries(plugins ?? {}).filter(([id, entries]) => id.startsWith(spec.name + '@') && entries?.[0]);
    const instances = ours.filter(([id]) => PLUGIN_ID.test(id)).map(([id, [entry]]) => ({ id, version: entry.version ?? null }));
    return ours.length ? { version: instances[0]?.version ?? null, instances, ignored: ours.length - instances.length } : null;
  },
  async skill(spec, sys) {
    const dir = join(configDir(sys), 'skills', spec.name);
    const content = await sys.readFile(join(dir, 'SKILL.md'));
    if (content === null) return null;
    const fromFile = spec.versionFile && (await sys.readFile(join(dir, spec.versionFile)));
    const version = fromFile?.trim() || content.split('---')[1]?.match(/^version:\s*(\S+)/m)?.[1] || null;
    return { version, content };
  },
  async mcp(spec, sys) {
    const raw = await sys.readFile(claudeJson(sys));
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    const scopes = [cfg, ...Object.values(cfg.projects ?? {})];
    return scopes.some((s) => s.mcpServers?.[spec.name]) ? { version: null } : null;
  },
};

const rawUrl = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;

// Every finder answers { version, ref }: ref is what raw file URLs are read at.
const finders = {
  async 'github-release'(spec, sys) {
    const tag = JSON.parse(await sys.fetchText(`https://api.github.com/repos/${spec.repo}/releases/latest`)).tag_name;
    return { version: stripV(tag), ref: tag };
  },
  async 'github-head'(spec, sys) {
    const { sha } = JSON.parse(await sys.fetchText(`https://api.github.com/repos/${spec.repo}/commits/HEAD`));
    return { version: sha.slice(0, 7), ref: sha };
  },
  async 'github-frontmatter'(spec, sys) {
    const text = await sys.fetchText(rawUrl(spec.repo, 'HEAD', spec.path));
    return { version: text.split('---')[1]?.match(/^version:\s*(\S+)/m)?.[1], ref: 'HEAD' };
  },
  async npm(spec, sys) {
    return { version: JSON.parse(await sys.fetchText(`https://registry.npmjs.org/${spec.package}/latest`)).version };
  },
  async pypi(spec, sys) {
    return { version: JSON.parse(await sys.fetchText(`https://pypi.org/pypi/${spec.package}/json`)).info.version };
  },
};

async function detect(specs, sys) {
  for (const spec of specs) {
    const found = await detectors[spec.method](spec, sys);
    if (found) return { ...found, origin: spec };
  }
  return null;
}

const normalize = (text) => text.replaceAll('\r\n', '\n').trim();
const isSemver = (v) => /^\d+\.\d+/.test(v);

const isCurrent = (installed, latest) => installed !== null && (isSemver(installed) && isSemver(latest) ? compareVersions(installed, latest) >= 0 : installed === latest);

const meta = (c) => ({ id: c.id, name: c.name, type: c.type, group: c.group, source: c.source, installDocs: c.installDocs });

const attempt = async (fn) => {
  try { return [await fn(), null]; } catch (e) { return [null, e.message]; }
};

// A shortcut list holds for every platform.
const forPlatform = (m, platform) => (Array.isArray(m) ? m : m?.[platform]);

// Slots of the printed commands: {claudeDir} is the Claude config folder; each variable of whenEnv is its (quoted) value.
const slotsFor = (c, sys, platform) => ({
  claudeDir: sys.env.CLAUDE_CONFIG_DIR ? quote(sys.env.CLAUDE_CONFIG_DIR, platform) : '"$HOME/.claude"',
  ...Object.fromEntries(Object.keys(c.whenEnv ?? {}).filter((k) => sys.env[k]).map((k) => [k, quote(sys.env[k], platform)])),
});

// The detector that found the component may bring its own update command (pip, uv tool, loose skill...).
// With a variable of whenEnv set (AI_MEMORY_BIN), the commands are the ones for that variable, never the default location.
const withCommand = (c, r, platform, origin, sys) => {
  const slots = slotsFor(c, sys, platform);
  const own = c.whenEnv?.[Object.keys(c.whenEnv).find((k) => sys.env[k])] ?? c;
  const list = r.status === 'missing' ? own.install[platform] : r.status === 'outdated' ? forPlatform(origin?.update, platform) ?? own.update[platform] : null;
  const command = list && fill(list, slots);
  const requires = command ? forPlatform(origin?.requires ?? own.requires, platform) ?? [] : [];
  const notes = r.status === 'outdated' ? forPlatform(c.afterUpdate, platform) : null;
  return { ...r, command, requires, ...(notes?.length && { notes }) };
};

// A plugin found under several marketplaces: one row each, updated through the marketplace it came from (never a missing one).
function instancesResult(c, r, found, latest, platform, sys) {
  const instances = found.instances.map((i) => ({ ...i, status: isCurrent(i.version, latest.version) ? 'ok' : 'outdated' }));
  const stale = instances.filter((i) => i.status === 'outdated');
  const notes = stale.length ? forPlatform(c.afterUpdate, platform) : null;
  const command = stale.length ? stale.flatMap((i) => fill(forPlatform(found.origin.update, platform), { id: asArgument(i.id, platform) })) : null;
  return {
    ...r, instances, installedVersion: (stale[0] ?? instances[0]).version, status: stale.length ? 'outdated' : 'ok', command,
    requires: command ? forPlatform(found.origin.requires ?? c.requires, platform) ?? [] : [], ...(notes?.length && { notes }),
  };
}

async function checkComponent(c, sys, platform) {
  const r = { ...meta(c), installed: false, installedVersion: null, latestVersion: null };
  let [found, detectError] = await attempt(() => detect(c.installed, sys));
  if (detectError) return { ...r, status: 'unknown', error: detectError, command: null };
  if (found?.ignored) r.warnings = [`${found.ignored} plugin id(s) ignored: not a valid plugin id`];
  if (found?.instances && !found.instances.length) found = null;
  const [latest, latestError] = await attempt(() => finders[c.latest.method](c.latest, sys));
  if (!found) return withCommand(c, { ...r, status: 'missing', latestVersion: latest?.version ?? null, ...(latestError && { error: latestError }) }, platform, undefined, sys);
  r.installed = true;
  r.installedVersion = found.version;
  if (latestError) return { ...r, status: 'unknown', error: latestError, command: null };
  r.latestVersion = latest.version;
  if (found.instances) return instancesResult(c, r, found, latest, platform, sys);
  if (found.version === null && found.content != null && c.latest.content) {
    const [remote] = await attempt(() => sys.fetchText(rawUrl(c.latest.repo, latest.ref, c.latest.content.path)));
    if (remote !== null && normalize(remote) === normalize(found.content)) {
      r.installedVersion = latest.version;
      r.versionSource = 'content';
    }
  }
  return withCommand(c, { ...r, status: isCurrent(r.installedVersion, latest.version) ? 'ok' : 'outdated' }, platform, found.origin, sys);
}

// A component with sameAs is a registration of another one (an MCP server of a CLI): same version, same latest.
async function followOwner(c, owner, sys, platform) {
  const r = { ...meta(c), installed: false, installedVersion: null, latestVersion: owner.latestVersion };
  const [found, detectError] = await attempt(() => detect(c.installed, sys));
  if (detectError) return { ...r, status: 'unknown', error: detectError, command: null };
  if (!found) return withCommand(c, { ...r, status: 'missing' }, platform, undefined, sys);
  // Registered without its owner: the registration cannot work until the owner is installed, so the fix is the owner's.
  const orphan = owner.status === 'missing';
  const next = { ...r, installed: true, installedVersion: owner.installedVersion, status: orphan ? 'outdated' : owner.status, ...(owner.error && { error: owner.error }) };
  return orphan ? { ...next, command: owner.command, requires: owner.requires } : withCommand(c, next, platform, undefined, sys);
}

export async function runDoctor(registry, sys) {
  const platform = { win32: 'windows', darwin: 'macos' }[sys.platform] || 'linux';
  const own = registry.components.filter((c) => !c.sameAs);
  const done = Object.fromEntries((await Promise.all(own.map((c) => checkComponent(c, sys, platform)))).map((r) => [r.id, r]));
  const components = await Promise.all(registry.components.map((c) => (c.sameAs ? followOwner(c, done[c.sameAs], sys, platform) : done[c.id])));
  return { platform, components };
}

function formatText(report) {
  // This text is what an agent reads and follows: a value that came from a file or the environment never ends a line or starts
  // a new one. Control characters are shown escaped, and a command that has one is not shown at all.
  const show = (v) => String(v).replace(new RegExp(CONTROL_RE.source, 'gu'), (ch) => '\\u' + ch.codePointAt(0).toString(16).padStart(4, '0'));
  const lines = [`forge doctor - platform: ${show(report.platform)}`, ''];
  for (const c of report.components) {
    const installed = c.installed ? `installed ${show(c.installedVersion ?? 'version unknown')}${c.versionSource ? ` (by ${show(c.versionSource)})` : ''}` : 'not installed';
    lines.push(`[${show(c.status)}] ${show(c.name)} (${show(c.type)}) - ${installed} - latest ${show(c.latestVersion ?? 'unknown')}`);
    for (const i of c.instances ?? []) lines.push(`    ${show(i.id)} ${show(i.version ?? 'version unknown')} (${show(i.status)})`);
    for (const w of c.warnings ?? []) lines.push(`    warning: ${show(w)}`);
    if (c.error) lines.push(`    error: ${show(c.error)}`);
    if (c.requires?.length) lines.push(`    requires: ${show(c.requires.join(', '))}`);
    for (const cmd of c.command ?? []) lines.push(CONTROL_RE.test(cmd) ? '    run: [not shown: the command has control characters]' : `    run: ${cmd}`);
    for (const note of c.notes ?? []) lines.push(`    note: ${show(note)}`);
    if (c.command) lines.push(`    docs: ${show(c.installDocs)}`);
  }
  const count = (s) => report.components.filter((c) => c.status === s).length;
  lines.push('', ['ok', 'outdated', 'missing', 'unknown'].map((s) => `${count(s)} ${s}`).join(', '));
  lines.push('Nothing was run. Ask the user before running any command above.');
  return lines.join('\n');
}

export async function main(argv, sys, write) {
  const at = argv.indexOf('--registry');
  const registryPath = at >= 0 ? argv[at + 1] : fileURLToPath(new URL('../components.json', import.meta.url));
  let registry;
  try {
    const raw = await sys.readFile(registryPath);
    if (raw === null) throw new Error('file not found');
    registry = JSON.parse(raw);
    if (!Array.isArray(registry.components)) throw new Error('missing "components" array');
  } catch (e) {
    write(`Cannot read the component registry at ${registryPath}: ${e.message}`);
    return 2;
  }
  const report = await runDoctor(registry, sys);
  write(argv.includes('--json') ? JSON.stringify(report, null, 2) : formatText(report));
  return report.components.every((c) => c.status === 'ok') ? 0 : 1;
}

const realSys = {
  platform: process.platform,
  home: homedir(),
  env: process.env,
  exec: (cmd, args) => new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => (err ? reject(err) : resolve(stdout + stderr)));
  }),
  readFile: (path) => readFile(path, 'utf8').catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e))),
  async fetchText(url) {
    const headers = { 'user-agent': 'forge-doctor' };
    if (process.env.GITHUB_TOKEN && new URL(url).host === 'api.github.com') headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.text();
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), realSys, console.log);
}
