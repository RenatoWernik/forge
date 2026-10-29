// The protection hooks of a generated project (F-13): which scripts, where they are installed, and how they join .claude/settings.json.
// Pure: text in, text out; scaffold.mjs does the reading and writing. The settings.json of the PROJECT is the only file ever touched.
import { fileURLToPath } from 'node:url';

const FONTES = fileURLToPath(new URL('./hooks/', import.meta.url));
const PASTA = '.claude/hooks/';
const BASH_E_POWERSHELL = 'Bash|PowerShell';

export const CHAVES = ['killByName', 'backgroundTests', 'idleWatch']; // the setup answers, in the order of the three hooks
export const EVENTO_VIGIA = 'UserPromptSubmit';
export const SCRIPTS = { matar: `${PASTA}forge-matar-por-nome.mjs`, fundo: `${PASTA}forge-testes-em-primeiro-plano.mjs`, vigia: `${PASTA}forge-vigia-de-agentes.mjs` };
export const NOMES_NO_ENV = { matar: CHAVES[0], fundo: CHAVES[1], vigia: CHAVES[2] }; // the words of the `hooks` line of check.cjs --env
const COMPARTILHADO = `${PASTA}forge-shell.mjs`; // used by the two shell hooks
// the entry of each hook in settings.json; the script path is the stable marker that finds it again
const ENTRADAS = [
  { chave: CHAVES[0], script: SCRIPTS.matar, evento: 'PreToolUse', matcher: BASH_E_POWERSHELL },
  { chave: CHAVES[1], script: SCRIPTS.fundo, evento: 'PreToolUse', matcher: BASH_E_POWERSHELL },
  { chave: CHAVES[2], script: SCRIPTS.vigia, evento: EVENTO_VIGIA },
];

// the clock of the idle watch, in the environment (a test fixes "now"; in real use nothing sets it)
export const relogio = (ms) => ({ FORGE_VIGIA_NOW_MS: String(ms) });

export class SettingsInvalido extends Error { exit = 1; }

// answers.hooks -> list of problems ([] = valid; undefined = no answer, which leaves settings.json alone)
export const validarHooks = (h) =>
  h === undefined || (h !== null && typeof h === 'object' && !Array.isArray(h) && Object.entries(h).every(([k, v]) => CHAVES.includes(k) && typeof v === 'boolean'))
    ? [] : [`hooks: an object with only ${CHAVES.join(', ')}, each true or false`];

// [relative path in the project, absolute path in the package] of the scripts that the true answers need
export function ficheirosDosHooks(h) {
  const on = ENTRADAS.filter((e) => h?.[e.chave] === true);
  const ficheiros = on.map((e) => e.script);
  if (on.some((e) => e.script !== SCRIPTS.vigia)) ficheiros.push(COMPARTILHADO);
  return ficheiros.map((rel) => [rel, FONTES + rel.slice(PASTA.length)]);
}

const texto = (h) => [h?.command, ...(Array.isArray(h?.args) ? h.args : [])].join(' ').replaceAll('\\', '/');
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The new text of settings.json, or null when the file should stay as it is (including "do not create it").
// previo: the current text, or undefined when there is no file. h: the true/false answers of the three hooks.
// Every other key and hook of the user stays; only the entries of the forge scripts are dropped and put back as the answers say.
export function juntarSettings(previo, h) {
  const instalar = ENTRADAS.filter((e) => h[e.chave] === true);
  let s = {};
  if (previo !== undefined) {
    try { s = JSON.parse(previo.replace(/^﻿/, '')); } catch (e) {
      if (!instalar.length) return null; // nothing to add, and a file that is not ours to read stays as it is
      throw new SettingsInvalido(`.claude/settings.json is not valid JSON (${String(e.message).split('\n')[0]}). forge wrote nothing: fix the file or move it away, then run again.`);
    }
    if (!objeto(s) || (s.hooks !== undefined && (!objeto(s.hooks) || !Object.values(s.hooks).every(Array.isArray)))) {
      if (!instalar.length) return null;
      throw new SettingsInvalido('.claude/settings.json does not have the shape of a Claude Code settings file (an object, with "hooks" as an object of lists). forge wrote nothing.');
    }
  }
  const antes = JSON.stringify(s), tinha = Object.keys(s.hooks ?? {}).length > 0;
  for (const e of ENTRADAS) {
    for (const [evento, grupos] of Object.entries(s.hooks ?? {})) {
      const resto = grupos.flatMap((g) => {
        if (!Array.isArray(g?.hooks)) return [g];
        const ficam = g.hooks.filter((x) => !texto(x).includes(e.script));
        return ficam.length === g.hooks.length ? [g] : ficam.length ? [{ ...g, hooks: ficam }] : [];
      });
      if (resto.length) s.hooks[evento] = resto;
      else if (grupos.length) delete s.hooks[evento];
    }
  }
  if (tinha && !Object.keys(s.hooks).length) delete s.hooks; // we emptied it
  for (const e of instalar) {
    s.hooks ??= {};
    s.hooks[e.evento] = [...(s.hooks[e.evento] ?? []), {
      ...(e.matcher && { matcher: e.matcher }),
      hooks: [{ type: 'command', command: 'node', args: [`\${CLAUDE_PROJECT_DIR}/${e.script}`], timeout: 10 }],
    }];
  }
  return JSON.stringify(s) === antes ? null : `${JSON.stringify(s, null, 2)}\n`;
}
