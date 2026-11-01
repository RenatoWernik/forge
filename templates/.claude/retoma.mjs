// The resume report (FRAMEWORK.md, section 12). Usage, from the project root: node .claude/retoma.mjs
// Prints the age of the orchestrator's checkpoint and, for every agent of .checkpoints/painel.json that works on an open ticket and has not saved its checkpoint
// for 10 min or more (or has none), the line that says whom to wake; then the agents past `minutesWithoutProgress` of .claude/forge.json, to pass in args.vida.
// The age of a checkpoint is the one the shared reader (.claude/painel-leitor.mjs) computes. It only reads, and always exits 0.
// The clock is FORGE_VIGIA_NOW_MS (ms since the epoch) when set, as in the idle watch hook.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ler } from './painel-leitor.mjs';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const FEITO = new Set(['main', 'aprovado']); // a ticket in these states has no agent to wake
const MIN = 60000;
const limpa = (s) => String(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 80); // names come from a file: one line each, bounded
const lerTexto = (f) => { try { return readFileSync(f, 'utf8'); } catch { return undefined; } };

// -> { erro } | { ativos: [{ nome, ticket, ficheiro, minutos | null, vida }] }: the agents on open tickets, in the order of painel.json (also read by check.cjs --env)
export function ativos(raiz = RAIZ, agora = Date.now()) {
  const dir = join(raiz, '.checkpoints');
  const texto = lerTexto(join(dir, 'painel.json'));
  const lista = ler(texto, {}, agora);
  if (lista.erro) return { erro: lista.erro };
  const mtimes = {};
  for (const a of lista.agentes) { try { mtimes[a.checkpoint] = statSync(join(dir, a.checkpoint)).mtimeMs; } catch { /* no checkpoint file yet */ } }
  const estados = new Map(JSON.parse(texto.replace(/^\uFEFF/, '')).tickets.map((t) => [t.id, t.estado]));
  return {
    ativos: ler(texto, mtimes, agora).agentes.filter((a) => !FEITO.has(estados.get(a.ticket)))
      .map((a) => ({ nome: limpa(a.nome), ticket: limpa(a.ticket), ficheiro: limpa(a.checkpoint), minutos: a.minutos, vida: a.vida })),
  };
}

export function relatorio(raiz = RAIZ, agora = Date.now()) {
  let mt = null;
  try { mt = statSync(join(raiz, '.checkpoints', 'orchestrator.md')).mtimeMs; } catch { /* missing */ }
  const out = [mt === null ? 'orchestrator: .checkpoints/orchestrator.md missing' : `orchestrator: .checkpoints/orchestrator.md saved ${Math.floor(Math.max(0, agora - mt) / MIN)} min ago`];
  const r = ativos(raiz, agora);
  if (r.erro) return [...out, `painel.json: ${r.erro}`];
  const parados = r.ativos.filter((a) => a.vida !== 'ativo');
  out.push(...parados.map((a) => `wake: ${a.nome} (ticket ${a.ticket}): ${a.minutos === null ? 'no checkpoint file yet' : `${a.minutos} min since .checkpoints/${a.ficheiro}`}; SendMessage to ${a.nome}, or relaunch it from that file`));
  let limite;
  try { limite = JSON.parse(lerTexto(join(raiz, '.claude', 'forge.json')).replace(/^\uFEFF/, '')).escalation.minutesWithoutProgress.value; } catch { /* no limit known: nothing is escalated */ }
  if (Number.isFinite(limite)) out.push(...parados.filter((a) => a.minutos !== null && a.minutos >= limite).map((a) => `escalate: ${a.nome} passed minutesWithoutProgress (${limite} min): pass it in args.vida`));
  if (!parados.length) out.push('nothing to resume');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const injetado = Number(process.env.FORGE_VIGIA_NOW_MS);
  try { console.log(relatorio(RAIZ, injetado > 0 ? injetado : Date.now()).join('\n')); } catch (e) { console.error(`forge retoma: ${e.message}`); }
}
