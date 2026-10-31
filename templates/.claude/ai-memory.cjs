// ai-memory of this project, shared by .claude/check.cjs (--env), .claude/start-ai-memory.mjs and the SessionStart hook. Standard library only.
//   CANDIDATES: where forge looks for the binary (same list, same order as components.json > ai-memory)
//   resolveBin({ env, home, run }): { bin, version } of the first candidate whose `--version` says "ai-memory X.Y.Z", else { bin: null, tried }
//   readConfig(root): { workspace, project, serverUrl, dataDir, autostart: 'yes' | 'no' | null } from .ai-memory.toml and .ai-memory.local.toml (the [forge] table, written by forge; the local file prevails), null where missing
//   isIgnored(gitignoreText, rel): true when the .gitignore lines ignore rel (rel, /rel or **/rel; a ! line undoes it)
//   serverState({ serverUrl, dataDir, bin, platform, fetch, run }): { state: 'on' | 'off' | 'conflict', detail }, 'on' only when the server on the port is this project's
// run(cmd, args, { env, input, timeout }) -> { code, stdout, stderr }: never a shell, so a hostile AI_MEMORY_BIN is only ever a file name; a code other than 0 is a failure
'use strict'
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process')

const CANDIDATES = ['%AI_MEMORY_BIN%', 'ai-memory', '%LOCALAPPDATA%/ai-memory/ai-memory.exe', '~/Applications/ai-memory/ai-memory', '~/.local/bin/ai-memory']
const VERSION = /ai-memory ([0-9]+[.][0-9]+[.][0-9]+)/

const defaultRun = (cmd, args, opts = {}) => {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', ...opts, shell: false })
  return { code: r.error || r.status === null ? -1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

// "~/" is the home dir, "%VAR%" an environment variable; null when the variable is not set (or empty), as in doctor.mjs
const envVar = (env, k) => { const key = k in env ? k : Object.keys(env).find(x => x.toUpperCase() === k.toUpperCase()); return key === undefined ? '' : env[key] }
const expand = (c, env, home) => {
  const t = c.startsWith('~/') ? path.join(home, c.slice(2)) : c
  return [...t.matchAll(/%(\w+)%/g)].some(m => !envVar(env, m[1])) ? null : t.replace(/%(\w+)%/g, (_, v) => envVar(env, v))
}

function resolveBin({ env = process.env, home = os.homedir(), run = defaultRun } = {}) {
  const tried = []
  for (const c of CANDIDATES) {
    const bin = expand(c, env, home)
    if (bin === null) continue
    tried.push(bin)
    let r
    try { r = run(bin, ['--version'], { env, timeout: 10000 }) } catch (e) { continue }
    const m = r && r.code === 0 ? (String(r.stdout) + String(r.stderr)).match(VERSION) : null
    if (m) return { bin, version: m[1] }
  }
  return { bin: null, tried }
}

// shortcut: of the TOML escapes only \\ and \" are undone (all a path or a URL needs); upgrade: the rest when a value needs them
const untoml = s => s.replace(/\\(["\\])/g, '$1')

// .ai-memory.toml (versioned: workspace and project) and then .ai-memory.local.toml (this machine: the [forge] table); a key of the local file prevails
function readConfig(root = process.cwd()) {
  const cfg = { workspace: null, project: null, serverUrl: null, dataDir: null, autostart: null }
  for (const file of ['.ai-memory.toml', '.ai-memory.local.toml']) {
    let text = ''
    try { text = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') } catch (e) { continue }
    let table = ''
    for (const line of text.split(/\r?\n/)) {
      const t = line.match(/^\s*\[([^\]]+)\]\s*(#.*)?$/)
      if (t) { table = t[1].trim(); continue }
      const kv = line.match(/^\s*([A-Za-z_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(true|false))\s*(#.*)?$/)
      if (!kv) continue
      const key = table === '' ? { workspace: 'workspace', project: 'project' }[kv[1]] : table === 'forge' ? { server_url: 'serverUrl', data_dir: 'dataDir', autostart: 'autostart' }[kv[1]] : undefined
      if (key) cfg[key] = key === 'autostart' ? (['yes', 'no'].includes(kv[2] ?? kv[3]) ? kv[2] ?? kv[3] : null) : kv[2] !== undefined ? untoml(kv[2]) : kv[3] ?? null
    }
  }
  return cfg
}

// is `rel` (a path from the repo root, with /) ignored by these .gitignore lines? `rel`, `/rel` and `**/rel` ignore it, `!` lines undo it, the last one wins;
// shared by .claude/check.cjs and forge's memoria.mjs so that both decide the same. shortcut: no globs other than those three forms
const isIgnored = (text, rel) => String(text).split(/\r?\n/).map(l => l.trim()).reduce((on, l) => [rel, '/' + rel, '**/' + rel].includes(l) ? true : ['!' + rel, '!/' + rel, '!**/' + rel].includes(l) ? false : on, false)

// the data dirs compare after taking the \\?\ prefix, turning \ into / and taking the trailing /; case-insensitive only on win32
const norm = (p, platform) => { const s = String(p).replace(/\\/g, '/').replace(/^\/\/\?\//, '').replace(/\/$/, ''); return platform === 'win32' ? s.toLowerCase() : s }

async function serverState({ serverUrl, dataDir, bin, platform = process.platform, fetch = globalThis.fetch, run = defaultRun }) {
  try { await fetch(serverUrl + '/healthz', { signal: AbortSignal.timeout(3000) }) } catch (e) { return { state: 'off', detail: '(off: nothing answers; start it with node .claude/start-ai-memory.mjs)' } }
  let reported
  try {
    const r = await run(bin, ['--data-dir', dataDir, 'status', '--json'], { env: { ...process.env, AI_MEMORY_SERVER_URL: serverUrl }, timeout: 10000 })
    if (r.code === 0) reported = JSON.parse(String(r.stdout)).data_dir
  } catch (e) {}
  if (typeof reported !== 'string' || !reported) return { state: 'conflict', detail: '(port conflict: the server at ' + serverUrl + ' answers but did not report its data dir)' }
  if (norm(reported, platform) !== norm(dataDir, platform)) return { state: 'conflict', detail: '(port conflict: the server at ' + serverUrl + ' reports the data dir ' + reported + ", not this project's " + dataDir + ')' }
  return { state: 'on', detail: '' }
}

// The startup entry of this project's server, one file per platform (forge's memoria.mjs --autostart yes writes it, check.cjs --env reads it).
// Only this project's file is ever named: forge-ai-memory-<W>--<P>.vbs (Windows Startup folder), forge-ai-memory-<W>--<P>.service (systemd user unit),
// com.forge.ai-memory.<W>.<P>.plist (LaunchAgent).
const XML = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ESC = { win32: s => s, linux: s => s.replace(/%/g, '%%').replace(/\$/g, '$$$$'), darwin: XML } // systemd reads % and $ in ExecStart; shortcut: a backslash in a Linux path is not escaped
// a value as it stands in the entry, between the marks that end it; the check looks for it that way, so /x/ai-memory never matches /x/ai-memory2
const WRAP = { win32: s => '""' + s + '""', linux: s => '"' + s + '"', darwin: s => '<string>' + s + '</string>' }

function entryText({ platform = process.platform, env = process.env, home = os.homedir(), workspace: w, project: p, bin, dataDir, port }) {
  const E = ESC[platform] || ESC.linux
  const argv = ['serve', '--transport', 'http', '--bind', '127.0.0.1:' + port, '--workspace', w, '--project', p]
  if (platform === 'win32') {
    const dir = path.join(envVar(env, 'APPDATA') || path.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    return { dir, name: `forge-ai-memory-${w}--${p}.vbs`, text: `' forge: starts the ai-memory server of ${w}/${p} at logon, hidden. Delete this file to stop it.\r\n`
      + `CreateObject("WScript.Shell").Run """${bin}"" --data-dir ""${dataDir}"" ${argv.join(' ')}", 0, False\r\n` }
  }
  if (platform === 'darwin') {
    const label = `com.forge.ai-memory.${w}.${p}`, args = [bin, '--data-dir', dataDir, ...argv].map(a => `    <string>${XML(a)}</string>`).join('\n')
    return { dir: path.join(home, 'Library', 'LaunchAgents'), name: label + '.plist', label, text: '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n'
      + `  <key>Label</key>\n  <string>${label}</string>\n  <key>ProgramArguments</key>\n  <array>\n${args}\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <true/>\n</dict>\n</plist>\n` }
  }
  return { dir: path.join(envVar(env, 'XDG_CONFIG_HOME') || path.join(home, '.config'), 'systemd', 'user'), name: `forge-ai-memory-${w}--${p}.service`, text: `[Unit]\nDescription=ai-memory server of the forge project ${w}/${p}\n\n`
    + `[Service]\nType=simple\nExecStart="${E(bin)}" --data-dir "${E(dataDir)}" ${argv.join(' ')}\nRestart=on-failure\nRestartSec=5s\n\n[Install]\nWantedBy=default.target\n` }
}

// the bytes of the entry: the .vbs is read by wscript in the ANSI code page, so a path outside ASCII (a profile like C:\Users\João) is only right in UTF-16 LE with a BOM; everything else is UTF-8
function startupEntry(a) {
  const e = entryText(a), wide = (a.platform || process.platform) === 'win32' && /[^\x00-\x7f]/.test(e.text)
  return { ...e, bytes: wide ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(e.text, 'utf16le')]) : Buffer.from(e.text) }
}

// the `ai-memory: autostart` line of check.cjs --env: { ok, detail } from the answer in the [forge] table and this project's entry (the one file named above)
function autostartState({ cfg, bin, platform = process.platform, env = process.env, home = os.homedir() }) {
  const again = 'run the memory step again'
  if (cfg.autostart !== 'yes' && cfg.autostart !== 'no') return { ok: false, detail: '(not chosen: run the memory step of /forge:new-project)' }
  const port = Number((/^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/.exec(cfg.serverUrl || '') || [])[1])
  const e = startupEntry({ platform, env, home, workspace: cfg.workspace, project: cfg.project, bin, dataDir: cfg.dataDir, port })
  let text = null, bom = false
  try { const b = fs.readFileSync(path.join(e.dir, e.name)); bom = b[0] === 0xff && b[1] === 0xfe; text = bom ? b.subarray(2).toString('utf16le') : b.toString('utf8') } catch (x) {}
  if (cfg.autostart === 'no') {
    if (text !== null) return { ok: false, detail: `(no, but a startup entry exists: ${again})` }
    return fs.existsSync(path.join(__dirname, 'start-ai-memory.mjs')) ? { ok: true, detail: '' } : { ok: false, detail: '(no, but .claude/start-ai-memory.mjs is missing)' }
  }
  if (text === null) return { ok: false, detail: `(yes, but the startup entry is missing: ${again})` }
  if (e.bytes[0] === 0xff && !bom) return { ok: false, detail: `(yes, but the startup entry does not match .ai-memory.toml: ${again})` } // a path outside ASCII needs the UTF-16 file
  const W = WRAP[platform] || WRAP.linux, E = ESC[platform] || ESC.linux, bind = new RegExp('127\\.0\\.0\\.1:' + port + '(?![0-9])')
  const same = !!bin && !!cfg.dataDir && Number.isInteger(port) && text.includes(W(E(bin))) && text.includes(W(E(cfg.dataDir))) && bind.test(text)
  return same ? { ok: true, detail: '' } : { ok: false, detail: `(yes, but the startup entry does not match .ai-memory.toml: ${again})` }
}

module.exports = { CANDIDATES, resolveBin, readConfig, serverState, isIgnored, startupEntry, autostartState, run: defaultRun }
