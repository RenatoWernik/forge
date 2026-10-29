// forge hook (UserPromptSubmit): the idle watch. Warns, in the context of the orchestrator, about every agent that is still working on an active ticket
// and has not saved its checkpoint for 10 min or more. The age of a checkpoint is the one the shared reader of painel.json computes (.claude/painel-leitor.mjs):
// this hook never works out the life of an agent itself. It only reads: it writes nothing, never blocks, and exits 0 whatever it finds.
// The "now" comes from FORGE_VIGIA_NOW_MS (ms since the epoch) when set, so a test can fix the clock; otherwise it is the real clock.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ler } from '../painel-leitor.mjs';

const FEITO = new Set(['main', 'aprovado']); // a ticket in these states has no agent to wake
const limpa = (s) => String(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 80); // names come from a file: one line each, bounded
const umaLinha = (s) => String(s).replace(/\s+/g, ' ').slice(0, 200);

const dir = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.checkpoints');
let texto;
try { texto = readFileSync(join(dir, 'painel.json'), 'utf8'); } catch (e) {
  if (e.code !== 'ENOENT') process.stderr.write(`forge idle watch: cannot read painel.json (${umaLinha(e.message)})\n`);
}
if (texto !== undefined) {
  const injetado = Number(process.env.FORGE_VIGIA_NOW_MS);
  const agora = injetado > 0 ? injetado : Date.now(); // NaN and 0 are not clocks
  const lista = ler(texto, {}, agora);
  if (lista.erro) process.stderr.write(`forge idle watch: painel.json is not usable, nothing checked (${umaLinha(lista.erro)})\n`);
  else {
    const mtimes = {};
    for (const a of lista.agentes) { try { mtimes[a.checkpoint] = statSync(join(dir, a.checkpoint)).mtimeMs; } catch { /* no checkpoint file yet */ } }
    const estados = new Map(JSON.parse(texto.replace(/^﻿/, '')).tickets.map((t) => [t.id, t.estado]));
    const parados = ler(texto, mtimes, agora).agentes.filter((a) => a.vida !== 'ativo' && !FEITO.has(estados.get(a.ticket)));
    if (parados.length) {
      console.log([
        `forge idle watch: ${parados.length} agent(s) have not saved a checkpoint for 10 min or more. Wake each one and resume it from its checkpoint; do not wait for it.`,
        ...parados.map((a) => `- ${limpa(a.nome)} (ticket ${limpa(a.ticket)}): ${a.minutos === null ? 'no checkpoint file yet' : `${a.minutos} min since the last checkpoint`}`),
      ].join('\n'));
    }
  }
}
