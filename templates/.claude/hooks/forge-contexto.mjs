// forge hook (UserPromptSubmit and PostToolUse): the context watch (FRAMEWORK.md, section 12). Warns the orchestrator once when the context of the
// main session reaches 85 % (CONTEXT WARNING) and once when it reaches 90 % (CONTEXT CRITICAL), so it saves its checkpoint and the baton before the compaction.
// Used tokens: input + cache creation + cache read of the last assistant entry of the transcript that is not a sidechain. Window: FORGE_CONTEXT_WINDOW (an integer > 0),
// else 1000000 when the model ends in [1m], else 200000. The last level warned of each session is kept in <tmpdir>/forge-contexto-<sha256(session_id), 16 hex>.json;
// below 85 % it goes back to zero. A subagent (the payload has agent_id) stays silent: the warning belongs to the main session.
// It only reads the tail of the transcript, never blocks, and exits 0 whatever it finds (a missing or unreadable transcript prints nothing).
import { openSync, readSync, fstatSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TAIL = [1 << 17, 1 << 21, 1 << 26]; // bytes read from the end, growing until an assistant entry is found

// the last assistant entry of the main session in the tail of the file, or null
function ultimaDoAssistente(file) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    for (const n of TAIL) {
      const len = Math.min(n, size), buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      const linhas = buf.toString('utf8').split('\n');
      if (len < size) linhas.shift(); // the first line is cut in the middle
      for (let i = linhas.length - 1; i >= 0; i--) {
        if (!linhas[i].includes('"assistant"')) continue;
        let e;
        try { e = JSON.parse(linhas[i]); } catch { continue; }
        // shortcut: a "<synthetic>" assistant entry (no model call) carries zero usage and would reset the level; it is skipped like a sidechain
        if (e?.type === 'assistant' && e.isSidechain !== true && e.message?.model !== '<synthetic>') return e;
      }
      if (len >= size) break;
    }
    return null;
  } finally { closeSync(fd); }
}

try {
  const entrada = JSON.parse(readFileSync(0, 'utf8'));
  if (entrada === null || typeof entrada !== 'object' || entrada.agent_id || typeof entrada.session_id !== 'string' || typeof entrada.transcript_path !== 'string') process.exit(0);
  const e = ultimaDoAssistente(entrada.transcript_path), u = e?.message?.usage;
  if (u === null || typeof u !== 'object') process.exit(0);
  const usados = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((s, k) => s + (Number(u[k]) || 0), 0);
  const w = process.env.FORGE_CONTEXT_WINDOW;
  const janela = /^\d+$/.test(w ?? '') && Number(w) > 0 ? Number(w) : String(e.message.model).endsWith('[1m]') ? 1000000 : 200000;
  const pct = Math.floor((usados * 100) / janela);
  const nivel = pct >= 90 ? 2 : pct >= 85 ? 1 : 0;
  const estado = join(tmpdir(), `forge-contexto-${createHash('sha256').update(entrada.session_id).digest('hex').slice(0, 16)}.json`);
  let antes = 0;
  try { antes = Number(JSON.parse(readFileSync(estado, 'utf8')).nivel) || 0; } catch { /* first call of the session */ }
  const novo = nivel === 0 ? 0 : Math.max(antes, nivel); // between 85 and 89 after a CRITICAL the level stays at CRITICAL
  if (novo !== antes) {
    const temp = `${estado}.${process.pid}.tmp`;
    try { writeFileSync(temp, JSON.stringify({ nivel: novo })); renameSync(temp, estado); } catch { try { unlinkSync(temp); } catch { /* nothing to remove */ } }
  }
  if (nivel > antes) {
    const evento = typeof entrada.hook_event_name === 'string' ? entrada.hook_event_name : 'UserPromptSubmit';
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: `CONTEXT ${nivel === 2 ? 'CRITICAL' : 'WARNING'}: ${pct}% of the context is used. Save .checkpoints/orchestrator.md and write the baton (memory_handoff_begin) now, then keep working: the automatic compaction will follow. Never ask the user to open a new session.` } }));
  }
} catch { /* open failure: no warning */ }
