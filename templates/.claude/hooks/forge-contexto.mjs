// forge hook (UserPromptSubmit and PostToolUse): the context watch (FRAMEWORK.md, section 12). Warns the orchestrator once when the context of the
// main session reaches 85 % (CONTEXT WARNING) and once when it reaches 90 % (CONTEXT CRITICAL), so it saves its checkpoint and the baton before the compaction.
// Used tokens: input + cache creation + cache read of the last assistant entry of the transcript that is not a sidechain.
// Window, in this order: FORGE_CONTEXT_WINDOW (an integer > 0); else 1000000 when the last model entry of the transcript
// ({"type":"attachment","attachment":{"type":"model","identity":{"modelId":"...[1m]"}}}) ends in [1m], 200000 when it does not;
// else 1000000 when the message.model of the last assistant entry ends in [1m]; and always 1000000 when the used tokens pass 200000 (a 200000 window never gets there).
// The first call of a session reads the transcript forward once; the state file of the session (<tmpdir>/forge-contexto-<sha256(session_id), 16 hex>.json)
// keeps the last level warned of, the byte offset already read and what was found, so the next calls read only the new bytes. Below 85 % the level goes back to zero.
// A subagent (the payload has agent_id) stays silent: the warning belongs to the main session.
// It never blocks and exits 0 whatever it finds (a missing or unreadable transcript prints nothing).
import { openSync, readSync, fstatSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHUNK = 1 << 20;
const sha = (b, n = 16) => createHash('sha256').update(b).digest('hex').slice(0, n);
const termina1m = (id) => typeof id === 'string' && id.endsWith('[1m]');

// Reads the transcript from est.offset to the end, whole lines only; -> the new state { offset, cabeca, anexo1m, modelo1m, usados }
function ler(file, est) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size, cabeca = (n) => { const b = Buffer.alloc(Math.min(n, 4096)); readSync(fd, b, 0, b.length, 0); return sha(b); };
    // an offset that does not fit the file, or a start that is not the one seen before (another file at the same path), means read it all again
    const igual = est.offset > 0 && est.offset <= size && cabeca(est.offset) === est.cabeca;
    const s = igual ? { ...est } : { offset: 0, anexo1m: null, modelo1m: false, usados: null };
    let resto = Buffer.alloc(0), pos = s.offset;
    for (; pos < size;) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - pos));
      const n = readSync(fd, buf, 0, buf.length, pos);
      if (n === 0) break;
      pos += n;
      let b = resto.length ? Buffer.concat([resto, buf.subarray(0, n)]) : buf.subarray(0, n), i;
      while ((i = b.indexOf(10)) >= 0) {
        linha(b.subarray(0, i), s);
        s.offset += i + 1;
        b = b.subarray(i + 1);
      }
      resto = Buffer.from(b);
    }
    s.cabeca = cabeca(s.offset);
    return s;
  } finally { closeSync(fd); }
}

// folds one line of the transcript into the state: a model entry sets the window, an assistant entry of the main session sets the used tokens
function linha(b, s) {
  const modelo = b.includes('"attachment"') && b.includes('"modelId"'), resposta = !modelo && b.includes('"assistant"');
  if (!modelo && !resposta) return;
  let e;
  try { e = JSON.parse(b.toString('utf8')); } catch { return; }
  if (e?.isSidechain === true) return;
  if (modelo && e.type === 'attachment' && e.attachment?.type === 'model' && typeof e.attachment.identity?.modelId === 'string') s.anexo1m = termina1m(e.attachment.identity.modelId);
  // shortcut: a "<synthetic>" assistant entry (no model call) carries zero usage and would reset the level; it is skipped like a sidechain
  else if (resposta && e.type === 'assistant' && e.message?.model !== '<synthetic>') {
    const u = e.message?.usage;
    s.modelo1m = termina1m(e.message?.model);
    s.usados = u !== null && typeof u === 'object' ? ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((t, k) => t + (Number(u[k]) || 0), 0) : null;
  }
}

try {
  const entrada = JSON.parse(readFileSync(0, 'utf8'));
  if (entrada === null || typeof entrada !== 'object' || entrada.agent_id || typeof entrada.session_id !== 'string' || typeof entrada.transcript_path !== 'string') process.exit(0);
  const arquivo = join(tmpdir(), `forge-contexto-${sha(entrada.session_id)}.json`);
  let antes = {};
  try { antes = JSON.parse(readFileSync(arquivo, 'utf8')) ?? {}; } catch { /* first call of the session */ }
  const s = ler(entrada.transcript_path, { offset: Number(antes.offset) || 0, cabeca: antes.cabeca, anexo1m: antes.anexo1m ?? null, modelo1m: antes.modelo1m === true, usados: antes.usados ?? null });
  let nivel = 0, pct = 0;
  if (typeof s.usados === 'number') {
    const w = process.env.FORGE_CONTEXT_WINDOW;
    const janela = /^\d+$/.test(w ?? '') && Number(w) > 0 ? Number(w) : (s.anexo1m ?? s.modelo1m) || s.usados > 200000 ? 1000000 : 200000;
    pct = Math.floor((s.usados * 100) / janela);
    nivel = pct >= 90 ? 2 : pct >= 85 ? 1 : 0;
  }
  const antesNivel = Number(antes.nivel) || 0;
  // between 85 and 89 after a CRITICAL the level stays at CRITICAL; a transcript without usage keeps the level it had
  const novo = typeof s.usados !== 'number' ? antesNivel : nivel === 0 ? 0 : Math.max(antesNivel, nivel);
  const depois = { nivel: novo, offset: s.offset, cabeca: s.cabeca, anexo1m: s.anexo1m, modelo1m: s.modelo1m, usados: s.usados };
  if (JSON.stringify(depois) !== JSON.stringify({ ...antes })) {
    const temp = `${arquivo}.${process.pid}.tmp`;
    try { writeFileSync(temp, JSON.stringify(depois)); renameSync(temp, arquivo); } catch { try { unlinkSync(temp); } catch { /* nothing to remove */ } }
  }
  if (nivel > antesNivel) {
    const evento = typeof entrada.hook_event_name === 'string' ? entrada.hook_event_name : 'UserPromptSubmit';
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: evento, additionalContext: `CONTEXT ${nivel === 2 ? 'CRITICAL' : 'WARNING'}: ${pct}% of the context is used. Save .checkpoints/orchestrator.md and write the baton (memory_handoff_begin) now, then keep working: the automatic compaction will follow. Never ask the user to open a new session.` } }));
  }
} catch { /* open failure: no warning */ }
