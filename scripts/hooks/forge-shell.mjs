// Shared by the two shell hooks (kill by name, tests in the background): reads the hook event and splits a Bash or PowerShell command line
// into statements of simple commands. Only the command position counts: text in quotes, after echo, in a commit message or in a grep pattern is data.
// ponytail: a small tokenizer, not a parser: no variables (`$p = pgrep node; kill $p` is not followed), no PowerShell backtick escapes; upgrade: grow the corpus, not the parser
import { readFileSync } from 'node:fs';

// the event JSON from stdin -> the command text, or null (not a shell event, or no readable event: the hook then lets the call through)
export function comandoDoEvento() {
  try {
    const ev = JSON.parse(readFileSync(0, 'utf8'));
    return { texto: typeof ev?.tool_input?.command === 'string' ? ev.tool_input.command : null, fundo: ev?.tool_input?.run_in_background === true };
  } catch (e) {
    process.stderr.write(`forge hook: could not read the event (${String(e.message).split('\n')[0]}); the call goes ahead\n`);
    return { texto: null, fundo: false };
  }
}

// exit code 2 blocks the call and the stderr text is the reason Claude reads; process.exitCode (not exit()) so the text is flushed
export function bloquear(razao) {
  process.stderr.write(`${razao}\n`);
  process.exitCode = 2;
}

const FIM = (s, i) => s[i] === '\n' || s[i] === ';' || (s[i] === '&' && s[i + 1] === '&') || (s[i] === '|' && s[i + 1] === '|');

// the text inside a `$(...)` that starts at s[i] === '('; -> [inner, index after the closing parenthesis]
function dentroDeParenteses(s, i) {
  let n = 0, q = '';
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === q) q = ''; continue; }
    if (c === "'" || c === '"') q = c;
    else if (c === '(') n++;
    else if (c === ')' && --n === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

// text -> [{ segments: Token[][], subs: string[] }], Token = { s: text without its quotes, q: some part was quoted }
// A statement ends at ; && || & and a new line; a pipe, a ( ) group or a { } block only ends a segment. `subs` are the $(...) and `...` texts, which run too.
export function statements(texto) {
  const out = [];
  let st = { segments: [], subs: [] }, seg = [], cur = '', has = false, quoted = false, tokParen = 0, sq = false, dq = false;
  const tok = () => { if (has) seg.push({ s: cur, q: quoted }); cur = ''; has = quoted = false; tokParen = 0; };
  const fimSeg = () => { tok(); if (seg.length) st.segments.push(seg); seg = []; };
  const fimSt = () => { fimSeg(); if (st.segments.length || st.subs.length) out.push(st); st = { segments: [], subs: [] }; };
  const sub = (inner) => { st.subs.push(inner); cur += `$(${inner})`; has = true; };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (sq) { if (c === "'") sq = false; else cur += c; continue; }
    if (dq) {
      if (c === '"') dq = false;
      else if (c === '\\' && (texto[i + 1] === '"' || texto[i + 1] === '\\')) cur += texto[++i];
      else if (c === '`' && texto[i + 1] === '"') cur += texto[++i];
      else if (c === '$' && texto[i + 1] === '(') { const [inner, j] = dentroDeParenteses(texto, i + 1); sub(inner); i = j - 1; }
      else if (c === '`' && texto.indexOf('`', i + 1) > i) { const j = texto.indexOf('`', i + 1); sub(texto.slice(i + 1, j)); i = j; }
      else cur += c;
      continue;
    }
    if (c === "'") { sq = has = quoted = true; continue; }
    if (c === '"') { dq = has = quoted = true; continue; }
    if (c === '$' && texto[i + 1] === '(') { const [inner, j] = dentroDeParenteses(texto, i + 1); sub(inner); i = j - 1; continue; }
    if (c === '`' && texto.indexOf('`', i + 1) > i) { const j = texto.indexOf('`', i + 1); sub(texto.slice(i + 1, j)); i = j; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { tok(); continue; }
    if (FIM(texto, i)) { fimSt(); if (c !== '\n' && c !== ';') i++; continue; }
    if (c === '&' && texto[i - 1] !== '>' && texto[i - 1] !== '<' && texto[i + 1] !== '>') { fimSt(); continue; } // 2>&1 and &> are redirections
    if (c === '|') { fimSeg(); continue; }
    const aberto = !has && cur === '';
    if (c === '(' && aberto) { fimSeg(); continue; }
    if (c === '(') { tokParen++; cur += c; has = true; continue; } // a call such as .Kill()
    if (c === ')') { if (tokParen > 0) { tokParen--; cur += c; has = true; } else fimSeg(); continue; }
    if ((c === '{' || c === '}') && aberto) { fimSeg(); continue; }
    cur += c; has = true;
  }
  fimSt();
  return out;
}

const PREFIXO = new Set(['sudo', 'doas', 'nohup', 'time', 'command', 'exec', 'env', 'nice', 'timeout', 'builtin', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', 'call']);
const COM_VALOR = new Set(['-u', '-g', '-U']); // sudo options that take a value

// the program a path or word names: no folder, no extension, lower case (some\folder\taskkill.exe -> taskkill)
export const nome = (s) => s.split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|com|ps1)$/, '');

// a segment's tokens -> { name, args, tokens } without the prefixes (VAR=1, sudo, timeout 5, nohup, if ...), or null when nothing is left
export function comando(tokens) {
  let i = 0;
  for (;;) {
    const t = tokens[i];
    if (!t) return null;
    if (!t.q && (/^[A-Za-z_]\w*=/.test(t.s) || /^\$env:\w+=/i.test(t.s))) { i++; continue; }
    const n = nome(t.s);
    if (!PREFIXO.has(n)) return { name: n, args: tokens.slice(i + 1), tokens: tokens.slice(i) };
    i++;
    while (tokens[i] && ((!tokens[i].q && tokens[i].s.startsWith('-')) || /^[\d.]+[smhd]?$/.test(tokens[i].s))) i += COM_VALOR.has(tokens[i].s) ? 2 : 1;
  }
}

const EMBRULHA = new Set(['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'dash', 'eval', 'iex', 'invoke-expression']);
const eOpcao = (t) => !t.q && /^[-/][A-Za-z]/.test(t.s);

// the command lines a wrapper runs (cmd /c ..., powershell -Command "...", bash -c '...', eval ...): the words after its options, and every quoted text with spaces
export function embrulhado({ name, args }) {
  if (!EMBRULHA.has(name)) return [];
  const i = args.findIndex((t) => !eOpcao(t));
  return [...(i < 0 ? [] : [args.slice(i).map((t) => t.s).join(' ')]), ...args.filter((t) => t.q && /\s/.test(t.s)).map((t) => t.s)];
}
