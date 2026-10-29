// The protection hooks of a generated project (F-13, #14): the two shell hooks, the idle watch and the join into settings.json.
// Seams: each hook script called with the JSON of the event on stdin (exit code and message), and juntarSettings as a pure function.
// No command of the corpus is ever run: it only travels as text inside the event. Standard library only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCRIPTS, juntarSettings, validarHooks, ficheirosDosHooks, relogio, SettingsInvalido } from './hooks.mjs';
import { MATAR_BLOQUEIA, MATAR_PASSA, TESTES, FUNDO_PASSA } from '../tests/critico/f-13-r0/corpus-comandos.mjs'; // the closed oracle of criteria 1 and 2, kept growing there

const PACOTE = fileURLToPath(new URL('./hooks/', import.meta.url));
const temps = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'forge-hooks-')); temps.push(d); return d; };
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const script = (rel) => join(PACOTE, rel.split('/').pop());
const evento = (tool, command, bg) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command, ...(bg !== undefined && { run_in_background: bg }) } });
const correr = (rel, ev, env = {}, cwd = process.cwd()) =>
  spawnSync(process.execPath, [script(rel)], { input: typeof ev === 'string' ? ev : JSON.stringify(ev), encoding: 'utf8', cwd, env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: cwd }, timeout: 20000 });
// the scripts are small and fast, but 300 processes in a row are slow: one test per list, a loop inside
const erros = (lista, quer, f) => lista.filter((c) => f(c).status !== quer).map((c) => `${JSON.stringify(c)} -> exit ${f(c).status}`);

for (const tool of ['Bash', 'PowerShell']) {
  test(`hook 1 (${tool}): blocks the ${MATAR_BLOQUEIA.length} commands that kill by name, with the PID alternative in the message`, () => {
    const r = (c) => correr(SCRIPTS.matar, evento(tool, c));
    assert.deepEqual(erros(MATAR_BLOQUEIA, 2, r), []);
    assert.match(r(MATAR_BLOQUEIA[0]).stderr, /PID/);
  });
  test(`hook 1 (${tool}): lets the ${MATAR_PASSA.length} other commands through (no false positive)`, () => {
    assert.deepEqual(erros(MATAR_PASSA, 0, (c) => correr(SCRIPTS.matar, evento(tool, c))), []);
  });
}

test('hook 2: blocks the test commands only with run_in_background true, and says to run in the foreground in blocks up to 9 min', () => {
  const r = (bg) => (c) => correr(SCRIPTS.fundo, evento('Bash', c, bg));
  assert.deepEqual(erros(TESTES, 2, r(true)), []);
  assert.deepEqual(erros(TESTES, 0, r(false)), []);
  assert.deepEqual(erros(TESTES, 0, r(undefined)), []);
  assert.match(r(true)(TESTES[0]).stderr, /foreground.*9 min/);
});

test('hook 2: servers, builds and text that only mentions test go through in the background', () => {
  assert.deepEqual(erros(FUNDO_PASSA, 0, (c) => correr(SCRIPTS.fundo, evento('PowerShell', c, true))), []);
});

test('the shell hooks never block what they cannot read: bad JSON, no command, another tool', () => {
  for (const rel of [SCRIPTS.matar, SCRIPTS.fundo]) {
    for (const ev of ['', 'not json', '{}', JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x' } }), JSON.stringify({ tool_input: { command: 42 } })]) {
      assert.equal(correr(rel, ev).status, 0, `${rel} with ${JSON.stringify(ev).slice(0, 40)}`);
    }
  }
});

// --- the idle watch ---
const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0), S = 1000;
const montar = (agentes) => { // [{ nome, ticket, estado, idade (ms before AGORA, null = no file) }]
  const p = tmp(), dir = join(p, '.checkpoints');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'painel.json'), JSON.stringify({
    versao: 1, projeto: 'Exemplo', modo: 'rigoroso',
    tickets: [...new Set(agentes.map((a) => a.ticket))].map((id, i) => ({ id, issue: 40 + i, titulo: `Titulo ${id}`, estado: agentes.find((a) => a.ticket === id).estado, rondas: 1 })),
    agentes: agentes.map((a) => ({ nome: a.nome, papel: 'dev', ticket: a.ticket, modelo: 'sonnet', checkpoint: `${a.nome}.md` })),
  }));
  for (const a of agentes.filter((x) => x.idade !== null)) {
    writeFileSync(join(dir, `${a.nome}.md`), '# checkpoint\n');
    utimesSync(join(dir, `${a.nome}.md`), (AGORA - a.idade) / 1000, (AGORA - a.idade) / 1000);
  }
  return p;
};
const vigiar = (p) => correr(SCRIPTS.vigia, { hook_event_name: 'UserPromptSubmit', prompt: 'continua' }, relogio(AGORA), p);

test('idle watch: silent at 9 min 59 s, warns at 10 min 01 s with the agent and the ticket (the clock is injected)', () => {
  const calado = vigiar(montar([{ nome: 'dev-a', ticket: 'T-1', estado: 'dev', idade: 599 * S }]));
  assert.equal(calado.status, 0);
  assert.equal(calado.stdout, '');
  const avisa = vigiar(montar([{ nome: 'dev-a', ticket: 'T-1', estado: 'dev', idade: 601 * S }]));
  assert.equal(avisa.status, 0);
  assert.match(avisa.stdout, /dev-a/);
  assert.match(avisa.stdout, /T-1/);
});

test('idle watch: an agent with no checkpoint file is warned; tickets main and aprovado stay quiet; espera and falta count as active', () => {
  assert.match(vigiar(montar([{ nome: 'dev-b', ticket: 'T-2', estado: 'dev', idade: null }])).stdout, /dev-b[\s\S]*no checkpoint/);
  for (const estado of ['main', 'aprovado']) assert.equal(vigiar(montar([{ nome: 'dev-c', ticket: 'T-3', estado, idade: 3600 * S }])).stdout, '', estado);
  for (const estado of ['espera', 'falta']) assert.match(vigiar(montar([{ nome: 'dev-d', ticket: 'T-4', estado, idade: 3600 * S }])).stdout, /dev-d/, estado);
});

test('idle watch: without painel.json, or with one that is not valid, it writes nothing to the context and exits 0', () => {
  const sem = vigiar(tmp());
  assert.deepEqual([sem.status, sem.stdout, sem.stderr], [0, '', '']);
  const p = tmp();
  mkdirSync(join(p, '.checkpoints'));
  writeFileSync(join(p, '.checkpoints/painel.json'), '{ not json');
  const mau = vigiar(p);
  assert.deepEqual([mau.status, mau.stdout], [0, '']);
  assert.match(mau.stderr, /painel\.json/);
});

// --- the join into settings.json ---
const TRES = { killByName: true, backgroundTests: true, idleWatch: true };
const marcado = (s, script) => JSON.stringify(s).includes(script);

test('settings: the three answers put one entry each, in the project form (node + args), and a second run changes nothing', () => {
  const s1 = juntarSettings(undefined, TRES);
  const s = JSON.parse(s1);
  assert.deepEqual(Object.keys(s.hooks).sort(), ['PreToolUse', 'UserPromptSubmit']);
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.equal(s.hooks.PreToolUse[0].matcher, 'Bash|PowerShell');
  for (const x of Object.values(SCRIPTS)) assert.ok(marcado(s, x), x);
  assert.equal(juntarSettings(s1, TRES), null, 'already as asked: nothing to write');
});

test('settings: all false creates nothing; the user keys and hooks stay; a false removes only the forge entry', () => {
  assert.equal(juntarSettings(undefined, { killByName: false, backgroundTests: false, idleWatch: false }), null);
  const previo = { model: 'opus', permissions: { allow: ['Bash(git:*)'] }, hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'meu-hook' }] }], Stop: [{ hooks: [{ type: 'command', command: 'fim' }] }] } };
  const com = JSON.parse(juntarSettings(JSON.stringify(previo), TRES));
  assert.equal(com.model, 'opus');
  assert.deepEqual(com.permissions, previo.permissions);
  assert.deepEqual(com.hooks.Stop, previo.hooks.Stop);
  assert.deepEqual(com.hooks.PreToolUse[0], previo.hooks.PreToolUse[0]);
  const sem = JSON.parse(juntarSettings(JSON.stringify(com), { ...TRES, backgroundTests: false }));
  assert.ok(!marcado(sem, SCRIPTS.fundo) && marcado(sem, SCRIPTS.matar) && marcado(sem, SCRIPTS.vigia));
  assert.deepEqual(sem.hooks.PreToolUse[0], previo.hooks.PreToolUse[0]);
  const nada = JSON.parse(juntarSettings(JSON.stringify(com), { killByName: false, backgroundTests: false, idleWatch: false }));
  assert.deepEqual(nada, previo);
});

test('settings: a file that is not JSON (or not a settings object) is refused with exit 1, never overwritten; with all false it is left alone', () => {
  for (const mau of ['{ nope', '[]', '{"hooks":[]}', '{"hooks":{"PreToolUse":{}}}']) {
    assert.throws(() => juntarSettings(mau, TRES), (e) => e instanceof SettingsInvalido && e.exit === 1, mau);
    assert.equal(juntarSettings(mau, { killByName: false, backgroundTests: false, idleWatch: false }), null, mau);
  }
});

test('answers: validarHooks accepts nothing, or booleans on the three keys only; ficheirosDosHooks copies only what the true answers need', () => {
  assert.deepEqual(validarHooks(undefined), []);
  assert.deepEqual(validarHooks(TRES), []);
  for (const mau of [null, [], 'sim', { killByName: 'true' }, { killByName: true, outro: true }]) assert.equal(validarHooks(mau).length, 1, JSON.stringify(mau));
  const rels = (h) => ficheirosDosHooks(h).map(([rel]) => rel);
  assert.deepEqual(rels({ idleWatch: true }), [SCRIPTS.vigia]);
  assert.deepEqual(rels({ killByName: true }).sort(), [SCRIPTS.matar, '.claude/hooks/forge-shell.mjs'].sort());
  assert.deepEqual(rels({ killByName: false, backgroundTests: false, idleWatch: false }), []);
});
