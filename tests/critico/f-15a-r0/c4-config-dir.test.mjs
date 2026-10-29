// F-15a critério 4: com env.CLAUDE_CONFIG_DIR = <c>, os detectores plugin, skill e mcp leem <c>/plugins/installed_plugins.json,
// <c>/skills/<nome>/… e <c>/.claude.json, nunca <home>/.claude*; os comandos impressos que escrevem skills (gauntlet-loop, sdd e
// ponytail solto) usam o mesmo <c>/skills. Sem a variável, os caminhos são os de hoje. A variável vem SEMPRE do sys.env (o
// process.env deste processo aponta para uma pasta falsa: um doctor que o leia falha aqui).
// Oráculo: readFile espião nos 3 casos (definida, ausente, com espaços), asserção sobre os comandos impressos nas 3 plataformas,
// ensaio real dos comandos (git local, sem rede) e o detetor de contexto de aspas para um <c> hostil (injeção: reprova sempre).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { registry, loadDoctor, fakeSys, LATEST_URLS, PLATFORMS, commandsOf, unsafeAt, tmp, ponytailRepo, gauntletRepo, sddRepo, runCommands, dirsIn } from './helpers.mjs';

const N = (p) => resolve(p).toLowerCase();
const under = (p, dir) => N(p) === N(dir) || N(p).startsWith(N(dir) + sep);
const SKILLS = ['gauntlet-loop', 'ponytail', 'sdd', 'graphify'];
const spy = async (env, files = {}, home = '/h') => {
  const { runDoctor } = await loadDoctor();
  const reads = [];
  const report = await runDoctor({ components: registry().components }, fakeSys({ home, env, files, reads, urls: LATEST_URLS() }));
  return { reads, report };
};
const expected = (cfg, claudeJson) => [join(cfg, 'plugins', 'installed_plugins.json'), claudeJson, ...SKILLS.map((n) => join(cfg, 'skills', n, 'SKILL.md'))];

for (const [nome, c] of [['definida', '/cfg/claude'], ['com espaços', '/conf dir/claude cfg']]) {
  test(`C4 espião (variável ${nome}): lê <c>/plugins/installed_plugins.json, <c>/.claude.json e <c>/skills/<nome>/SKILL.md, e nada fora de <c>`, async () => {
    const { reads } = await spy({ CLAUDE_CONFIG_DIR: c });
    const lidos = new Set(reads.map(N));
    const faltam = expected(c, join(c, '.claude.json')).filter((p) => !lidos.has(N(p)));
    assert.deepEqual(faltam, [], 'caminhos que o doctor não leu em <c>');
    assert.deepEqual(reads.filter((p) => !under(p, c)), [], 'leituras fora de <c>');
    assert.deepEqual(reads.filter((p) => under(p, join('/h', '.claude')) || N(p) === N(join('/h', '.claude.json'))), [], 'leu <home>/.claude*');
  });
}

test('C4 espião (variável ausente): os caminhos são os de hoje, <home>/.claude e <home>/.claude.json (o process.env não conta)', async () => {
  const { reads } = await spy({});
  const lidos = new Set(reads.map(N));
  assert.deepEqual(expected(join('/h', '.claude'), join('/h', '.claude.json')).filter((p) => !lidos.has(N(p))), []);
  assert.deepEqual(reads.filter((p) => !under(p, join('/h', '.claude')) && N(p) !== N(join('/h', '.claude.json'))), [], 'leituras fora de <home>/.claude*');
});

test('C4: com a variável, deteta o que está em <c> (incluindo o .graphify_version) e não volta a <home> quando <c> está vazio', async () => {
  const c = '/conf dir/claude cfg';
  const layout = (cfg, claudeJson) => ({
    [join(cfg, 'plugins', 'installed_plugins.json')]: JSON.stringify({ plugins: { 'ponytail@ponytail': [{ version: '5.3.3' }] } }),
    [claudeJson]: JSON.stringify({ mcpServers: { 'ai-memory': {} } }),
    [join(cfg, 'skills', 'graphify', 'SKILL.md')]: '---\nname: graphify\n---\n',
    [join(cfg, 'skills', 'graphify', '.graphify_version')]: '0.9.97\n',
  });
  const { reads, report } = await spy({ CLAUDE_CONFIG_DIR: c }, layout(c, join(c, '.claude.json')));
  const by = Object.fromEntries(report.components.map((x) => [x.id, x]));
  assert.equal(by.ponytail.installed, true, 'plugin em <c> não detetado');
  assert.equal(by['graphify-skill'].installedVersion, '0.9.97', 'versionFile não lido de <c>');
  assert.equal(by['ai-memory-mcp'].installed, true, 'MCP em <c>/.claude.json não detetado');
  assert.ok(reads.some((p) => N(p) === N(join(c, 'skills', 'graphify', '.graphify_version'))));
  // a mesma máquina com tudo em <home> e a variável a apontar para <c> vazio: tudo missing, sem cair para <home>
  const vazio = await spy({ CLAUDE_CONFIG_DIR: c }, layout(join('/h', '.claude'), join('/h', '.claude.json')));
  const vb = Object.fromEntries(vazio.report.components.map((x) => [x.id, x]));
  for (const id of ['ponytail', 'graphify-skill', 'ai-memory-mcp']) assert.equal(vb[id].installed, false, id + ' foi lido de <home> com CLAUDE_CONFIG_DIR definido');
});

// Comandos que escrevem skills: missing (install) e outdated (update) para gauntlet-loop e sdd, e o ponytail solto desatualizado
const writers = (c, platform, home = '/h') => fakeSys({
  platform, home, env: c === undefined ? {} : { CLAUDE_CONFIG_DIR: c },
  files: { [join(c ?? join(home, '.claude'), 'skills', 'ponytail', 'SKILL.md')]: 'old text' },
  urls: LATEST_URLS(),
});
const outdatedWriters = (c, platform) => fakeSys({
  platform, home: '/h', env: { CLAUDE_CONFIG_DIR: c },
  files: { [join(c, 'skills', 'gauntlet-loop', 'SKILL.md')]: 'local text', [join(c, 'skills', 'sdd', 'SKILL.md')]: '---\nversion: 2.0.0\n---\n' },
  urls: LATEST_URLS(),
});
const HOME_SKILLS = /(\$HOME|~|\$env:USERPROFILE|\$env:HOME|%USERPROFILE%)[\/\\]\.claude[\/\\]skills/;
const slash = (s) => s.replace(/\\/g, '/');

for (const [platform] of PLATFORMS) {
  test(`C4 comandos (${platform}): com <c> (com espaços), os comandos de gauntlet-loop, sdd e ponytail solto escrevem em <c>/skills, nunca em ~/.claude/skills`, async () => {
    const { runDoctor } = await loadDoctor();
    const c = '/conf dir/claude cfg';
    const maus = [];
    for (const sys of [writers(c, platform), outdatedWriters(c, platform)]) {
      const r = await runDoctor({ components: registry().components }, sys);
      for (const x of r.components.filter((k) => ['gauntlet-loop', 'sdd', 'ponytail'].includes(k.id) && k.command?.length)) {
        for (const cmd of x.command) {
          if (x.id === 'ponytail' && cmd.includes('claude plugin')) continue;
          if (HOME_SKILLS.test(cmd)) maus.push(`${x.id} ${x.status}: escreve em ~/.claude/skills: ${cmd.slice(0, 140)}`);
          else if (!slash(cmd).includes(slash(c)) && !cmd.includes('CLAUDE_CONFIG_DIR')) maus.push(`${x.id} ${x.status}: não usa <c>: ${cmd.slice(0, 140)}`);
        }
      }
      for (const id of ['gauntlet-loop', 'sdd', 'ponytail']) assert.ok(r.components.find((k) => k.id === id).command?.length, id + ' sem comando neste cenário');
    }
    assert.deepEqual(maus, []);
  });
}

// Ensaio real (shell desta plataforma, git local, sem rede): com e sem a variável, o ficheiro aparece no sítio certo
const CASOS = [
  ['gauntlet-loop', 'https://github.com/RenatoWernik/gauntlet-loop', gauntletRepo, ['SKILL.md']], // emenda: o fork
  ['sdd', 'https://github.com/SpillwaveSolutions/sdd-skill', sddRepo, ['SKILL.md', 'skill.json', 'README.md', 'references', 'scripts']],
  ['ponytail', 'https://github.com/DietrichGebert/ponytail', ponytailRepo, ['SKILL.md']],
];
for (const [id, url, repo, ficheiros] of CASOS) {
  for (const comVar of [false, true]) {
    test(`C4 ensaio real (${id}, ${comVar ? '<c> com espaços' : 'sem a variável'}): o comando impresso escreve em ${comVar ? '<c>/skills' : '<home>/.claude/skills'} e só aí`, async () => {
      const { runDoctor } = await loadDoctor();
      const home = tmp('critico-f15a-h-'), temp = tmp('critico-f15a-t-');
      const c = comVar ? join(tmp('critico-f15a-c-'), 'conf dir', 'claude cfg') : undefined;
      if (c) mkdirSync(c, { recursive: true });
      const r = await runDoctor({ components: registry().components }, writers(c, process.platform, home));
      const x = r.components.find((k) => k.id === id);
      assert.ok(x.command?.length, id + ' sem comando');
      runCommands(x.command, url, repo(), { home, temp, configDir: c });
      const alvo = join(c ?? join(home, '.claude'), 'skills', id);
      for (const f of ficheiros) assert.ok(existsSync(join(alvo, f)), `${id}: falta ${f} em ${comVar ? '<c>' : '<home>/.claude'}/skills/${id}`);
      if (comVar) assert.deepEqual(dirsIn(join(home, '.claude')), [], 'escreveu em <home>/.claude com CLAUDE_CONFIG_DIR definido');
    });
  }
}

// <c> hostil: o caminho entra no comando impresso, mas nunca como código
const PS = ["D:\\cfg$(Write-Warning critico7f3)x", "D:\\cfg'; Write-Warning critico7f3; 'x", 'D:\\cfg"; Write-Warning critico7f3; "x'];
const SH = ['/cfg$(touch critico7f3)x', '/cfg`touch critico7f3`x', "/cfg'; touch critico7f3; 'x", '/cfg"; touch critico7f3; "x'];
for (const [platform, key] of PLATFORMS) {
  test(`reprova sempre (${platform}): um CLAUDE_CONFIG_DIR com caracteres de shell nunca vira código nos comandos impressos`, async () => {
    const { runDoctor } = await loadDoctor();
    const [payloads, token, dialect] = key === 'windows' ? [PS, 'Write-Warning critico7f3', 'ps'] : [SH, 'touch critico7f3', 'sh'];
    const maus = [];
    for (const c of payloads) {
      for (const sys of [writers(c, platform), outdatedWriters(c, platform)]) {
        const r = await runDoctor({ components: registry().components }, sys);
        for (const cmd of commandsOf(r)) if (unsafeAt(cmd, token, dialect).length) maus.push(`${JSON.stringify(c)} → ${cmd.slice(0, 200)}`);
      }
    }
    assert.deepEqual(maus, []);
  });
}
