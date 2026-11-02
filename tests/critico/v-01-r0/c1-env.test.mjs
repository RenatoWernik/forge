// V-01 critério C1 (isolamento e env), no corpus scripts/fixtures/executor/env: a suíte `sonda` (2 ficheiros) imprime e grava o env de cada
// unidade, a suíte `real` tem `"env": { "USERPROFILE": "@real" }`. Oráculo (spec §4.1): HOME, USERPROFILE e CLAUDE_CONFIG_DIR =
// <raiz-tmp>/<unidade>/home, TMP e TEMP = <raiz-tmp>/<unidade>/tmp, DISABLE_AUTOUPDATER=1, `@real` = o valor do processo do executor,
// e a <raiz-tmp> já não existe quando o executor sai. O executor é lançado com NODE_TEST_CONTEXT=child-v8 e DISABLE_AUTOUPDATER=0 no env:
// se os deixar passar, o node --test filho não corre nada (guarda em guardas.test.mjs) e as sondas não gravam.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { exigeExecutor, repo, tmp, tempPrivado, correr, saida, umResultado, unidade, lerJson, limpa } from './helpers.mjs';

after(limpa);

test('C1: cada unidade tem HOME, USERPROFILE e CLAUDE_CONFIG_DIR sob a raiz tmp do executor, DISABLE_AUTOUPDATER=1, sem NODE_TEST_CONTEXT herdado, @real recebe o valor do pai e a raiz tmp deixa de existir no fim', async () => {
  exigeExecutor();
  const d = repo('env'), pai = tmp('v01-pai-'), perfil = tmp('v01-perfil-');
  const r = await correr(d, ['--todas'], { env: { ...tempPrivado(), HOME: pai, USERPROFILE: perfil, CLAUDE_CONFIG_DIR: pai, NODE_TEST_CONTEXT: 'child-v8', DISABLE_AUTOUPDATER: '0' } });
  assert.equal(r.pendurado, false, saida(r));
  assert.equal(r.status, 0, saida(r));
  const res = umResultado(d).dados;
  const lidos = {};
  for (const f of ['sonda/a.fx.mjs', 'sonda/b.fx.mjs', 'real/r.fx.mjs']) {
    const u = unidade(res, f);
    assert.ok(u, `${f}: a unidade não está no ficheiro de resultados`);
    assert.equal(u.estado, 'pass', `${f}: ${u.estado}`);
    assert.equal(u.pass, 1, `${f}: pass ${u.pass} (NODE_TEST_CONTEXT herdado faz o filho não correr nada)`);
    const g = join(d, '.sonda', `env-${f.replaceAll('/', '_')}.json`);
    assert.ok(existsSync(g), `${f}: a sonda não correu (NODE_TEST_CONTEXT herdado?)`);
    const e = lerJson(g);
    lidos[f] = e;
    assert.equal(e.DISABLE_AUTOUPDATER, '1', `${f}: DISABLE_AUTOUPDATER=${e.DISABLE_AUTOUPDATER}`);
    for (const k of ['HOME', 'CLAUDE_CONFIG_DIR', 'TMP', 'TEMP']) assert.equal(typeof e[k], 'string', `${f}: ${k} em falta`);
    assert.equal(e.CLAUDE_CONFIG_DIR, e.HOME, `${f}: CLAUDE_CONFIG_DIR ≠ HOME`);
    assert.equal(basename(e.HOME), 'home', `${f}: HOME=${e.HOME} não é <raiz-tmp>/<unidade>/home`);
    assert.equal(e.TEMP, e.TMP, `${f}: TEMP ≠ TMP`);
    assert.equal(basename(e.TMP), 'tmp', `${f}: TMP=${e.TMP} não é <raiz-tmp>/<unidade>/tmp`);
    assert.equal(dirname(e.TMP), dirname(e.HOME), `${f}: TMP e HOME não estão na mesma pasta da unidade`);
    assert.notEqual(e.HOME, pai, `${f}: HOME é o do executor`);
    assert.ok(readFileSync(join(d, u.tap), 'utf8').includes('SONDA {'), `${f}: o tap não tem o env impresso pela sonda`);
  }
  assert.equal(lidos['sonda/a.fx.mjs'].USERPROFILE, lidos['sonda/a.fx.mjs'].HOME, 'sonda: USERPROFILE não é o HOME da unidade');
  assert.equal(lidos['sonda/b.fx.mjs'].USERPROFILE, lidos['sonda/b.fx.mjs'].HOME, 'sonda: USERPROFILE não é o HOME da unidade');
  assert.equal(lidos['real/r.fx.mjs'].USERPROFILE, perfil, '@real: USERPROFILE não é o do processo do executor');
  const raizes = new Set(Object.values(lidos).map((e) => dirname(dirname(e.HOME))));
  assert.equal(raizes.size, 1, `as unidades não partilham uma raiz tmp: ${[...raizes].join(' | ')}`);
  assert.equal(new Set(Object.values(lidos).map((e) => dirname(e.HOME))).size, 3, 'duas unidades com a mesma pasta <unidade>');
  const [raizTmp] = raizes;
  assert.equal(existsSync(raizTmp), false, `a raiz tmp ${raizTmp} ainda existe depois de o executor sair`);
});