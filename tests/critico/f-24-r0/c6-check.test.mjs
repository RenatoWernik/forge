// Ronda −1 do F-24 (#80), C6: a linha nova do `check.cjs --env`, «checkpoints: every active agent of painel.json saved its checkpoint less than 10 min ago».
// Oráculo: as mesmas fixtures do C5 (com nomes sem controlos), um projeto acabado de gerar, e o relógio FORGE_VIGIA_NOW_MS.
// O check corre na caixa do F-20a, com o espião: nenhuma ferramenta real, nenhuma rede além de 127.0.0.1:9.
// A ordem dos nomes dentro de «(stale: ...)» não é fixada pelo contrato: compara-se o conjunto.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as H from './helpers.mjs';

const limpar = [];
after(() => { for (const f of limpar) f(); });
const env = async (proj, ms = H.AGORA) => {
  const sb = H.caixa();
  limpar.push(() => H.rmSync(sb.dir, { recursive: true, force: true }));
  const r = await H.correCheck(proj, H.ambiente(sb, H.relogio(ms)));
  const l = H.linha(r, H.L_C6);
  assert.equal(l.length, 1, `a linha «${H.L_C6}» aparece ${l.length} vezes:\n` + r.linhas.filter((x) => /^(ok|FAIL)/.test(x)).join('\n').slice(0, 3000));
  return l[0];
};
const stale = (linha) => {
  const m = linha.match(/^FAIL {2}(.*) \(stale: (.*)\)$/);
  assert.ok(m && m[1] === H.L_C6, 'não é «FAIL  <linha> (stale: ...)»: ' + linha);
  return m[2].split(', ').sort();
};

test('C6: um projeto acabado de gerar, sem agentes, dá ok com «(no active agents)»', async () => {
  assert.equal(await env(await H.gerar()), `ok    ${H.L_C6} (no active agents)`);
});

test('C6: a fixture do C5 dá FAIL com (stale: dev-b 10 min, tester-c no checkpoint, critico-e 31 min)', async () => {
  const proj = await H.gerar();
  H.painel(proj, H.FIXTURE_C5(false));
  assert.deepEqual(stale(await env(proj)), ['critico-e 31 min', 'dev-b 10 min', 'tester-c no checkpoint']);
});

test('C6: agentes ativos frescos sem .checkpoints/orchestrator.md dão FAIL com «(.checkpoints/orchestrator.md missing)»', async () => {
  const proj = await H.gerar();
  H.painel(proj, [H.FIXTURE_C5()[0], { nome: 'dev-h', ticket: 'T8', estado: 'critico', min: 2, checkpoint: 'dev-h.md' }], { orq: null });
  assert.equal(await env(proj), `FAIL  ${H.L_C6} (.checkpoints/orchestrator.md missing)`);
});

test('C6: agentes ativos frescos com o orchestrator.md dão ok (nenhum alarme falso)', async () => {
  const proj = await H.gerar();
  H.painel(proj, [H.FIXTURE_C5()[0], H.FIXTURE_C5()[3], { nome: 'dev-h', ticket: 'T8', estado: 'critico', min: 2, checkpoint: 'dev-h.md' }]);
  assert.ok((await env(proj)).startsWith(`ok    ${H.L_C6}`));
});

test('C6: o relógio é FORGE_VIGIA_NOW_MS: o agente de 9 min fica ok agora e passa a stale 1 min depois', async () => {
  const proj = await H.gerar();
  H.painel(proj, [H.FIXTURE_C5()[0]]);
  assert.ok((await env(proj)).startsWith(`ok    ${H.L_C6}`));
  assert.deepEqual(stale(await env(proj, H.AGORA + H.MIN)), ['dev-a 10 min']);
});