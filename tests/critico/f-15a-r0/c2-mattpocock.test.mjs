// F-15a critério 2 (D7): o Matt Pocock é detetado em qualquer marketplace (mattpocock-skills@<mkt>) e atualizado pelo marketplace
// de onde veio; sem nenhum, a instalação nova usa o marketplace `mattpocock`. Oráculo: a tabela dos 5 casos × 3 plataformas,
// sobre o REGISTO REAL (components.json) com o sys falso. Mais: armadilhas de prefixo (falso «instalado») e ids com caracteres
// de shell (injeção num comando montado com um id lido: reprova sempre).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { registry, loadDoctor, fakeSys, LATEST_URLS, PLATFORMS, byGroup, commandsOf, unsafeAt } from './helpers.mjs';

const PJ = join('/h', '.claude', 'plugins', 'installed_plugins.json');
const plugins = (ids) => JSON.stringify({ version: 2, plugins: Object.fromEntries(Object.entries(ids).map(([id, v]) => [id, [{ scope: 'user', version: v, installPath: '/p/' + id.length }]])) });
const run = async (platform, files) => {
  const { runDoctor } = await loadDoctor();
  return runDoctor({ components: registry().components }, fakeSys({ platform, files, urls: LATEST_URLS() }));
};
const mp = (r) => byGroup(r, 'matt-pocock');
const cmds = (r) => mp(r).flatMap((c) => c.command ?? []);
const UPD = (mkt) => 'claude plugin update mattpocock-skills@' + mkt;
const PAIR = ['claude plugin marketplace add mattpocock/skills', 'claude plugin install mattpocock-skills@mattpocock'];

for (const [platform] of PLATFORMS) {
  test(`C2 caso 1 (${platform}): só mattpocock-skills@mattpocock → instalado, nenhum missing; desatualizado, o update é \`${UPD('mattpocock')}\``, async () => {
    const atual = await run(platform, { [PJ]: plugins({ 'mattpocock-skills@mattpocock': '1.3.2' }) });
    assert.ok(mp(atual).length > 0, 'o grupo matt-pocock desapareceu do relatório');
    assert.deepEqual(mp(atual).filter((c) => c.status === 'missing').map((c) => c.id), [], 'falso missing com o marketplace mattpocock');
    assert.ok(mp(atual).some((c) => c.installed && c.status === 'ok'), 'instalado na versão mais recente e não ficou ok');
    assert.deepEqual(cmds(atual), []);
    const velho = await run(platform, { [PJ]: plugins({ 'mattpocock-skills@mattpocock': '1.2.3' }) });
    assert.deepEqual(mp(velho).filter((c) => c.status === 'missing').map((c) => c.id), []);
    assert.deepEqual(cmds(velho), [UPD('mattpocock')]);
  });

  test(`C2 caso 2 (${platform}): só @claude-plugins-official → instalado; desatualizado, o update é \`${UPD('claude-plugins-official')}\``, async () => {
    const velho = await run(platform, { [PJ]: plugins({ 'mattpocock-skills@claude-plugins-official': '1.2.3' }) });
    assert.deepEqual(mp(velho).filter((c) => c.status === 'missing').map((c) => c.id), []);
    assert.ok(mp(velho).some((c) => c.installed && c.status === 'outdated'));
    assert.deepEqual(cmds(velho), [UPD('claude-plugins-official')]);
  });

  test(`C2 caso 3 (${platform}): os dois → os dois reportados, nenhum missing, cada um com o seu update`, async () => {
    const r = await run(platform, { [PJ]: plugins({ 'mattpocock-skills@mattpocock': '1.2.3', 'mattpocock-skills@claude-plugins-official': '1.2.4' }) });
    assert.deepEqual(mp(r).filter((c) => c.status === 'missing').map((c) => c.id), []);
    assert.deepEqual([...new Set(cmds(r))].sort(), [UPD('claude-plugins-official'), UPD('mattpocock')].sort());
    const txt = JSON.stringify(mp(r));
    for (const v of ['1.2.3', '1.2.4']) assert.ok(txt.includes(v), 'a versão ' + v + ' de uma das instalações não aparece no relatório');
    // um atual e outro velho: só o velho leva update
    const misto = await run(platform, { [PJ]: plugins({ 'mattpocock-skills@mattpocock': '1.3.2', 'mattpocock-skills@claude-plugins-official': '1.2.4' }) });
    assert.deepEqual(cmds(misto), [UPD('claude-plugins-official')]);
    assert.ok(JSON.stringify(mp(misto)).includes('1.3.2') && JSON.stringify(mp(misto)).includes('1.2.4'), 'uma das instalações não foi reportada');
  });

  test(`C2 caso 4 (${platform}): nenhum → missing, com o par marketplace add mattpocock/skills + install @mattpocock`, async () => {
    for (const files of [{}, { [PJ]: plugins({ 'ponytail@ponytail': '5.3.3' }) }]) {
      const r = await run(platform, files);
      const miss = mp(r).filter((c) => c.status === 'missing');
      assert.ok(miss.length > 0, 'sem Matt Pocock e não ficou missing');
      assert.deepEqual([...new Set(miss.flatMap((c) => c.command ?? []))], PAIR);
      assert.ok(!JSON.stringify(cmds(r)).includes('claude-plugins-official'), 'a instalação nova não pode usar o claude-plugins-official');
    }
  });

  test(`C2 caso 5 (${platform}): installed_plugins.json corrompido → unknown, sem comando, e o relatório sobrevive`, async () => {
    const r = await run(platform, { [PJ]: '{not json' });
    assert.ok(mp(r).length > 0);
    for (const c of mp(r)) { assert.equal(c.status, 'unknown', c.id); assert.ok(!c.command?.length, c.id + ' com comando'); }
  });

  test(`C2 armadilha (${platform}): um plugin de nome parecido (mattpocock-skills-fork@mattpocock, xmattpocock-skills@mattpocock) não conta como instalado`, async () => {
    const r = await run(platform, { [PJ]: plugins({ 'mattpocock-skills-fork@mattpocock': '9.9.9', 'xmattpocock-skills@mattpocock': '9.9.9' }) });
    assert.ok(mp(r).some((c) => c.status === 'missing'), 'um nome parecido contou como Matt Pocock instalado');
    assert.ok(!JSON.stringify(mp(r)).includes('9.9.9'), 'a versão do plugin parecido entrou no relatório');
  });
}

// Ids lidos do installed_plugins.json com caracteres de shell: o comando impresso nunca os deixa ser interpretados
const PS = ["mk$(Write-Warning critico7f3)", "mk'; Write-Warning critico7f3; '", 'mk"; Write-Warning critico7f3; "', 'mk\nWrite-Warning critico7f3', 'mk&Write-Warning critico7f3', 'mk|Write-Warning critico7f3'];
const SH = ['mk$(touch critico7f3)', 'mk`touch critico7f3`', "mk'; touch critico7f3; '", 'mk"; touch critico7f3; "', 'mk; touch critico7f3', 'mk && touch critico7f3', 'mk|touch critico7f3', 'mk\ntouch critico7f3'];
for (const [platform, key] of PLATFORMS) {
  test(`reprova sempre (${platform}): um id de marketplace com caracteres de shell nunca vira código no comando impresso`, async () => {
    const [payloads, token, dialect] = key === 'windows' ? [PS, 'Write-Warning critico7f3', 'ps'] : [SH, 'touch critico7f3', 'sh'];
    const maus = [];
    for (const p of payloads) {
      const r = await run(platform, { [PJ]: plugins({ ['mattpocock-skills@' + p]: '1.0.0' }) });
      assert.ok(mp(r).length > 0, 'o relatório perdeu o grupo matt-pocock com o id ' + JSON.stringify(p));
      for (const c of commandsOf(r)) if (unsafeAt(c, token, dialect).length) maus.push(`${JSON.stringify(p)} → ${c}`);
    }
    assert.deepEqual(maus, []);
  });
}

test('controlo do oráculo de injeção: o detetor de contexto apanha o id colado sem aspas e aceita-o entre aspas simples', () => {
  assert.ok(unsafeAt("claude plugin update 'mattpocock-skills@mk'; Write-Warning critico7f3; ''", 'Write-Warning critico7f3', 'ps').length > 0, 'aspas simples sem escapar a aspa do id');
  assert.ok(unsafeAt('claude plugin update mattpocock-skills@mk; Write-Warning critico7f3', 'Write-Warning critico7f3', 'ps').length > 0, 'id colado sem aspas');
  assert.ok(unsafeAt('claude plugin update "mattpocock-skills@mk$(Write-Warning critico7f3)"', 'Write-Warning critico7f3', 'ps').length > 0);
  assert.deepEqual(unsafeAt("claude plugin update 'mattpocock-skills@mk''; Write-Warning critico7f3; '''", 'Write-Warning critico7f3', 'ps'), []);
  assert.ok(unsafeAt('claude plugin update mattpocock-skills@mk$(touch critico7f3)', 'touch critico7f3', 'sh').length > 0);
  assert.deepEqual(unsafeAt("claude plugin update 'mattpocock-skills@mk'\\''; touch critico7f3; '\\'''", 'touch critico7f3', 'sh'), []);
});
