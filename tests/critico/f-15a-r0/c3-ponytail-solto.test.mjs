// F-15a critério 3: o update da skill solta do ponytail copia só as PASTAS de skills/ (desde a v4.13.0 o upstream tem
// skills/plugin.json, que o `skills/*` de hoje deixa solto em ~/.claude/skills). Oráculo: asserção textual sobre todos os comandos
// do registo, nas 3 plataformas, e um ensaio real sem rede: um repositório git local com skills/plugin.json e as 6 pastas ponytail*
// substitui o URL do GitHub, e o comando impresso pelo doctor corre na shell desta plataforma com HOME, USERPROFILE, TEMP e
// CLAUDE_CONFIG_DIR em tmp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { registry, loadDoctor, fakeSys, LATEST_URLS, tmp, ponytailRepo, runCommands, dirsIn, PONYTAIL_SKILLS } from './helpers.mjs';

const PT_URL = 'https://github.com/DietrichGebert/ponytail';
const forPlatform = (m, k) => (Array.isArray(m) ? m : m?.[k] ?? []);

test('C3: nenhum comando do registo, em nenhuma plataforma, copia `skills/*` como ficheiros', () => {
  const maus = [];
  for (const c of registry().components) {
    for (const k of ['windows', 'macos', 'linux']) {
      for (const m of [c.install, c.update, ...c.installed.map((i) => i.update)]) {
        for (const cmd of forPlatform(m, k)) if (/skills\/\*(?!\/)/.test(cmd)) maus.push(`${c.id} ${k}: ${cmd.slice(0, 160)}`);
      }
    }
  }
  assert.deepEqual(maus, []);
});

const looseUpdate = async (home, env = {}) => {
  const { runDoctor } = await loadDoctor();
  const cfg = env.CLAUDE_CONFIG_DIR ?? join(home, '.claude');
  const sys = fakeSys({ platform: process.platform, home, env, files: { [join(cfg, 'skills', 'ponytail', 'SKILL.md')]: 'old text' }, urls: LATEST_URLS() });
  const pt = (await runDoctor({ components: registry().components }, sys)).components.find((c) => c.id === 'ponytail');
  assert.equal(pt.status, 'outdated', 'a skill solta desatualizada não ficou outdated');
  assert.ok(pt.command?.length, 'sem comando de update da skill solta');
  assert.ok(!pt.command.some((x) => x.includes('claude plugin')), 'skill solta não tem plugin para atualizar');
  return pt.command;
};
const runAll = (commands, repo, ctx) => runCommands(commands, PT_URL, repo, ctx);

test('C3 ensaio real: destino vazio → exatamente as 6 pastas ponytail*, cada uma com SKILL.md, e nenhum plugin.json', async () => {
  const home = tmp('critico-f15a-h-'), temp = tmp('critico-f15a-t-');
  runAll(await looseUpdate(home), ponytailRepo(), { home, temp });
  const dest = join(home, '.claude', 'skills');
  assert.deepEqual(dirsIn(dest), [...PONYTAIL_SKILLS].sort());
  for (const n of PONYTAIL_SKILLS) assert.ok(statSync(join(dest, n)).isDirectory() && existsSync(join(dest, n, 'SKILL.md')), n);
  assert.ok(!existsSync(join(dest, 'plugin.json')), 'plugin.json solto em ~/.claude/skills');
});

test('C3 ensaio real: com skills já instaladas, a cópia atualiza as ponytail*, preserva as outras e não deixa ficheiros soltos', async () => {
  const home = tmp('critico-f15a-h-'), temp = tmp('critico-f15a-t-');
  const dest = join(home, '.claude', 'skills');
  mkdirSync(join(dest, 'outra-skill'), { recursive: true });
  writeFileSync(join(dest, 'outra-skill', 'SKILL.md'), 'minha skill');
  mkdirSync(join(dest, 'ponytail'), { recursive: true });
  writeFileSync(join(dest, 'ponytail', 'SKILL.md'), 'old text');
  runAll(await looseUpdate(home), ponytailRepo(), { home, temp });
  assert.deepEqual(dirsIn(dest), [...PONYTAIL_SKILLS, 'outra-skill'].sort());
  assert.equal(readFileSync(join(dest, 'outra-skill', 'SKILL.md'), 'utf8'), 'minha skill', 'perda de dados: outra skill alterada');
  assert.match(readFileSync(join(dest, 'ponytail', 'SKILL.md'), 'utf8'), /name: ponytail/, 'a skill ponytail não foi atualizada');
  assert.ok(!existsSync(join(dest, 'ponytail', 'ponytail')), 'cópia aninhada: skills/ponytail/ponytail');
});
