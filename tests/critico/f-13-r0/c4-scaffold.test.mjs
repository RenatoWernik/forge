// F-13 critério 4: o scaffold escreve só os hooks com true e junta-os a um .claude/settings.json existente sem perder chaves nem hooks
// anteriores; com os três a false (ou sem a resposta hooks) não cria nem altera o ficheiro; instalar duas vezes não duplica entradas.
// Oráculo: as 8 combinações dos três booleanos, mais fixtures com um settings.json prévio (igualdade profunda das chaves antigas).
// Âmbito: (1) e (2) são PreToolUse sobre Bash e PowerShell; o vigia fica no evento que a ponte declara; cada entrada instalada,
// corrida como o Claude Code a corre (exec form ou shell form), funciona; a skill new-project pergunta hook a hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, api, tmp, gerar, hooksDe, COMBOS, QUAIS, CHAVE, settingsDe, readJson, refsAo, cobre, entradaPre, correrComoClaudeCode, veredito, aviso, mostra,
  mkdirSync, writeFileSync,
} from './helpers.mjs';

const nomeCombo = (h) => QUAIS.map((q) => `${q}=${h[CHAVE[q]]}`).join(' ');

for (const h of COMBOS) {
  test(`C4: ${nomeCombo(h)}: o settings.json do projeto tem exatamente os hooks com true, e os scripts deles existem`, async () => {
    const u = await api();
    const proj = await gerar(h);
    const algum = QUAIS.some((q) => h[CHAVE[q]]);
    assert.equal(existsSync(settingsDe(proj)), algum, algum ? 'falta .claude/settings.json' : 'com os três a false não pode criar .claude/settings.json');
    if (!algum) return;
    const s = readJson(settingsDe(proj));
    for (const q of QUAIS) {
      const refs = refsAo(s, u.scripts[q]);
      if (!h[CHAVE[q]]) { assert.deepEqual(refs, [], q + ' está a false e foi instalado'); continue; }
      assert.ok(refs.length > 0, q + ' está a true e não foi instalado');
      assert.ok(existsSync(join(proj, u.scripts[q])), 'falta o script ' + u.scripts[q]);
      if (q === 'vigia') assert.ok(refs.every((x) => x.evento === u.eventoVigia), 'o vigia está fora do evento ' + u.eventoVigia + ': ' + JSON.stringify(refs));
      else for (const tool of ['Bash', 'PowerShell']) assert.ok(cobre(s, u.scripts[q], tool), `${q}: nenhum PreToolUse corre o script para a ferramenta ${tool}`);
    }
  });
}

test('C4: respostas sem a chave hooks (os conjuntos do corpus de antes do F-13) não criam .claude/settings.json', async () => {
  const proj = await gerar(undefined);
  assert.ok(!existsSync(settingsDe(proj)));
});

// settings.json prévio de um utilizador: chaves de topo, um PreToolUse próprio sobre Bash e um Stop
const PREVIO = {
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  model: 'sonnet',
  env: { FOO: '1', BAR: 'dois' },
  permissions: { allow: ['Bash(git status)', 'Bash(npm run lint)'], deny: ['Read(./.env)'] },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre-existente', timeout: 5 }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'echo fim' }] }],
  },
  enabledPlugins: { 'exemplo@mercado': true },
};
const LOCAL = { permissions: { allow: ['Bash(ls)'] } };
const comPrevio = () => {
  const dest = join(tmp(), 'proj');
  mkdirSync(join(dest, '.claude'), { recursive: true });
  writeFileSync(join(dest, '.claude/settings.json'), JSON.stringify(PREVIO, null, 2) + '\n');
  writeFileSync(join(dest, '.claude/settings.local.json'), JSON.stringify(LOCAL, null, 2) + '\n');
  return dest;
};
const guardouTudo = (s) => {
  for (const k of Object.keys(PREVIO).filter((k) => k !== 'hooks')) assert.deepEqual(s[k], PREVIO[k], 'perdeu ou mudou a chave ' + k);
  for (const [evento, grupos] of Object.entries(PREVIO.hooks)) {
    for (const g of grupos) assert.ok((s.hooks?.[evento] ?? []).some((x) => JSON.stringify(x) === JSON.stringify(g)), `perdeu o hook anterior de ${evento}: ${JSON.stringify(g)}`);
  }
};

for (const h of COMBOS.filter((x) => QUAIS.some((q) => x[CHAVE[q]]))) {
  test(`C4: ${nomeCombo(h)} com um settings.json prévio: junta os hooks com true e guarda todas as chaves e hooks antigos (igualdade profunda)`, async () => {
    const u = await api();
    const dest = comPrevio();
    await gerar(h, { dest });
    const s = readJson(settingsDe(dest));
    guardouTudo(s);
    for (const q of QUAIS) assert.equal(refsAo(s, u.scripts[q]).length > 0, h[CHAVE[q]], q);
    assert.deepEqual(readJson(join(dest, '.claude/settings.local.json')), LOCAL, 'mexeu no settings.local.json');
  });
}

test('C4: com os três a false e um settings.json prévio, o ficheiro fica igual byte a byte', async () => {
  const dest = comPrevio();
  const antes = readFileSync(settingsDe(dest));
  await gerar(hooksDe(false, false, false), { dest });
  assert.ok(readFileSync(settingsDe(dest)).equals(antes), 'o settings.json mudou');
});

test('C4: um settings.json prévio que não é JSON válido nunca é destruído (o scaffold recusa ou deixa-o igual, byte a byte)', async () => {
  const dest = join(tmp(), 'proj');
  mkdirSync(join(dest, '.claude'), { recursive: true });
  const partido = '{\n  // comentário do utilizador\n  "model": "sonnet",\n';
  writeFileSync(settingsDe(dest), partido);
  try { await gerar(hooksDe(true, true, true), { dest }); } catch { /* recusar é aceitável */ }
  assert.equal(readFileSync(settingsDe(dest), 'utf8'), partido);
});

test('C4: instalar duas vezes (scaffold com force por cima) não duplica nenhum hook e guarda o que o utilizador acrescentou entre as duas', async () => {
  const u = await api();
  const dest = await gerar(hooksDe(true, true, true));
  const s1 = readJson(settingsDe(dest));
  s1.permissions = PREVIO.permissions;
  s1.hooks.Stop = PREVIO.hooks.Stop;
  writeFileSync(settingsDe(dest), JSON.stringify(s1, null, 2) + '\n');
  await gerar(hooksDe(true, true, true), { dest, force: true });
  const s2 = readJson(settingsDe(dest));
  for (const q of QUAIS) assert.equal(refsAo(s2, u.scripts[q]).length, refsAo(s1, u.scripts[q]).length, q + ' ficou duplicado: ' + JSON.stringify(refsAo(s2, u.scripts[q])));
  assert.deepEqual(s2.permissions, PREVIO.permissions);
  assert.deepEqual(s2.hooks.Stop, PREVIO.hooks.Stop);
});

// A entrada instalada, corrida como o Claude Code a corre (exec form: command + args; shell form: Git Bash, ou PowerShell com shell "powershell")
test('âmbito: cada hook instalado, corrido a partir do settings.json como o Claude Code o corre, faz o que o seu critério diz', async (t) => {
  const u = await api();
  const proj = await gerar(hooksDe(true, true, true));
  const s = readJson(settingsDe(proj));
  const [m] = refsAo(s, u.scripts.matar);
  const [f] = refsAo(s, u.scripts.fundo);
  const [v] = refsAo(s, u.scripts.vigia);
  const corre = (x, entrada, env) => {
    const r = correrComoClaudeCode(proj, x.hook, entrada, env);
    if (r === null) t.skip('shell form sem Git Bash nesta máquina');
    return r;
  };
  const r1 = corre(m, entradaPre(proj, 'Bash', 'taskkill /F /IM node.exe'));
  if (r1) assert.ok(veredito(r1).bloqueia, 'matar: ' + mostra(r1));
  const r2 = corre(m, entradaPre(proj, 'PowerShell', 'Stop-Process -Id 1234'));
  if (r2) assert.ok(veredito(r2).passa, 'matar: ' + mostra(r2));
  const r3 = corre(f, entradaPre(proj, 'Bash', 'npm test', true));
  if (r3) assert.ok(veredito(r3).bloqueia, 'fundo: ' + mostra(r3));
  const r4 = corre(f, entradaPre(proj, 'Bash', 'npm run dev', true));
  if (r4) assert.ok(veredito(r4).passa, 'fundo: ' + mostra(r4));
  // vigia: um agente ativo parado há 10 min 01 s
  const AGORA = Date.UTC(2026, 9, 29, 12, 0, 0);
  const dir = join(proj, '.checkpoints');
  writeFileSync(join(dir, 'painel.json'), JSON.stringify({ versao: 1, projeto: 'P', objetivo: '', modo: 'rigoroso', tickets: [{ id: 'T-41', issue: 41, titulo: 'X', estado: 'dev', rondas: 0 }], agentes: [{ nome: 'dev-alfa', papel: 'dev', ticket: 'T-41', modelo: 'sonnet', checkpoint: 'dev-alfa.md' }] }));
  writeFileSync(join(dir, 'dev-alfa.md'), '#\n');
  utimesSync(join(dir, 'dev-alfa.md'), (AGORA - 601000) / 1000, (AGORA - 601000) / 1000);
  const r5 = corre(v, { session_id: 's', transcript_path: join(proj, 't.jsonl'), cwd: proj, permission_mode: 'default', hook_event_name: u.eventoVigia, prompt: 'continua' }, u.relogio(AGORA));
  if (r5) assert.ok((aviso(r5) ?? '').includes('dev-alfa'), 'vigia: ' + mostra(r5));
});

test('âmbito: o passo «hooks» da skill new-project pergunta hook a hook (as três chaves de setup estão na skill)', () => {
  const src = readFileSync(join(ROOT, 'skills/new-project/SKILL.md'), 'utf8');
  for (const k of Object.values(CHAVE)) assert.ok(src.includes(k), 'a skill new-project não fala de ' + k);
});
