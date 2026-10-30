// Prints the painel/vida document of the project (FRAMEWORK.md, section 6) as JSON on the standard output, for the orchestrator to "set":
//   node .claude/painel-vida.mjs      ->  {"painel/vida":{"t":"<now>","agentes":{"<nome>":{"minutos":12,"vida":"ativo"}}}}
// The life of each agent is the shared reader's (painel-leitor.mjs) over the mtime of its file in .checkpoints/, next to this script's folder.
// It only reads. A painel.json that is missing or invalid exits 1 with the reason on stderr and prints nothing (an empty document would erase the life shown).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ler } from './painel-leitor.mjs';

const dir = fileURLToPath(new URL('../.checkpoints/', import.meta.url));
const mtimes = {};
try { for (const f of readdirSync(dir, { withFileTypes: true })) if (f.isFile()) mtimes[f.name] = statSync(dir + f.name).mtimeMs; } catch { /* no .checkpoints/: the reader reports painel.json as missing */ }
let texto;
try { texto = readFileSync(`${dir}painel.json`, 'utf8'); } catch { /* the reader reports it as missing */ }
const agora = Date.now();
const painel = ler(texto, mtimes, agora);
if (painel.erro) {
  console.error(`forge painel-vida: ${painel.erro}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ 'painel/vida': { t: new Date(agora).toISOString(), agentes: Object.fromEntries(painel.agentes.map((a) => [a.nome, { minutos: a.minutos, vida: a.vida }])) } }));
}
