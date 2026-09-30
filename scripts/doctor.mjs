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

// "~" is the home dir, "%VAR%" an environment variable; null when the variable is not set.
function expand(cmd, sys) {
  const home = cmd.startsWith('~/') ? join(sys.home, cmd.slice(2)) : cmd;
  const vars = [...home.matchAll(/%(\w+)%/g)].map((m) => m[1]);
  return vars.some((v) => sys.env[v] === undefined) ? null : home.replace(/%(\w+)%/g, (_, v) => sys.env[v]);
}

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
  async plugin(spec, sys) {
    const raw = await sys.readFile(join(sys.home, '.claude', 'plugins', 'installed_plugins.json'));
    const entry = raw && JSON.parse(raw).plugins?.[spec.id]?.[0];
    return entry ? { version: entry.version ?? null } : null;
  },
  async skill(spec, sys) {
    const dir = join(sys.home, '.claude', 'skills', spec.name);
    const content = await sys.readFile(join(dir, 'SKILL.md'));
    if (content === null) return null;
    const fromFile = spec.versionFile && (await sys.readFile(join(dir, spec.versionFile)));
    const version = fromFile?.trim() || content.split('---')[1]?.match(/^version:\s*(\S+)/m)?.[1] || null;
    return { version, content };
  },
  async mcp(spec, sys) {
    const raw = await sys.readFile(join(sys.home, '.claude.json'));
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

// The detector that found the component may bring its own update command (pip, uv tool, loose skill...).
const withCommand = (c, r, platform, origin) => {
  const command = r.status === 'missing' ? c.install[platform] : r.status === 'outdated' ? forPlatform(origin?.update, platform) ?? c.update[platform] : null;
  const requires = command ? forPlatform(origin?.requires ?? c.requires, platform) ?? [] : [];
  const notes = r.status === 'outdated' ? forPlatform(c.afterUpdate, platform) : null;
  return { ...r, command, requires, ...(notes?.length && { notes }) };
};

async function checkComponent(c, sys, platform) {
  const r = { ...meta(c), installed: false, installedVersion: null, latestVersion: null };
  const [found, detectError] = await attempt(() => detect(c.installed, sys));
  if (detectError) return { ...r, status: 'unknown', error: detectError, command: null };
  const [latest, latestError] = await attempt(() => finders[c.latest.method](c.latest, sys));
  if (!found) return withCommand(c, { ...r, status: 'missing', latestVersion: latest?.version ?? null, ...(latestError && { error: latestError }) }, platform);
  r.installed = true;
  r.installedVersion = found.version;
  if (latestError) return { ...r, status: 'unknown', error: latestError, command: null };
  r.latestVersion = latest.version;
  if (found.version === null && found.content != null && c.latest.content) {
    const [remote] = await attempt(() => sys.fetchText(rawUrl(c.latest.repo, latest.ref, c.latest.content.path)));
    if (remote !== null && normalize(remote) === normalize(found.content)) {
      r.installedVersion = latest.version;
      r.versionSource = 'content';
    }
  }
  return withCommand(c, { ...r, status: isCurrent(r.installedVersion, latest.version) ? 'ok' : 'outdated' }, platform, found.origin);
}

// A component with sameAs is a registration of another one (an MCP server of a CLI): same version, same latest.
async function followOwner(c, owner, sys, platform) {
  const r = { ...meta(c), installed: false, installedVersion: null, latestVersion: owner.latestVersion };
  const [found, detectError] = await attempt(() => detect(c.installed, sys));
  if (detectError) return { ...r, status: 'unknown', error: detectError, command: null };
  if (!found) return withCommand(c, { ...r, status: 'missing' }, platform);
  // Registered without its owner: the registration cannot work until the owner is installed, so the fix is the owner's.
  const orphan = owner.status === 'missing';
  const next = { ...r, installed: true, installedVersion: owner.installedVersion, status: orphan ? 'outdated' : owner.status, ...(owner.error && { error: owner.error }) };
  return orphan ? { ...next, command: owner.command, requires: owner.requires } : withCommand(c, next, platform);
}

export async function runDoctor(registry, sys) {
  const platform = { win32: 'windows', darwin: 'macos' }[sys.platform] || 'linux';
  const own = registry.components.filter((c) => !c.sameAs);
  const done = Object.fromEntries((await Promise.all(own.map((c) => checkComponent(c, sys, platform)))).map((r) => [r.id, r]));
  const components = await Promise.all(registry.components.map((c) => (c.sameAs ? followOwner(c, done[c.sameAs], sys, platform) : done[c.id])));
  return { platform, components };
}

function formatText(report) {
  const lines = [`forge doctor - platform: ${report.platform}`, ''];
  for (const c of report.components) {
    const installed = c.installed ? `installed ${c.installedVersion ?? 'version unknown'}${c.versionSource ? ` (by ${c.versionSource})` : ''}` : 'not installed';
    lines.push(`[${c.status}] ${c.name} (${c.type}) - ${installed} - latest ${c.latestVersion ?? 'unknown'}`);
    if (c.error) lines.push(`    error: ${c.error}`);
    if (c.requires?.length) lines.push(`    requires: ${c.requires.join(', ')}`);
    for (const cmd of c.command ?? []) lines.push(`    run: ${cmd}`);
    for (const note of c.notes ?? []) lines.push(`    note: ${note}`);
    if (c.command) lines.push(`    docs: ${c.installDocs}`);
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
