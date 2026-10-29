// Emenda do F-15a (#38; E:\Guilda\.checkpoints\orquestrador-emenda-f15a-gauntlet.md, 2026-10-29): o gauntlet-loop que o forge
// distribui vem do fork RenatoWernik/gauntlet-loop (commit fc6b2fc), a versão personalizada do responsável. A origem é sempre o
// fork, nunca o original robonuggets/gauntlet-loop; a deteção de «personalizada» compara com o fork, e uma cópia local igual ao
// fork não conta como personalizada (fica ok). O aviso de commits novos no original é do F-15b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { COMPAT, ROOT, registry, readJson, entries, loadDoctor, fakeSys, LATEST_URLS, RAW, HEADSHA, GAUNTLET_FORK, GAUNTLET_UPSTREAM, copyPackage, runNodeTest } from './helpers.mjs';

const FORK_URL = 'https://github.com/' + GAUNTLET_FORK;
const forPlatform = (m, k) => (Array.isArray(m) ? m : m?.[k] ?? []);
const gl = () => registry().components.find((c) => c.id === 'gauntlet-loop');

test('emenda: no registo, a origem do gauntlet-loop é o fork — source, latest e todos os comandos — e nunca o robonuggets', () => {
  const c = gl();
  assert.equal(c.source, FORK_URL, 'source do registo');
  assert.equal(c.latest?.repo, GAUNTLET_FORK, 'latest.repo do registo');
  const cmds = ['windows', 'macos', 'linux'].flatMap((k) => [c.install, c.update, ...c.installed.map((i) => i.update)].flatMap((m) => forPlatform(m, k)));
  assert.ok(cmds.length >= 6, 'comandos de install e update em falta');
  const maus = cmds.filter((x) => /robonuggets/i.test(x) || (/git clone/.test(x) && !x.includes(FORK_URL)));
  assert.deepEqual(maus, [], 'comandos que não clonam o fork');
});

test('emenda: no compat.json, o source e o verifiedWith do gauntlet-loop são o fork em fc6b2fc, sem robonuggets na surface', () => {
  const e = entries(readJson(COMPAT))['gauntlet-loop'];
  assert.match(e.verifiedWith, /^fc6b2fc[0-9a-f]{0,33}$/);
  assert.ok(e.source.toLowerCase().includes(GAUNTLET_FORK.toLowerCase()) && /[/=@]fc6b2fc[0-9a-f]*([/?#]|$)/.test(e.source), 'source fora do fork em fc6b2fc: ' + e.source);
  assert.doesNotMatch(JSON.stringify({ source: e.source, surface: e.surface, verifiedWith: e.verifiedWith }), /robonuggets/i);
});

const PATH = () => gl().latest?.content?.path ?? '.claude/skills/gauntlet-loop/SKILL.md';
const UP = (sha) => [`https://api.github.com/repos/${GAUNTLET_UPSTREAM}/commits/HEAD`, JSON.stringify({ sha })];
const run = async (platform, local) => {
  const { runDoctor } = await loadDoctor();
  const fetched = [];
  const urls = LATEST_URLS({
    [RAW(GAUNTLET_FORK, HEADSHA, PATH())]: '---\nname: gauntlet-loop\n---\n# fork personalizado\nlinha do responsável\n',
    ...Object.fromEntries([UP('1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')]),
    [RAW(GAUNTLET_UPSTREAM, '1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', PATH())]: '---\nname: gauntlet-loop\n---\n# original\n',
  });
  const files = local === null ? {} : { [join('/h', '.claude', 'skills', 'gauntlet-loop', 'SKILL.md')]: local };
  const r = await runDoctor({ components: registry().components }, fakeSys({ platform, files, urls, fetched }));
  return { c: r.components.find((x) => x.id === 'gauntlet-loop'), fetched };
};

for (const platform of ['win32', 'linux']) {
  test(`emenda (${platform}): a cópia local igual ao fork (também com CRLF) não conta como personalizada — fica ok, sem comando`, async () => {
    for (const local of ['---\nname: gauntlet-loop\n---\n# fork personalizado\nlinha do responsável\n', '---\r\nname: gauntlet-loop\r\n---\r\n# fork personalizado\r\nlinha do responsável\r\n']) {
      const { c } = await run(platform, local);
      assert.equal(c.installed, true);
      assert.equal(c.status, 'ok', 'a cópia igual ao fork ficou ' + c.status);
      assert.ok(!c.command?.length, 'comando proposto para uma cópia igual ao fork');
    }
  });

  test(`emenda (${platform}): a cópia igual ao ORIGINAL (diferente do fork) fica outdated e o comando clona o fork`, async () => {
    const { c } = await run(platform, '---\nname: gauntlet-loop\n---\n# original\n');
    assert.equal(c.status, 'outdated');
    assert.ok(c.command?.some((x) => x.includes(FORK_URL)), 'o comando não clona o fork');
    assert.ok(!c.command.some((x) => /robonuggets/i.test(x)), 'o comando usa o original');
  });

  test(`emenda (${platform}): o doctor compara com o fork e nunca lê o conteúdo do original para decidir o estado`, async () => {
    for (const local of [null, '---\nname: gauntlet-loop\n---\n# fork personalizado\nlinha do responsável\n', 'outra coisa']) {
      const { fetched } = await run(platform, local);
      assert.ok(fetched.some((u) => u.includes(GAUNTLET_FORK)), 'o doctor não consultou o fork');
      assert.deepEqual(fetched.filter((u) => u.startsWith('https://raw.githubusercontent.com/' + GAUNTLET_UPSTREAM)), [], 'leu o SKILL.md do original');
    }
  });
}

// O slug do fork é a única exceção ao teste «real registry: no personal or company data» do doctor.test.mjs: o teste continua lá e
// continua a reprovar qualquer outra ocorrência do nome do responsável no registo.
const plantar = (dir, f) => { const p = join(dir, 'components.json'); const j = JSON.parse(readFileSync(p, 'utf8')); f(j.components); writeFileSync(p, JSON.stringify(j, null, 2)); };
test('reprova sempre (dados pessoais): o doctor.test.mjs aceita o slug do fork e continua a reprovar o nome do responsável noutro sítio do registo', () => {
  assert.match(readFileSync(join(ROOT, 'scripts/doctor.test.mjs'), 'utf8'), /test\('real registry: no personal or company data'/, 'o teste de dados pessoais desapareceu ou mudou de nome');
  const limpa = runNodeTest(copyPackage(), 'scripts/doctor.test.mjs');
  assert.equal(limpa.status, 0, 'pré-condição: o doctor.test.mjs passa numa cópia limpa (com o fork no registo)\n' + limpa.out.slice(-1500));
  const casos = [
    ['outro repositório do responsável', (cs) => { cs.find((c) => c.id === 'ponytail').installDocs = 'https://github.com/' + GAUNTLET_FORK.split('/')[0] + '/ponytail#install'; }],
    ['o nome próprio num nome de componente', (cs) => { cs.find((c) => c.id === 'sdd').name = 'SDD skill (' + ['Ren', 'ato'].join('') + ')'; }],
  ];
  for (const [nome, f] of casos) {
    const dir = copyPackage();
    plantar(dir, f);
    assert.notEqual(runNodeTest(dir, 'scripts/doctor.test.mjs').status, 0, 'o doctor.test.mjs aceitou ' + nome);
  }
});
