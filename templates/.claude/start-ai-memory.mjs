// Starts the ai-memory server of this project (hidden, detached) when it is off, and says what state it is in. Usage, from anywhere: node .claude/start-ai-memory.mjs
// Exit codes: 0 on (already, or started now), 1 anything else (no [forge], no binary, never came up), 2 another server answers on this port.
// Also imported by .claude/hooks/forge-ai-memory.mjs and by forge's memoria.mjs. Standard library and .claude/ai-memory.cjs only.
//   estado(root, sys): { state: 'on' | 'off' | 'conflict' | 'nobin' | 'unset', cfg, bin, detail }
//   arranca(root, sys, write): runs the table above and returns the exit code
// sys = { env, home, platform, run, fetch, spawn }: run(cmd, args, opts) -> { code, stdout, stderr } (as ai-memory.cjs), spawn is node:child_process.spawn
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aim = createRequire(import.meta.url)('./ai-memory.cjs')
const sleep = ms => new Promise(r => setTimeout(r, ms))
export const REAL = { env: process.env, home: homedir(), platform: process.platform, run: aim.run, fetch: globalThis.fetch, spawn }
const WAIT_MS = 15000

export async function estado(root, sys = REAL) {
  const cfg = aim.readConfig(root)
  if (!cfg.serverUrl || !cfg.dataDir) return { state: 'unset', cfg }
  const { bin } = aim.resolveBin({ env: sys.env, home: sys.home, run: sys.run })
  if (!bin) return { state: 'nobin', cfg }
  return { ...(await aim.serverState({ serverUrl: cfg.serverUrl, dataDir: cfg.dataDir, bin, platform: sys.platform, fetch: sys.fetch, run: sys.run })), cfg, bin }
}

// the lines the script and the hook share; null for on and off, which each says in its own words
export const aviso = e => e.state === 'conflict' ? `ai-memory: CONFLICT at ${e.cfg.serverUrl}: another server answers on this port. Run node .claude/check.cjs --env.`
  : e.state === 'nobin' ? 'ai-memory: binary not found. Run the forge machine check (update.mjs --check).'
  : e.state === 'unset' ? 'ai-memory: not set up for this project (no [forge] in .ai-memory.local.toml). Run memoria.mjs --apply (FRAMEWORK.md section 3).'
  : null

export async function arranca(root, sys = REAL, write = console.log) {
  const e = await estado(root, sys), url = e.cfg.serverUrl
  if (e.state === 'on') { write(`ai-memory: already on at ${url}`); return 0 }
  if (e.state !== 'off') { write(aviso(e)); return e.state === 'conflict' ? 2 : 1 }
  const { hostname, port } = new URL(url)
  if (hostname !== '127.0.0.1' || !port) { write(`ai-memory: ${url} is not a local address (127.0.0.1:<port>): start the server yourself.`); return 1 }
  const child = sys.spawn(e.bin, ['--data-dir', e.cfg.dataDir, 'serve', '--transport', 'http', '--bind', `127.0.0.1:${port}`, '--workspace', e.cfg.workspace, '--project', e.cfg.project], { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => {}) // a binary that cannot start is told apart below, by the server that never answers
  child.unref()
  let s = e
  for (const t = Date.now(); Date.now() - t < WAIT_MS && s.state !== 'on'; await sleep(250)) s = await estado(root, sys)
  if (s.state === 'on') { write(`ai-memory: started at ${url}`); return 0 }
  write(`ai-memory: did not start at ${url} within ${WAIT_MS / 1000} s ${s.detail || '(nothing answers)'}`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await arranca(fileURLToPath(new URL('..', import.meta.url)))
}
