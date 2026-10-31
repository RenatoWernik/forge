// SessionStart hook: one line that says whether the ai-memory server of this project is on. Always exits 0, answers in about 5 s at most, starts nothing.
import { fileURLToPath } from 'node:url'
import { estado, aviso, REAL } from '../start-ai-memory.mjs'

const say = line => process.stdout.write(line + '\n')
// a stuck answer must not hold the session start: the status command and this timer both stop at about 5 s
const late = setTimeout(() => process.stdout.write('ai-memory: state unknown (no answer in time). Run node .claude/check.cjs --env.\n', () => process.exit(0)), 4500)
try {
  const e = await estado(fileURLToPath(new URL('../..', import.meta.url)), { ...REAL, run: (cmd, args, opts) => REAL.run(cmd, args, { ...opts, timeout: 1500 }) })
  clearTimeout(late)
  say(aviso(e) ?? (e.state === 'on' ? `ai-memory: on at ${e.cfg.serverUrl} (this project's server).`
    : `ai-memory: OFF at ${e.cfg.serverUrl}. Start it: node .claude/start-ai-memory.mjs (nothing is captured while it is off).`))
} catch (err) {
  clearTimeout(late)
  say('ai-memory: state unknown (' + String(err.message).split('\n')[0] + '). Run node .claude/check.cjs --env.')
}
