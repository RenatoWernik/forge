// forge hook (PreToolUse, Bash and PowerShell): blocks killing processes by name. `taskkill /IM node.exe` ends everybody's node, the other agents' and the user's.
// Killing by PID is always allowed, and so is any text that only mentions these commands (echo, grep, git commit -m ...).
// Exit 2 blocks; the reason on stderr tells Claude what to do instead. Anything the hook cannot read goes ahead (it never blocks by accident).
import { pathToFileURL } from 'node:url';
import { comandoDoEvento, bloquear, statements, comando, embrulhado } from './forge-shell.mjs';

const RAZAO = 'Blocked by forge: this kills processes by name, which also ends the processes of the other agents and of the user. Kill only the PID of the process you started: taskkill /PID <pid>, kill <pid> or Stop-Process -Id <pid>.';

const opcao = (t) => t.s.replace(/^[-/]+/, '').toLowerCase();
const eOpcao = (t) => !t.q && /^(--?|\/\/?)[A-Za-z]/.test(t.s);
const prefixo = (o, cheio, min) => o.length >= min && cheio.startsWith(o); // PowerShell accepts any unambiguous prefix of a parameter
const SEM_PID = (a) => a.some((t) => eOpcao(t) && /^(i|id|p|pid|inputobject)$/.test(opcao(t))); // Get-Process -Id 1234, ps -p 1234

// -> true when the command kills or lists by name on its own
const direto = ({ name, args }) => {
  const o = args.filter(eOpcao).map(opcao);
  if (name === 'killall' || name === 'pkill') return true;
  if (name === 'taskkill') return args.some((t, k) => eOpcao(t) && (opcao(t) === 'im' || (opcao(t) === 'fi' && !/^pid\s+eq\s+\d+$/i.test((args[k + 1]?.s ?? '').trim()))));
  if (name === 'stop-process' || name === 'spps') return o.some((x) => prefixo(x, 'name', 1) || prefixo(x, 'processname', 2));
  if (name === 'wmic') { const t = args.map((x) => x.s.toLowerCase()); return /\b(name|caption|commandline)\s*=/.test(t.join(' ')) && (t.includes('delete') || t.join(' ').includes('call terminate')); }
  return false;
};
// the commands that find processes by name, and the ones that act on what they find (kill 1234 alone is a sink with nothing to act on)
const procura = ({ name, args }) =>
  ['pgrep', 'pidof', 'tasklist'].includes(name) || (['ps', 'gps', 'get-process'].includes(name) && !SEM_PID(args)) ||
  (['get-ciminstance', 'gcim', 'get-wmiobject', 'gwmi'].includes(name) && !/processid/i.test(args.map((t) => t.s).join(' ')));
const age = ({ name, args, tokens }) =>
  ['kill', 'stop-process', 'spps', 'invoke-cimmethod', 'invoke-wmimethod', 'remove-ciminstance', 'remove-wmiobject'].includes(name) ||
  (name === 'xargs' && args.some((t) => ['kill', 'taskkill', 'stop-process'].includes(t.s.toLowerCase()))) ||
  tokens.some((t) => !t.q && /\.(kill|terminate)\s*\(/i.test(t.s));

// -> { razao: true when something kills by name, procura: true when the text looks processes up by name }
function porNome(texto, nivel = 0) {
  const r = { razao: false, procura: false };
  if (nivel > 4) return r;
  for (const st of statements(texto)) {
    let procurou = false, agiu = false;
    for (const s of st.subs) { const x = porNome(s, nivel + 1); r.razao ||= x.razao; procurou ||= x.procura; }
    for (const seg of st.segments) {
      const c = comando(seg);
      if (!c) continue;
      if (direto(c)) r.razao = true;
      procurou ||= procura(c);
      agiu ||= age(c);
      for (const t of embrulhado(c)) { const x = porNome(t, nivel + 1); r.razao ||= x.razao; procurou ||= x.procura; }
    }
    if (procurou && agiu) r.razao = true;
    r.procura ||= procurou;
  }
  return r;
}

export const matarPorNome = (texto) => porNome(texto).razao;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { texto } = comandoDoEvento();
  if (texto && matarPorNome(texto)) bloquear(RAZAO);
}
