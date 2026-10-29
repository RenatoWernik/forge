// forge hook (PreToolUse, Bash and PowerShell): blocks test commands run with run_in_background true. A test suite in the background stalls with
// nobody watching, and the agent that started it sits idle. Servers, builds and anything that only mentions "test" in the background go ahead.
// Exit 2 blocks; the reason on stderr tells Claude what to do instead.
import { pathToFileURL } from 'node:url';
import { comandoDoEvento, bloquear, statements, comando, embrulhado, nome } from './forge-shell.mjs';

const RAZAO = 'Blocked by forge: test commands do not run in the background, because nobody sees them stall. Run it in the foreground, in blocks of up to 9 min each (split the suite, or run one folder at a time).';

const semOpcoes = (args) => { const i = args.findIndex((t) => t.q || !t.s.startsWith('-')); return (i < 0 ? [] : args.slice(i)).map((t) => t.s); };
const SCRIPT_DE_TESTE = /^test([:_-]|$)/; // test, test:e2e, test-unit
const PACOTES = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const LANCADORES = new Set(['npx', 'pnpx', 'bunx']);

// binary + arguments of a test runner -> true when that call runs tests
function corredor(bin, args) {
  const n = nome(bin), [primeiro] = semOpcoes(args);
  if (['vitest', 'jest', 'mocha', 'pytest', 'py.test'].includes(n)) return true;
  if (n === 'playwright') return primeiro === 'test';
  if (n === 'cypress') return primeiro === 'run';
  if (['go', 'dotnet', 'deno'].includes(n)) return primeiro === 'test';
  if (n === 'cargo') return semOpcoes(args.filter((t) => !t.s.startsWith('+')))[0] === 'test';
  if (n === 'node' || n === 'nodejs') {
    const fim = args.findIndex((t) => /\.[cm]?[jt]s$/.test(t.s) || ['-e', '-p', '--eval', '--print'].includes(t.s));
    return (fim < 0 ? args : args.slice(0, fim)).some((t) => !t.q && /^--test(-|$)/.test(t.s)); // only the options of node itself, not those of the script
  }
  if (/^(python|python3|py)(\d[\d.]*)?$/.test(n)) { const m = args.findIndex((t) => t.s === '-m'); return m >= 0 && ['pytest', 'unittest', 'nose2', 'tox'].includes(args[m + 1]?.s); }
  return false;
}

function eTeste({ name, args }) {
  if (PACOTES.has(name)) {
    const [x, ...resto] = semOpcoes(args);
    if (['test', 't', 'tst'].includes(x)) return true; // npm test, npm t, pnpm test, yarn test, bun test
    if (x === 'run' || x === 'run-script') return SCRIPT_DE_TESTE.test(resto[0] ?? '');
    if (['exec', 'dlx', 'x'].includes(x)) return resto.length > 0 && corredor(resto[0], args.slice(args.findIndex((t) => t.s === resto[0]) + 1));
    return name !== 'npm' && x !== undefined && corredor(x, args.slice(args.findIndex((t) => t.s === x) + 1)); // pnpm vitest run, yarn playwright test
  }
  if (LANCADORES.has(name)) { const [bin] = semOpcoes(args); return bin !== undefined && corredor(bin, args.slice(args.findIndex((t) => t.s === bin) + 1)); }
  return corredor(name, args);
}

function temTeste(texto, nivel = 0) {
  if (nivel > 4) return false;
  for (const st of statements(texto)) {
    if (st.subs.some((s) => temTeste(s, nivel + 1))) return true;
    for (const seg of st.segments) {
      const c = comando(seg);
      if (c && (eTeste(c) || embrulhado(c).some((t) => temTeste(t, nivel + 1)))) return true;
    }
  }
  return false;
}

export const testeEmSegundoPlano = (texto, fundo) => fundo === true && temTeste(texto);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { texto, fundo } = comandoDoEvento();
  if (texto && testeEmSegundoPlano(texto, fundo)) bloquear(RAZAO);
}
