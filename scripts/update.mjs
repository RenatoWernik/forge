import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareVersions, runDoctor } from './doctor.mjs';

// /forge:update. --check (the default) reads and reports; --apply <id> --yes runs, for one component, the command the doctor prints for
// it. Exit codes: 0 done (or all ok), 1 any other error, 2 invalid use or a forbidden target, 3 a barrier that was not confirmed.
const FORGE = { repo: 'RenatoWernik/forge', plugin: 'forge@forge', commands: ['claude plugin marketplace update forge', 'claude plugin update forge@forge'] };
const SPECKIT_PROJECT = 'specify integration upgrade claude';
const FLAGS = ['--check', '--json', '--yes', '--accept-unverified', '--backup-confirmed', '--overwrite'];
const STATUSES = ['ok', 'outdated', 'unverified', 'customized', 'missing', 'unknown'];
const USAGE = 'Usage: update.mjs [--check] [--json] [--versions <fixture.json>]\n       update.mjs --apply <id> --yes [--accept-unverified] [--backup-confirmed] [--overwrite] [--project <dir>]\n       <id> is one component of the registry, forge, or speckit-project (with --project).';

const CONTROL_RE = new RegExp('[\\p{Cc}\\u2028\\u2029]', 'gu');
// A value that came from a file, the environment or a command never ends a line or starts a new one.
const show = (v) => String(v).replace(CONTROL_RE, (ch) => '\\u' + ch.codePointAt(0).toString(16).padStart(4, '0'));
const quote = (v) => `'${String(v).replaceAll("'", "'\\''")}'`;

const norm = (text) => text.replaceAll('\r\n', '\n').trim();
const sha256 = (text) => createHash('sha256').update(norm(text)).digest('hex');
const isSemver = (v) => /^\d+\.\d+/.test(v);
const configDir = (sys) => sys.env.CLAUDE_CONFIG_DIR || join(sys.home, '.claude');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

async function load(sys, path, key) {
  const raw = await sys.readFile(path);
  if (raw === null) throw new Error('file not found');
  const json = JSON.parse(raw);
  if (!json[key] || typeof json[key] !== 'object') throw new Error(`missing "${key}"`);
  return json;
}

function parse(argv) {
  const o = { flags: new Set(), applies: [], extra: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? undefined : argv[++i]);
    if (a === '--apply') o.applies.push(value() ?? null);
    else if (a === '--versions' || a === '--project') { o[a.slice(2)] = value(); if (o[a.slice(2)] === undefined) o.error = `${a} needs a value`; }
    else if (FLAGS.includes(a)) o.flags.add(a);
    else o.extra.push(a);
  }
  if (o.extra.length) o.error = `unknown option or extra id: ${show(o.extra[0])}`;
  else if (o.applies.length > 1) o.error = 'one --apply, one id: a yes covers a single component';
  else if (o.applies[0] === null) o.error = '--apply needs an id';
  else if (o.applies.length && o.flags.has('--check')) o.error = '--check reads and --apply runs: pick one';
  return o;
}

// The versions fixture is the only source of versions: nothing else is read from the network.
const fromFixture = (urls) => async (url) => {
  if (!Object.hasOwn(urls, url)) throw new Error('not in the versions fixture: ' + url);
  return typeof urls[url] === 'string' ? urls[url] : JSON.stringify(urls[url]);
};

const installedPlugin = async (sys, id) => {
  const raw = await sys.readFile(join(configDir(sys), 'plugins', 'installed_plugins.json'));
  return raw ? JSON.parse(raw).plugins?.[id]?.[0] : undefined;
};

// A version a file says it has is not trusted as it is: only plain hex shas are compared and printed.
const sha7 = (v) => (/^[0-9a-f]{7,40}$/i.test(String(v)) ? String(v).slice(0, 7) : null);

// The forge plugin has no release: its latest is the commit at the head of main, the installed one is its gitCommitSha.
async function checkForge(sys) {
  const r = { id: 'forge', name: 'forge plugin', type: 'plugin', group: 'forge', installed: false, installedVersion: null, latestVersion: null, verifiedWith: null };
  const [entry, entryError] = await settle(() => installedPlugin(sys, FORGE.plugin));
  const [latest, latestError] = await settle(async () => sha7(JSON.parse(await sys.fetchText(`https://api.github.com/repos/${FORGE.repo}/commits/HEAD`)).sha) ?? Promise.reject(new Error('not a commit sha')));
  r.latestVersion = latest;
  if (entryError) return { ...r, status: 'unknown', error: entryError };
  if (!entry) return { ...r, status: 'missing', ...(latestError && { error: latestError }) };
  const installed = sha7(entry.gitCommitSha);
  Object.assign(r, { installed: true, installedVersion: installed ?? (entry.version == null ? null : show(entry.version)) });
  if (latestError) return { ...r, status: 'unknown', error: latestError };
  if (!installed) return { ...r, status: 'unknown', error: 'the plugin has no gitCommitSha in installed_plugins.json' };
  return { ...r, status: installed === latest ? 'ok' : 'outdated' };
}

async function settle(fn) {
  try { return [await fn(), null]; } catch (e) { return [null, e.message]; }
}

const above = (latest, verified) => latest != null && verified != null
  && (isSemver(latest) && isSemver(verified) ? compareVersions(latest, verified) > 0 : !(String(latest).startsWith(verified) || String(verified).startsWith(latest)));

// The notes of the versions between the installed one (excluded) and the latest (included). With the installed version unknown,
// every note up to the latest counts: it may be crossed.
const crossed = (notes, installed, latest) => (!isSemver(latest ?? '') ? [] : Object.entries(notes ?? {})
  .filter(([v]) => compareVersions(v, latest) <= 0 && (!isSemver(installed ?? '') || compareVersions(v, installed) > 0))
  .sort(([a], [b]) => compareVersions(a, b))
  .map(([version, n]) => ({ version, text: typeof n === 'string' ? n : n.text, requiresBackup: n.requiresBackup === true })));

// The skill folders whose SKILL.md matches no published version. A plugin install is never customized, and neither is the file that the\n// doctor found equal to the latest content (a release the pristine does not list yet).
async function customFolders(c, entry, r, sys) {
  if (!entry?.pristine || !r.installed) return [];
  const plugin = c.installed.find((d) => d.method === 'plugin' && d.id);
  if (plugin && (await installedPlugin(sys, plugin.id))) return [];
  const latest = r.versionSource === 'content' ? `${c.installed.find((d) => d.method === 'skill')?.name}/SKILL.md` : null;
  const folders = [];
  for (const [file, versions] of Object.entries(entry.pristine).filter(([f]) => f !== latest)) {
    const text = await sys.readFile(join(configDir(sys), 'skills', ...file.split('/')));
    if (text !== null && !versions.some((v) => v.sha256 === sha256(text))) folders.push(file.split('/')[0]);
  }
  return folders;
}

async function layer(c, r, entry, sys) {
  const { notes: afterUpdate, ...rest } = r;
  const folders = await customFolders(c, entry, r, sys);
  const verifiedWith = entry?.verifiedWith ?? null;
  const untested = r.status === 'outdated' && above(r.latestVersion, verifiedWith);
  const versionNotes = r.status === 'outdated' ? crossed(entry?.notes, r.installedVersion, r.latestVersion) : [];
  const status = folders.length ? 'customized' : untested ? 'unverified' : r.status;
  return { ...rest, status, verifiedWith, untested, versionNotes, customized: folders, ...(afterUpdate && { afterUpdate }), pristine: entry?.pristine };
}

async function upstreamWarnings(compat, sys, rows) {
  const up = compat.components?.['gauntlet-loop']?.upstream;
  if (!up || !rows.find((r) => r.id === 'gauntlet-loop')?.installed || !/^[\w.-]+\/[\w.-]+$/.test(up.repo) || !/^[0-9a-f]{7,40}$/.test(up.base)) return [];
  const [ahead] = await settle(async () => Number(JSON.parse(await sys.fetchText(`https://api.github.com/repos/${up.repo}/compare/${up.base}...HEAD`)).ahead_by));
  return ahead > 0 ? [`${up.repo} has ${ahead} new commits since the base of the fork (${up.base}): review them and bring them to the fork if you want; they are never applied for you`] : [];
}

async function check(registry, compat, sys, only) {
  const doctor = await runDoctor(only ? { components: registry.components.filter((c) => only.includes(c.id)) } : registry, sys);
  const byId = Object.fromEntries(registry.components.map((c) => [c.id, c]));
  const rows = [];
  for (const r of doctor.components) rows.push(await layer(byId[r.id], r, compat.components?.[r.id], sys));
  if (!only) rows.push(await checkForge(sys));
  return { platform: doctor.platform, configDir: configDir(sys), components: rows, warnings: only ? [] : await upstreamWarnings(compat, sys, rows) };
}

const arrow = (c) => `${show(c.installedVersion ?? 'version unknown')} -> ${show(c.latestVersion ?? 'unknown')}`;

function formatRow(c, dir) {
  const where = c.installed ? (c.status === 'ok' ? `installed ${show(c.installedVersion ?? 'version unknown')} (latest ${show(c.latestVersion ?? 'unknown')})` : `installed ${arrow(c)}`) : `not installed (latest ${show(c.latestVersion ?? 'unknown')})`;
  const lines = [`[${c.status}] ${show(c.name)} (${show(c.type)}) - ${where}${c.verifiedWith ? ` - verified with ${show(c.verifiedWith)}` : ''}`];
  for (const i of c.instances ?? []) lines.push(`    ${show(i.id)} ${show(i.version ?? 'version unknown')} (${show(i.status)})`);
  for (const w of c.warnings ?? []) lines.push(`    warning: ${show(w)}`);
  if (c.error) lines.push(`    error: ${show(c.error)}`);
  if (c.status === 'unverified') lines.push(`    ${show(c.latestVersion)} is not tested with forge (verified with ${show(c.verifiedWith)}): the update needs --accept-unverified`);
  if (c.status === 'customized') {
    const first = Object.entries(c.pristine ?? {}).find(([file]) => c.customized.includes(file.split('/')[0]));
    const local = join(dir, 'skills', ...(first?.[0] ?? c.customized[0]).split('/'));
    lines.push(`    your copy (${show(c.customized.join(', '))}) is not any published version: it will not be touched unless you apply with --overwrite, and a backup goes to forge-backups first`);
    if (first) lines.push(`    see the difference: diff ${quote(local)} <(curl -fsSL ${quote(first[1][0].url)})`);
  }
  for (const n of c.versionNotes ?? []) lines.push(`    note ${show(n.version)}${n.requiresBackup ? ' (needs a backup)' : ''}: ${show(n.text)}`);
  if (['outdated', 'unverified', 'customized'].includes(c.status)) lines.push(`    update: update.mjs --apply ${c.id} --yes${c.status === 'customized' ? ' (--overwrite replaces your copy)' : ''}`);
  return lines;
}

function formatText(report) {
  const lines = [`forge update - platform: ${show(report.platform)}`, ''];
  for (const c of report.components) lines.push(...formatRow(c, report.configDir));
  for (const w of report.warnings) lines.push('', `warning: ${show(w)}`);
  lines.push('', STATUSES.map((s) => `${report.components.filter((c) => c.status === s).length} ${s}`).join(', '));
  lines.push('speckit-project: inside a project with .specify/, update.mjs --apply speckit-project --project <dir> --yes');
  lines.push('Nothing was run and nothing was written. Ask the user before running --apply.');
  return lines.join('\n');
}

const toJson = (c) => { const { pristine, ...rest } = c; return c.status === 'customized' ? { ...rest, command: null } : rest; };

const shell = (cmd, sys) => (sys.platform === 'win32' ? sys.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], {}) : sys.run('sh', ['-c', cmd], {}));

// The commands are constants (never built from a path or a version); the project directory only ever goes in the cwd.
async function runAll(runners, write) {
  for (const run of runners) {
    try {
      const out = (await run()).trim();
      if (out) for (const line of out.split(/\r?\n/).slice(-40)) write(`    ${show(line)}`);
    } catch (e) {
      write(`The command failed: ${show(String(e.message).trim().split(/\r?\n/).slice(-10).join(' | '))}`);
      return false;
    }
  }
  return true;
}

async function backup(c, sys, write) {
  const base = join(configDir(sys), 'forge-backups', `${c.id}-${stamp()}`);
  // one pristine file: its folder is the backup; several (the loose ponytail skills): one subfolder each
  const flat = Object.keys(c.pristine).length === 1;
  try {
    for (const folder of c.customized) await sys.copyDir(join(configDir(sys), 'skills', folder), flat ? base : join(base, folder));
  } catch (e) {
    write(`The backup of your customized copy failed, nothing was run: ${show(e.message)}`);
    return null;
  }
  write(`Backup of your customized copy: ${show(base)}`);
  return base;
}

// (h): the check of the component after the commands, and the exit code that follows from it.
function finish(after, write, dir) {
  for (const line of formatRow(after, dir)) write(line);
  return after.status === 'ok' ? 0 : 1;
}

async function applyForge(o, ctx) {
  const { sys, write, row } = ctx;
  if (row.status === 'ok') { write('forge is already up to date.'); return 0; }
  if (row.status !== 'outdated') { write(`forge is ${row.status}: nothing to update (install it from the marketplace first).`); return 1; }
  write(`Updating forge: ${arrow(row)}`);
  for (const cmd of FORGE.commands) write(`    run: ${cmd}`);
  if (!o.flags.has('--yes')) { write('Nothing was run: add --yes to confirm.'); return 3; }
  if (!(await runAll(FORGE.commands.map((cmd) => () => sys.run(cmd, [], { shell: true })), write))) return 1;
  write('Restart Claude Code to load the new version.');
  return finish(await checkForge(sys), write, configDir(sys));
}

async function applySpeckitProject(o, ctx) {
  const { sys, write, by } = ctx;
  if (!o.project) { write('speckit-project needs --project <dir>.'); return 2; }
  // shortcut: sys has no stat, and reading a directory fails with EISDIR, which is how a directory is told from a file or nothing
  const isDir = await sys.readFile(join(o.project, '.specify')).then(() => false, (e) => e.code === 'EISDIR');
  if (!isDir) { write('That folder is not a Spec-Kit project (no .specify/).'); return 2; }
  if (by['spec-kit'].status !== 'ok') { write(`spec-kit is ${by['spec-kit'].status}: update it first (--apply spec-kit).`); return 1; }
  write(`Upgrading the Spec-Kit files of the project: run in the project folder: ${SPECKIT_PROJECT}`);
  if (!o.flags.has('--yes')) { write('Nothing was run: add --yes to confirm.'); return 3; }
  // Spec-Kit refuses on files edited locally, and that is reported as it is: never --force.
  return (await runAll([() => sys.run(SPECKIT_PROJECT, [], { cwd: o.project, shell: true })], write)) ? 0 : 1;
}

async function applyComponent(id, o, ctx) {
  const { sys, write, registry, compat, by } = ctx;
  const c = registry.components.find((x) => x.id === id);
  const row = by[id];
  if (row.status === 'unknown') { write(`${id} is unknown (${show(row.error ?? 'no version')}): nothing to do until that is fixed.`); return 1; }
  if (c.sameAs && by[c.sameAs].status !== 'ok') { write(`${id} follows ${c.sameAs}: update that first with --apply ${c.sameAs}.`); return 1; }
  if (row.status === 'missing') { write(`${id} is not installed: install it first (the doctor prints the command), --apply only updates.`); return 1; }
  if (!row.command?.length) { write(`${id} is already up to date${row.status === 'customized' ? ' (your customized copy is left untouched)' : ''}.`); return 0; }
  const blocking = (row.requires ?? []).find((r) => by[r] && by[r].status !== 'ok');
  if (blocking) { write(`${id} requires ${blocking} (${by[blocking].status}): handle that first with --apply ${blocking}.`); return 1; }
  for (const r of (row.requires ?? []).filter((x) => !by[x])) write(`warning: ${show(id)} needs ${show(r)}, which forge does not check.`);

  write(`Updating ${show(row.name)}: ${arrow(row)}`);
  for (const cmd of row.command) write(`    run: ${show(cmd)}`);
  for (const n of row.versionNotes) write(`    note ${show(n.version)}: ${show(n.text)}`);
  const backupNotes = row.versionNotes.filter((n) => n.requiresBackup);
  const missing = [
    !o.flags.has('--yes') && '--yes',
    row.untested && !o.flags.has('--accept-unverified') && '--accept-unverified',
    backupNotes.length && !o.flags.has('--backup-confirmed') && '--backup-confirmed',
    row.status === 'customized' && !o.flags.has('--overwrite') && '--overwrite',
  ].filter(Boolean);
  if (missing.length) {
    write(`Nothing was run: add ${missing.join(' ')}${row.untested ? ` (${show(row.latestVersion)} is not tested with forge)` : ''}${backupNotes.length ? ' after you took the backup the note above asks for' : ''}${row.status === 'customized' ? ' (your copy is backed up first, then replaced)' : ''}.`);
    return 3;
  }
  if (row.status === 'customized' && !(await backup({ ...row, id }, sys, write))) return 1;
  if (!(await runAll(row.command.map((cmd) => () => shell(cmd, sys)), write))) return 1;
  for (const n of row.afterUpdate ?? []) write(`    note: ${show(n)}`);
  const after = (await check(registry, compat, sys, [id])).components[0];
  return finish(after, write, configDir(sys));
}

export async function main(argv, sys, write) {
  const o = parse(argv);
  if (o.error) { write(`${o.error}\n${USAGE}`); return 2; }
  const here = (name) => fileURLToPath(new URL(`../${name}`, import.meta.url));
  let registry, compat, versions;
  try {
    registry = await load(sys, here('components.json'), 'components');
    compat = await load(sys, here('compat.json'), 'components');
    if (o.versions) versions = await load(sys, o.versions, 'urls');
  } catch (e) {
    write(`Cannot read the registry, compat.json or the versions fixture: ${show(e.message)}`);
    return 2;
  }
  if (!Array.isArray(registry.components)) { write('Cannot read the registry: missing "components" array'); return 2; }
  if (versions) sys = { ...sys, fetchText: fromFixture(versions.urls) };

  const id = o.applies[0];
  if (id === undefined) {
    const report = await check(registry, compat, sys);
    write(o.flags.has('--json') ? JSON.stringify({ ...report, components: report.components.map(toJson) }, null, 2) : formatText(report));
    return report.components.every((c) => c.status === 'ok') ? 0 : 1;
  }
  if (![...registry.components.map((c) => c.id), 'forge', 'speckit-project'].includes(id)) { write(`Not a component: ${show(id)}\n${USAGE}`); return 2; }
  const report = await check(registry, compat, sys);
  const by = Object.fromEntries(report.components.map((c) => [c.id, c]));
  const ctx = { sys, write, registry, compat, by, row: by[id] };
  if (id === 'forge') return applyForge(o, ctx);
  if (id === 'speckit-project') return applySpeckitProject(o, ctx);
  return applyComponent(id, o, ctx);
}

const realSys = {
  platform: process.platform,
  home: homedir(),
  env: process.env,
  exec: (cmd, args) => new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => (err ? reject(err) : resolve(stdout + stderr)));
  }),
  run: (cmd, args, { cwd, shell: viaShell } = {}) => new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, shell: viaShell, timeout: 600000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || stdout || err.message))) : resolve(stdout + stderr)));
  }),
  readFile: (path) => readFile(path, 'utf8').catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e))),
  copyDir: async (src, dest) => { await mkdir(dirname(dest), { recursive: true }); await cp(src, dest, { recursive: true, force: false, errorOnExist: true }); },
  async fetchText(url) {
    const headers = { 'user-agent': 'forge-update' };
    if (process.env.GITHUB_TOKEN && new URL(url).host === 'api.github.com') headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.text();
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2), realSys, console.log);
}
