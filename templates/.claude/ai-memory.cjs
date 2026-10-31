// ai-memory of this project, shared by .claude/check.cjs (--env), .claude/start-ai-memory.mjs and the SessionStart hook. Standard library only.
//   CANDIDATES: where forge looks for the binary (same list, same order as components.json > ai-memory)
//   resolveBin({ env, home, run }): { bin, version } of the first candidate whose `--version` says "ai-memory X.Y.Z", else { bin: null, tried }
//   readConfig(root): { workspace, project, serverUrl, dataDir, autostart } from .ai-memory.toml and .ai-memory.local.toml (the [forge] table, written by forge; the local file prevails), null where missing
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
      if (key) cfg[key] = key === 'autostart' ? kv[4] === 'true' : kv[2] !== undefined ? untoml(kv[2]) : kv[3] ?? null
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

module.exports = { CANDIDATES, resolveBin, readConfig, serverState, isIgnored, run: defaultRun }
